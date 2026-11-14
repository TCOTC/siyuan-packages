#!/usr/bin/env node
/**
 * 把本仓的 .github/scripts/release-repo-issue-config.yml 按包名渲染后，写进每个收录仓库的
 * .github/ISSUE_TEMPLATE/config.yml。
 *
 * 为什么需要它：收录仓库的仓库树里只有 README，源码与反馈都在本仓。用户顺着集市卡片点进收录仓库的
 * Issues 标签时，会落到一个「写了也没人跟进」的地方 —— 那里仅有的几条历史 issue 也不会被看见。
 * config.yml 关掉空白 issue、只留跳回本仓的外链（预填 `[包名] ` 标题），用户除了
 * 「去源码仓库」没有别的入口可选，而到了那一头也不用再说明是哪个包。
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
/** 允许用环境变量覆盖：GitHub Actions 自带 GITHUB_API_URL，写死会让它失去意义。 */
const API = process.env.GITHUB_API_URL ?? "https://api.github.com";
const TOKEN = process.env.GH_TOKEN ?? "";

/** 单个请求最多试 4 次（首次 + 3 次重试）。实测 502 多数在第二次就过了。 */
const MAX_ATTEMPTS = 4;
/** 退避基数：0.5s → 1s → 2s，实际再加最多 50% 的随机抖动。 */
const RETRY_BASE_MS = 500;

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

/** 模板里唯一允许的占位符：替换成 URL 编码后的 issue 标题 `[包名] `。 */
const TITLE_PLACEHOLDER = "{{title}}";

/**
 * 预填的 issue 标题。
 *
 * 空格按 x-www-form-urlencoded 写成 `+`（GitHub 文档里给的就是这个形式），其余字符走
 * encodeURIComponent —— 现在的包名只有字母数字与连字符，但将来出现别的字符也不会坏。
 */
function issueTitle(name) {
  return encodeURIComponent(`[${name}] `).replace(/%20/g, "+");
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
  // 占位符被删掉不会报错，只会静默失去「标题带包名」这件事 —— 所以这里强制要求它还在
  if (!text.includes(TITLE_PLACEHOLDER)) {
    throw new Error(`${TEMPLATE_FILE} 里没有 ${TITLE_PLACEHOLDER}：链接会失去预填标题`);
  }
  return text;
}

/** 按包名渲染模板。残留的占位符一律报错，否则会原样推进收录仓库。 */
function renderTemplate(text, name) {
  const rendered = text.replaceAll(TITLE_PLACEHOLDER, issueTitle(name));
  const leftover = /\{\{[^}]*\}\}/.exec(rendered);
  if (leftover !== null) {
    throw new Error(`${TEMPLATE_FILE} 里有未定义的占位符 ${leftover[0]}`);
  }
  return Buffer.from(rendered, "utf8");
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

/**
 * 这些状态码值得重试：5xx 是服务端瞬时故障，429 是限流，408 是超时。
 * 其余 4xx 是我们自己的错（缺权限、路径不对），重试只是浪费额度。
 */
function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 第 attempt 次失败后等多久。
 *
 * `Retry-After` 优先（429 会带它）：GitHub 的限流窗口动辄几十秒，自己拍退避只会继续撞。
 * 否则指数退避 + 最多 50% 抖动 —— 22 个仓库是串行的，抖动在这里作用不大，但成本为零。
 */
function retryDelay(attempt, retryAfter) {
  // 只有 429 才带 Retry-After；其余情况是 null。别写 Number(null) —— 那是 0，
  // 会让退避变成「立刻重试」，白白烧掉 3 次预算（这个坑实测踩过）。
  const header = retryAfter === null ? "" : retryAfter.trim();
  const seconds = Number(header);
  if (header !== "" && Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds, 60) * 1000;
  }
  return RETRY_BASE_MS * 2 ** (attempt - 1) * (1 + Math.random() * 0.5);
}

/** 带重试的 fetch。重试触发时会打一行日志，否则 CI 里看不出「刚才慢在哪」。 */
async function fetchWithRetry(url, init, label) {
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      // 连接重置 / DNS / TLS 抖动：fetch 直接抛，没有状态码可看
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error(`${label} → 连接失败（重试 ${MAX_ATTEMPTS - 1} 次后放弃）：${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
      const delay = retryDelay(attempt);
      console.error(`  ↻ ${label} 连接失败，${Math.round(delay)}ms 后重试（第 ${attempt} 次）`);
      await sleep(delay);
      continue;
    }

    if (!isRetryableStatus(response.status) || attempt >= MAX_ATTEMPTS) {
      return response;
    }
    const delay = retryDelay(attempt, response.headers.get("retry-after"));
    console.error(`  ↻ ${label} → ${response.status}，${Math.round(delay)}ms 后重试（第 ${attempt} 次）`);
    // 丢弃响应体，否则连接不会被复用
    await response.arrayBuffer().catch(() => undefined);
    await sleep(delay);
  }
}

function apiError(message, status) {
  const error = new Error(message);
  // 状态码要单独带出来：调用方要靠它区分「409 说明上次其实成功了」这种情况
  error.status = status;
  return error;
}

async function api(path, init = {}) {
  const label = `${init.method ?? "GET"} ${path}`;
  const response = await fetchWithRetry(
    `${API}${path}`,
    {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${TOKEN}`,
        "user-agent": "siyuan-packages-issue-template",
        "x-github-api-version": "2022-11-28",
        ...init.headers,
      },
    },
    label,
  );
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
    throw apiError(`${label} → ${response.status} ${body?.message ?? text}`, response.status);
  }
  return { status: response.status, body };
}

async function readRemote(target, branch) {
  const response = await fetchWithRetry(
    `${API}/repos/${target}/contents/${TARGET_PATH}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        accept: "application/vnd.github.raw",
        authorization: `Bearer ${TOKEN}`,
        "user-agent": "siyuan-packages-issue-template",
        "x-github-api-version": "2022-11-28",
      },
    },
    `GET ${target} ${TARGET_PATH}`,
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw apiError(`读 ${target} 的 ${TARGET_PATH} → ${response.status}`, response.status);
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
  try {
    await api(`/repos/${item.target}/contents/${TARGET_PATH}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // PUT 重试时最尴尬的一种：上一次其实写成功了、只是响应丢了，重发带着旧 sha 就会 409。
    // 不能用同一个 sha 硬碰，也不能直接判失败 —— 回读一次看内容是不是已经是我们想要的。
    if (error.status === 409 && (await sameText(content, await readRemote(item.target, branch)))) {
      return { state, note: "首次写入其实已成功，重发报 409，回读确认" };
    }
    throw error;
  }
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

  const template = loadTemplate();
  const targets = collectTargets();
  const results = [];

  // 串行：日志顺序与仓库顺序一致，也不至于撞 GitHub 的并发写限制
  for (const item of targets) {
    try {
      // 每个仓库的内容都不同：标题里带着自己的包名
      const { state, note } = await syncOne(item, renderTemplate(template, item.name));
      results.push({ ...item, state, ...(note === undefined ? {} : { reason: note }) });
      const suffix = note === undefined ? "" : `（${note}）`;
      console.log(`- ${item.target}（${item.name}）：${STATE_LABELS[state] ?? state}${suffix}`);
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
