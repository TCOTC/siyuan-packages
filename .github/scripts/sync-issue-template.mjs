#!/usr/bin/env node
/**
 * 把本仓的 .github/scripts/release-repo-issue-config.yml 原样写入每个收录仓库的
 * .github/ISSUE_TEMPLATE/config.yml。
 *
 * 为什么需要它：收录仓库的仓库树里只有 README，源码与反馈都在本仓。用户顺着集市卡片点进收录仓库的
 * Issues 标签时，会落到一个「写了也没人跟进」的地方 —— 那里仅有的几条历史 issue 也不会被看见。
 * config.yml 关掉空白 issue、只留跳回本仓的外链，用户除了「去源码仓库」没有别的入口可选。
 *
 * 目标仓库不在这里硬编码：走 kit 的 listPackages + resolvePackage 取合成清单的 url，
 * 与发布链路同一个推导来源（"哪个包发到哪个仓库" 全仓只此一处）。该模块只 import node: 内置模块，
 * 所以本流程不需要 pnpm install —— 也别让它开始依赖 vite，否则这里立刻断。
 *
 * 幂等：先按 git blob sha 比对，一致就跳过（不产生空提交）。随时可以重跑。
 *
 * 本地用法（GH_TOKEN 需要能写全部收录仓库的 contents，`gh auth token` 即可）：
 *   node .github/scripts/sync-issue-template.mjs --dry-run
 *   node .github/scripts/sync-issue-template.mjs --only move-doc,Whisper
 */
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listPackages, resolvePackage } from "../../kit/src/resolve.ts";

const ROOT = process.cwd();
/**
 * 唯一真相源：改它并推 main，全部收录仓库跟着变。
 * 与脚本同目录，免得被当成本仓自己的 issue 模板。
 */
const TEMPLATE_FILE = ".github/scripts/release-repo-issue-config.yml";
/** 在收录仓库里的落点。名字是 GitHub 规定的，不能换。 */
const TARGET_PATH = ".github/ISSUE_TEMPLATE/config.yml";
const COMMIT_MESSAGE = "chore: issue 入口指向源码仓库";
const API = "https://api.github.com";
const TOKEN = process.env.GH_TOKEN ?? "";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run") || (process.env.INPUT_DRY_RUN ?? "").toLowerCase() === "true";
const only = readOnlyArg();

const STATE_LABELS = {
  created: "新建",
  updated: "更新",
  unchanged: "已是最新",
  archived: "已归档，跳过",
  "would-created": "将新建",
  "would-updated": "将更新",
  failed: "失败",
};

/** 算作「这次真的动了」的状态；dry-run 的 would-* 也要计入，否则汇总会显示成改动 0 个。 */
const CHANGED_STATES = new Set(["created", "updated", "would-created", "would-updated"]);

function readOnlyArg() {
  const index = argv.indexOf("--only");
  if (index === -1) {
    return null;
  }
  const value = argv[index + 1] ?? "";
  if (value === "" || value.startsWith("--")) {
    throw new Error("--only 后面要跟包名，逗号分隔");
  }
  return new Set(
    value
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

/** 模板本身的小体检：推错文件比不推更糟，坏内容会立刻关掉 22 个仓库的 issue 入口。 */
function loadTemplate() {
  const content = readFileSync(join(ROOT, TEMPLATE_FILE));
  if (content.length >= 3 && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf) {
    throw new Error(`${TEMPLATE_FILE} 带 UTF-8 BOM，推出去会在文件开头留一串不可见字符`);
  }
  // fatal: true —— 非 UTF-8 直接抛，不要静默塞进乱码
  const text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  for (const required of ["blank_issues_enabled:", "contact_links:"]) {
    if (!text.includes(required)) {
      throw new Error(`${TEMPLATE_FILE} 缺 ${required}，改错文件了？`);
    }
  }
  return content;
}

/** 收录仓库列表。撞车即报错：一个仓库只能承载一个包，写什么都是错的。 */
function collectTargets() {
  const byTarget = new Map();
  for (const entry of listPackages(ROOT)) {
    const pkg = resolvePackage(entry.root, entry.kind);
    const url = typeof pkg.manifest.url === "string" ? pkg.manifest.url : "";
    if (url === "") {
      throw new Error(`${pkg.name} 的合成清单没有 url，无法确定收录仓库`);
    }
    const target = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
    if (!/^[^/]+\/[^/]+$/.test(target)) {
      throw new Error(`${pkg.name} 的清单 url 不是仓库地址：${url}`);
    }
    const names = byTarget.get(target) ?? [];
    names.push(pkg.name);
    byTarget.set(target, names);
  }

  const all = [];
  for (const [target, names] of byTarget) {
    if (names.length > 1) {
      throw new Error(`${target} 被 ${names.length} 个包指向：${names.join("、")}`);
    }
    all.push({ target, name: names[0] });
  }
  if (only === null) {
    return all;
  }
  const selected = all.filter((item) => only.has(item.name));
  if (selected.length === 0) {
    throw new Error(`--only 没有匹配到任何包：${[...only].join("、")}`);
  }
  return selected;
}

/** 与 GitHub 存的 blob sha 同算法，用来在不下载文件的情况下判断「内容是否已经一样」。 */
function blobSha(content) {
  return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
}

async function api(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${TOKEN}`,
      "user-agent": "siyuan-packages-issue-template",
      "x-github-api-version": "2022-11-28",
      ...init.headers,
    },
  });
  const text = await response.text();
  let body = null;
  if (text !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  if (response.status === 404) {
    return { status: 404, body: null };
  }
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${response.status} ${body?.message ?? text}`);
  }
  return { status: response.status, body };
}

async function readRemote(target, branch) {
  const response = await fetch(`${API}/repos/${target}/contents/${TARGET_PATH}?ref=${encodeURIComponent(branch)}`, {
    headers: {
      accept: "application/vnd.github.raw",
      authorization: `Bearer ${TOKEN}`,
      "user-agent": "siyuan-packages-issue-template",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`读 ${target} 的 ${TARGET_PATH} → ${response.status}`);
  }
  return await response.text();
}

function sameText(content, remoteText) {
  if (remoteText === null) {
    return false;
  }
  // 换行归一后再比一次：别为了 CRLF / LF 的差别造一个空提交
  return content.toString("utf8").replace(/\r\n/g, "\n") === remoteText.replace(/\r\n/g, "\n");
}

async function syncOne(item, content) {
  const repo = (await api(`/repos/${item.target}`)).body;
  // 归档仓库的 Issues 是只读的：写不进去，也没必要写
  if (repo.archived === true) {
    return { state: "archived" };
  }
  const branch = typeof repo.default_branch === "string" && repo.default_branch !== "" ? repo.default_branch : "main";
  const current = await api(`/repos/${item.target}/contents/${TARGET_PATH}?ref=${encodeURIComponent(branch)}`);
  const remote = current.body;
  const exists = remote !== null;

  if (exists && remote.sha === blobSha(content)) {
    return { state: "unchanged" };
  }
  if (exists && sameText(content, await readRemote(item.target, branch))) {
    return { state: "unchanged" };
  }

  const state = exists ? "updated" : "created";
  if (dryRun) {
    return { state: `would-${state}` };
  }

  const payload = { message: COMMIT_MESSAGE, content: content.toString("base64"), branch };
  if (exists) {
    payload.sha = remote.sha;
  }
  await api(`/repos/${item.target}/contents/${TARGET_PATH}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { state };
}

function writeSummary(results) {
  const rows = ["| 收录仓库 | 包 | 结果 |", "| --- | --- | --- |"];
  for (const result of results) {
    const label = STATE_LABELS[result.state] ?? result.state;
    const detail = result.reason === undefined ? label : `${label}：${String(result.reason).replace(/\|/g, "\\|")}`;
    rows.push(`| ${result.target} | ${result.name} | ${detail} |`);
  }

  const failed = results.filter((result) => result.state === "failed").length;
  // dry-run 也必须有计数，否则「22 个仓库全部待建」会显示成「改动 0 个」，看起来像什么都没干
  const changed = results.filter((result) => CHANGED_STATES.has(result.state)).length;
  const head = dryRun ? "（dry-run，未写入）" : "";
  const tail = failed === 0 ? `共 ${results.length} 个收录仓库，改动 ${changed} 个。` : `共 ${results.length} 个收录仓库，改动 ${changed} 个，失败 ${failed} 个。`;

  const markdown = `${head}\n\n${rows.join("\n")}\n\n${tail}`;
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile !== undefined && summaryFile !== "") {
    appendFileSync(summaryFile, `${markdown}\n`);
  }
  console.log(tail);
}

async function main() {
  if (TOKEN === "") {
    throw new Error("缺少 GH_TOKEN：写收录仓库需要 contents: write 的 PAT（workflow 里是 secrets.PUBLISH_TOKEN）");
  }

  const content = loadTemplate();
  const targets = collectTargets();
  const results = [];

  // 串行：日志顺序与仓库顺序一致，也不至于撞 GitHub 的并发写限制
  for (const item of targets) {
    try {
      const { state } = await syncOne(item, content);
      results.push({ ...item, state });
      console.log(`- ${item.target}（${item.name}）：${STATE_LABELS[state] ?? state}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      results.push({ ...item, state: "failed", reason });
      console.error(`- ${item.target}（${item.name}）：失败 ${reason}`);
    }
  }

  writeSummary(results);
  if (results.some((result) => result.state === "failed")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  // 只打消息：栈对「哪个包/哪个仓库写不进去」毫无帮助，真正的定位信息已经在里面
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
