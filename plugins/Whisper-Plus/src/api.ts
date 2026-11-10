/**
 * 内核接口封装
 *
 * 传输与包络归一见 `siyuan-kernel-client`，这里只挑本插件用到的接口
 */

import { kernelPost } from "siyuan-kernel-client";

export type ApiRes<T = null> = {
  code: number;
  msg: string;
  data: T;
};

/**
 * POST 一个 JSON 请求体
 *
 * 不抛错：失败时返回 `code !== 0` 的包络（内核业务失败原样透传，未拿到内核应答时
 * `code` 为 -1 且带 `transportFailed: true`）
 */
export async function post<T = null>(url: string, body: object): Promise<ApiRes<T>> {
  return await kernelPost<T>(url, body);
}

export const getLocalStorageVal = (key: string) => post<unknown>("/api/storage/getLocalStorageVal", { key });

export const setLocalStorageVal = (key: string, val: unknown) => post<unknown>("/api/storage/setLocalStorageVal", { key, val });

export const removeLocalStorageVal = (key: string) => post("/api/storage/removeLocalStorageVal", { key });

export const removeFile = (path: string) => post("/api/file/removeFile", { path });

/** 读取思源「页签融合至顶栏」状态（appearance.hideToolbar） */
export function getHideToolbar(): boolean {
  const appearance = window.siyuan?.config?.appearance as { hideToolbar?: boolean } | undefined;
  return !!appearance?.hideToolbar;
}

/** 切换思源「页签融合至顶栏」（appearance.hideToolbar），由内核广播同步布局 */
export function setHideToolbar(hideToolbar: boolean): Promise<ApiRes<{ hideToolbar: boolean } | null>> {
  const appearance = window.siyuan?.config?.appearance;
  if (!appearance) {
    return Promise.resolve({ code: 500, msg: "appearance config unavailable", data: null });
  }
  return post<{ hideToolbar: boolean } | null>("/api/setting/setAppearance", {
    ...appearance,
    hideToolbar,
  });
}
