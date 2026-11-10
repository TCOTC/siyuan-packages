/**
 * 思源内核 HTTP 封装（本包的接口形状与日志口径）
 *
 * 传输与包络归一在 `siyuan-kernel-client`：那边负责「拿到内核包络 / 没拿到」的区分，
 * 这里只保留本包用到的接口封装与日志文案
 */

import { getFileBlob as readFileBlob, getFileText, kernelPost, kernelPostForm, type KernelApiResponse } from "siyuan-kernel-client";
import { i18n } from "./i18n";
import type { Logger } from "./logger";

export type { GetFileResult, KernelApiResponse } from "siyuan-kernel-client";

/**
 * POST 一个 JSON 请求体；不抛错，失败时返回失败包络
 *
 * 名称沿用本包原先的调用点，语义是「拿到内核包络」，与请求本身是否同步无关
 */
export const fetchSyncPost = kernelPost;

/**
 * `/api/file/putFile`：HTTP Multipart
 * - path：工作空间路径下的文件路径
 * - isDir：为 true 时仅创建文件夹，忽略 file
 * - modTime：最近访问和修改时间，Unix 毫秒时间戳（与内核 millisecond2Time 一致）；默认当前时间
 * - file：上传的文件（isDir 为 true 时不应依赖此字段）
 * 返回值：{ code, msg, data }
 */
export interface PutFileParams {
  path: string;
  isDir?: boolean;
  modTime?: number;
  file?: Blob;
}

export async function putFile(params: PutFileParams): Promise<KernelApiResponse> {
  const formData = new FormData();
  formData.append("path", params.path);
  formData.append("isDir", String(params.isDir ?? false));
  formData.append("modTime", String(params.modTime ?? Date.now()));
  if (params.file && !(params.isDir ?? false)) {
    const fileName = params.path.split("/").pop() || "file";
    formData.append("file", params.file, fileName);
  }
  return kernelPostForm("/api/file/putFile", formData);
}

/** `/api/file/getFile`：200 为文件正文，202 为 JSON 异常体（含 code / msg） */
export const getFile = getFileText;

/** `/api/file/getFile`：200 为文件正文（按二进制读取为 Blob），失败时写日志并返回 null */
export async function getFileBlob(path: string, log: Logger): Promise<Blob | null> {
  const result = await readFileBlob(path);
  if (result.ok) {
    return result.blob;
  }
  log.warn(`Failed to read [${path}]: code=[${result.code}], msg=[${result.msg}]`);
  return null;
}

/** 删除文件或目录；成功时静默（调用方多为临时文件清理），只在失败时记一行 */
export async function removeFile(path: string, log: Logger): Promise<boolean> {
  const response = await fetchSyncPost("/api/file/removeFile", { path });
  if (response.code !== 0) {
    log.warn(`Failed to remove [${path}]: code=[${response.code}], msg=[${response.msg}]`);
    return false;
  }
  return true;
}

export interface ReadDirEntry {
  isDir: boolean;
  isSymlink: boolean;
  name: string;
  updated: number;
}

/**
 * 目录是否存在
 *
 * - `exists`：内核确认目录存在
 * - `missing`：内核明确回答该目录不可用（不存在返回 404、路径越权返回 403），属正常结果，调用方可以缓存
 * - `unknown`：请求没得到内核的应答（不可达等），状态未知，调用方不应据此判定「不存在」，也不应缓存
 */
export type DirectoryPresence = "exists" | "missing" | "unknown";

/** 询问工作空间内的目录是否存在（走 `/api/file/readDir`） */
export async function directoryPresence(path: string): Promise<DirectoryPresence> {
  const response = await fetchSyncPost("/api/file/readDir", { path });
  if (response.code === 0) {
    return "exists";
  }
  return response.transportFailed === true ? "unknown" : "missing";
}

/**
 * 读取目录；失败时写日志并返回 null
 */
export async function readDir(path: string, log: Logger): Promise<ReadDirEntry[] | null> {
  const response = await fetchSyncPost("/api/file/readDir", { path });
  if (response.code !== 0 || !Array.isArray(response.data)) {
    log.warn(i18n.readDirFailed, response.msg);
    return null;
  }
  return response.data as ReadDirEntry[];
}

export async function unzipFile(zipPath: string, extractPath: string, log: Logger): Promise<boolean> {
  const response = await fetchSyncPost("/api/archive/unzip", {
    zipPath,
    path: extractPath,
  });
  if (response.code !== 0) {
    log.warn(`Failed to unzip file [${zipPath}] -> [${extractPath}]: code=[${response.code}], msg=[${response.msg}]`);
    return false;
  }

  return true;
}

/** `/api/archive/zip`：把工作空间内的目录打包为 ZIP */
export async function zipFile(path: string, zipPath: string, log: Logger): Promise<boolean> {
  log.info(`Zipping: [${path}] -> [${zipPath}]`);
  const response = await fetchSyncPost("/api/archive/zip", { path, zipPath });
  if (response.code !== 0) {
    log.warn(`Failed to zip [${path}] -> [${zipPath}]: code=[${response.code}], msg=[${response.msg}]`);
    return false;
  }

  return true;
}

/**
 * `/api/bazaar/installLocalBazaarPackage`：上传 ZIP 交由内核安装集市包
 *
 * 内核负责校验兼容性、整目录替换与缓存清理，并在安装完成后向所有前端推送集市变更，
 * 因此由内核落盘的集市包会在主窗口与设置窗口同步刷新
 *
 * `overwrite` 固定为 true：目标目录已存在且非空时直接覆盖，不覆盖则由内核返回 `package-exists`
 */
export async function installLocalBazaarPackage(blob: Blob, fileName: string, frontend: string): Promise<KernelApiResponse> {
  const formData = new FormData();
  formData.append("file", blob, fileName);
  formData.append("frontend", frontend);
  formData.append("overwrite", "true");
  return kernelPostForm("/api/bazaar/installLocalBazaarPackage", formData);
}
