/**
 * 发布标签的格式定义：`release/<YYYYMMDD>-<HHmmss>`（本地时间）。
 *
 * 时间戳只用来保证唯一 —— 同一天可能发多个批次。判断「上一个标签」靠 git 的
 * creatordate 排序（见 detect-packages.mjs），与标签名的字典序无关，所以这里
 * 不追求可解析性，只要不重复、不跨目录（名字里不能再出现 `/`，否则
 * `refs/tags/release/*` 匹配不到）。
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const TAG_PREFIX = "release/";

const pad = (value, width = 2) => String(value).padStart(width, "0");

/** 把时刻格式化成标签名。 */
export function formatTag(date) {
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${TAG_PREFIX}${day}-${time}`;
}

/**
 * 判断当前文件是不是被直接执行（而不是被 import）。
 *
 * Windows 的盘符大小写不统一，所以比较前统一小写；两个脚本共用它，
 * 避免各自实现一份「入口判断」。
 */
export function isEntryPoint(metaUrl) {
  const entry = process.argv[1];
  if (typeof entry !== "string") {
    return false;
  }
  return pathToFileURL(resolve(entry)).href.toLowerCase() === metaUrl.toLowerCase();
}
