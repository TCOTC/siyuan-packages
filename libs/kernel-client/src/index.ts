/**
 * 思源内核 HTTP 封装的共享层
 *
 * 内核接口一律以 HTTP 200 返回业务包络 `{ code, msg, data }`，`code !== 0` 表示业务失败。
 * 这里只做「传输 + 包络归一」，不含任何业务语义：
 *
 * - 网络错误、连接被拒、响应不是内核包络（代理错误页等）都折成 `transportFailed: true`，
 *   与内核给出的业务失败区分开 —— 前者值得重试，后者重试必然复现。
 * - 所有函数都不抛错，调用方按返回值分支。需要抛错语义的（如批处理失败即中止）在包内自行包装。
 *
 * 刻意**不**基于宿主导出的 `fetchPost` / `fetchSyncPost`：它们只在宿主里存在
 * （`siyuan` 包只有类型声明），且带 `app` 参数注入、401 自动刷新、事务失败提示等宿主行为；
 * 用它们的插件继续用自己的封装，这里的实现只服务直接走 `fetch` 的场景。
 */

/** 内核响应包络 */
export interface KernelApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
  /**
   * 请求未得到内核的应答包络（断网、连接被拒、响应不可解析、非内核包络的非 2xx 响应等），
   * 用于与内核返回的业务错误区分，也决定调用方是否值得重传
   */
  transportFailed?: boolean;
}

/** 失败包络（`data` 为 `never`，可赋给任意 `KernelApiResponse<T>`） */
export type KernelFailure = KernelApiResponse<never>;

/** 异常转文本，用于返回给调用方的 msg 与日志 */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 构造失败包络
 *
 * @param msg 失败原因
 * @param transportFailed 是否属于「没拿到内核应答」，调用方可据此决定是否重试
 */
export function kernelFailure(msg: string, transportFailed = false): KernelFailure {
  const failure: KernelFailure = { code: -1, msg, data: null as never };
  return transportFailed ? { ...failure, transportFailed: true } : failure;
}

/**
 * 非 2xx 响应
 *
 * 内核的接口一律以 HTTP 200 返回业务包络，因此非 2xx 通常意味着请求没走到内核（代理或网关的错误页、
 * 内核尚未就绪、连接被中断）。这里先尝试把响应体按内核包络解析：能解析出非 0 的 `code` 时按业务失败
 * 返回，否则置 `transportFailed`，让调用方按可重传处理
 */
export async function httpFailure(response: Response): Promise<KernelApiResponse> {
  const fallback = `HTTP error: ${response.status} ${response.statusText}`;
  try {
    const body = (await response.json()) as KernelApiResponse | null;
    if (body !== null && typeof body === "object" && typeof body.code === "number" && body.code !== 0) {
      return {
        code: body.code,
        msg: typeof body.msg === "string" && body.msg !== "" ? body.msg : fallback,
        data: body.data,
      };
    }
  } catch {
    // 响应体不是内核的 JSON 包络（如代理返回的 HTML 错误页）
  }
  return kernelFailure(fallback, true);
}

/** POST 一个 JSON 请求体；不抛错，失败时返回失败包络 */
export async function kernelPost<T = unknown>(url: string, data?: object): Promise<KernelApiResponse<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data ?? {}),
    });
    if (!response.ok) {
      // 内核响应的 data 形状由调用方按接口自行断言，这里只能给出包络
      return (await httpFailure(response)) as KernelApiResponse<T>;
    }
    return (await response.json()) as KernelApiResponse<T>;
  } catch (error) {
    return kernelFailure(errorText(error), true);
  }
}

/**
 * POST 一个 multipart 请求体（文件上传类接口）
 *
 * `form` 由调用方构造：多文件接口的字段名（`file` / `file[]`）与附加字段各不相同
 */
export async function kernelPostForm<T = unknown>(url: string, form: FormData): Promise<KernelApiResponse<T>> {
  try {
    const response = await fetch(url, { method: "POST", body: form });
    if (!response.ok) {
      return (await httpFailure(response)) as KernelApiResponse<T>;
    }
    return (await response.json()) as KernelApiResponse<T>;
  } catch (error) {
    return kernelFailure(errorText(error), true);
  }
}

/** `/api/file/getFile` 的文本读取结果 */
export type GetFileResult = { ok: true; content: string } | { ok: false; code: number; msg: string };

/**
 * 读取工作空间内的文本文件
 *
 * 该接口成功时直接返回文件正文，失败时返回 202 加 JSON 错误体（而不是业务包络）
 */
export async function getFileText(path: string): Promise<GetFileResult> {
  try {
    const response = await fetch("/api/file/getFile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path }),
    });
    if (response.status === 200) {
      return { ok: true, content: await response.text() };
    }
    if (response.status === 202) {
      const body = (await response.json()) as KernelApiResponse | null;
      return {
        ok: false,
        code: body && typeof body.code === "number" ? body.code : -1,
        msg: body && typeof body.msg === "string" ? body.msg : "",
      };
    }
    return { ok: false, code: -1, msg: `HTTP error: ${response.status} ${response.statusText}` };
  } catch (error) {
    return { ok: false, code: -1, msg: errorText(error) };
  }
}

/** `/api/file/getFile` 的二进制读取结果 */
export type GetFileBlobResult = { ok: true; blob: Blob } | { ok: false; code: number; msg: string };

/**
 * 按二进制读取工作空间内的文件
 *
 * 资源在云端未下载到本地时同样返回 202，调用方应按「跳过」而非「异常」处理
 */
export async function getFileBlob(path: string): Promise<GetFileBlobResult> {
  try {
    const response = await fetch("/api/file/getFile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path }),
    });
    if (response.status === 200) {
      return { ok: true, blob: await response.blob() };
    }
    if (response.status === 202) {
      const body = (await response.json()) as KernelApiResponse | null;
      return {
        ok: false,
        code: body && typeof body.code === "number" ? body.code : -1,
        msg: body && typeof body.msg === "string" ? body.msg : "",
      };
    }
    return { ok: false, code: -1, msg: `HTTP error: ${response.status} ${response.statusText}` };
  } catch (error) {
    return { ok: false, code: -1, msg: errorText(error) };
  }
}
