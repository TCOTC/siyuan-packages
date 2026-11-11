#!/usr/bin/env node
/**
 * 算出本次要发布的包：把「上一个 release 标签 → 本次标签」区间里**清单版本真的变大**的包挑出来。
 *
 * 只在 .github/workflows/publish.yml 里跑，本地复核方式见 docs/rules.md 第 10 节。
 *
 * 判定规则（三者都满足才发）：
 *   1. 包的 manifest.json 在区间里被新增或修改（改动代码但没抬版本不算）
 *   2. 合成清单的 version 与基准里那份不同（相同 = 只改了文案，没什么可发的）
 *   3. version 严格变大（变小会破坏集市的单调递增约定，直接报错）
 *
 * 首次标签（前面没有更早的 release/* 标签）只建立基准，不发布任何包。
 *
 * 输出（$GITHUB_OUTPUT）：
 *   count   要发布的包数
 *   list    每行七列，制表符分隔：包目录 \t 名称 \t 版本 \t 目标收录仓库 \t 类型 \t 上一个版本 \t 基准 ref
 *
 * 加 `--json` 则只往 stdout 打一份 JSON（count / noBase / packages / notes），
 * 不碰 $GITHUB_OUTPUT —— `release.mjs` 用它做打标签前的预检。
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
// 版本比较只有一份实现（libs/version-compare）。Node 26 直接跑 .ts，无需预编译；
// 该文件没有任何 import，类型注解可完整剥离。
import { compareSemver } from "../../libs/version-compare/src/index.ts";
import { isEntryPoint, TAG_PREFIX } from "./tag.mjs";

const ROOT = process.cwd();
/** 只有清单能决定版本；代码变了但版本没抬本来就不该发。 */
const MANIFEST_GLOBS = ["plugins/*/manifest.json", "themes/*/manifest.json", "widgets/*/manifest.json"];
/** 包类型目录，用来把「只给了包名」的手动输入解析成包目录。 */
const KIND_DIRS = ["plugins", "themes", "widgets"];
/** 目录 → 清单里的包类型，用于发布汇总表。 */
const KIND_BY_DIR = { plugins: "plugin", themes: "theme", widgets: "widget" };
/**
 * 手动指定包（workflow_dispatch 的 packages）时上一版是未知的 ——
 * 不能与「新包」混为一谈，否则汇总表会误导。
 */
const MANUAL_PREVIOUS = "—（未检测）";
const jsonMode = process.argv.includes("--json");

/**
 * 逐包进度日志：`--json` 时改走 stderr。
 * stdout 在 jsonMode 下只许有 JSON，否则调用方 JSON.parse 会拿到「日志 + JSON」。
 */
function progress(message) {
  if (jsonMode) {
    console.error(message);
    return;
  }
  console.log(message);
}

const event = process.env.EVENT ?? "";
const refName = process.env.REF_NAME ?? "";
const inputBase = (process.env.INPUT_BASE ?? "").trim();
const inputPackages = (process.env.INPUT_PACKAGES ?? "").trim();

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function tryGit(...args) {
  try {
    // 静默 stderr：探测不存在的东西（如基准里没有这个文件）是正常路径，不该刷一屏 fatal
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function revParse(ref) {
  return tryGit("rev-parse", "--verify", `${ref}^{commit}`);
}

/**
 * 可达 currentRef 的全部 release 标签；sort 直接给 git 的排序参数。
 *
 * `--merged` 把候选限定在「可达 currentRef 的提交」上，避免拿到别的分支上的标签。
 */
function releaseTags(currentRef, sort) {
  const commit = revParse(currentRef);
  if (commit === null) {
    throw new Error(`解析不到 ${currentRef} 对应的提交`);
  }
  return git("for-each-ref", "--merged", commit, `--sort=${sort}`, "--format=%(refname:strip=2)", `refs/tags/${TAG_PREFIX}*`)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * 找 currentRef 之前最近的一个 release 标签。
 *
 * 按提交日期倒序取第一个，只跳过自己。
 *
 * 不跳过「与自己在同一提交上的其它标签」：本地在 HEAD 上刚打过基准标签、紧接着再执行一次时，
 * 那个标签就是正确的基准 —— 区间为空，本次不该再发任何东西（否则能连续建一堆空标签）。
 * 返回 null 表示这是首次打标签。
 */
function previousTag(currentRef) {
  for (const name of releaseTags(currentRef, "-creatordate")) {
    if (name !== currentRef) {
      return name;
    }
  }
  return null;
}

/**
 * 本包上一次**自己**发布时对应的标签。
 *
 * 不能直接拿「上一个 release 标签」当正文的区间下界：标签是仓库级的，一批只发其中几个包。
 * 例如 image-squeeze 在 release/20261110-194836 发了 1.0.2，之后几个批次只发了别的包，
 * 用最新标签当基准就会把「本包上次发布 → 最新标签」之间本包的提交整段漏掉。
 *
 * 做法：从最新标签往回走，先跳过本包清单还不存在的标签（迁移前叫 plugin.json / theme.json /
 * widget.json），再一路跳过版本与最新标签相同的标签。这段连续区的段首就是该版本的发布点 ——
 * 版本是在它之前的区间里抬上去的，标签本身是发布时刻。
 * 返回空字符串表示本包在这个仓里还没有发布点，正文就不写区间与链接。
 */
function previousReleaseTag(manifestPath, currentRef) {
  const tags = releaseTags(currentRef, "-creatordate").filter((name) => name !== currentRef);
  let index = 0;
  let version = null;
  while (index < tags.length) {
    version = versionAt(tags[index], manifestPath);
    if (version !== null) {
      break;
    }
    index++;
  }
  if (version === null) {
    return "";
  }
  // 同一版本的连续区可能跨多个批次，段首才是发布那一刻
  while (index + 1 < tags.length && versionAt(tags[index + 1], manifestPath) === version) {
    index++;
  }
  return tags[index];
}

/** 区间内被新增或修改的包清单（删除的包不参与：它已经没有可构建的内容）。 */
function changedManifests(base, current) {
  return git("diff", "--name-only", "--diff-filter=AM", base, current, "--", ...MANIFEST_GLOBS)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 读基准提交里那份包清单的 version；基准里没有这个文件 = 新包。 */
function versionAt(base, path) {
  const raw = tryGit("show", `${base}:${path}`);
  if (raw === null) {
    return null;
  }
  const manifest = JSON.parse(raw);
  const version = typeof manifest.version === "string" ? manifest.version : "";
  if (!version) {
    throw new Error(`${base} 里的 ${path} 没有 version`);
  }
  return version;
}

function findPackageDir(token) {
  for (const kind of KIND_DIRS) {
    const dir = `${kind}/${token}`;
    if (existsSync(join(ROOT, dir, "manifest.json"))) {
      return dir;
    }
  }
  throw new Error(`找不到包 {${KIND_DIRS.join(",")}}/${token}`);
}

/**
 * 向 kit 要三层合成后的清单。
 *
 * 包内那份只是覆盖层（没有 name / url），直接读它会得到空的 name 与缺失的 url，
 * 发布目标就会算错；推导逻辑必须只有一个来源，也就是 kit。
 */
function resolvePackage(dir) {
  const output = execFileSync(process.execPath, ["kit/src/cli.ts", "manifest", dir], { cwd: ROOT, encoding: "utf8" });
  const manifest = JSON.parse(output);

  const expected = dir.split("/").pop() ?? dir;
  const name = typeof manifest.name === "string" ? manifest.name : "";
  if (name !== expected) {
    throw new Error(`${dir} 的合成清单 name 是 "${name}"，与目录名 "${expected}" 不一致`);
  }

  const version = typeof manifest.version === "string" ? manifest.version : "";
  if (!version) {
    throw new Error(`${dir} 的合成清单没有 version`);
  }
  if (version.startsWith("v")) {
    throw new Error(`${dir} 的清单 version 不能带 v 前缀：${version}`);
  }

  // 目标收录仓库只从清单 url 推导：url 由 kit 从目录名生成，两者不会漂移
  const url = typeof manifest.url === "string" ? manifest.url : "";
  if (!url) {
    throw new Error(`${dir} 的合成清单没有 url，无法确定发布目标`);
  }
  const target = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
  if (!/^[^/]+\/[^/]+$/.test(target)) {
    throw new Error(`${dir} 的清单 url 不是仓库地址：${url}`);
  }

  const kind = KIND_BY_DIR[dir.split("/")[0] ?? ""];
  if (kind === undefined) {
    throw new Error(`${dir} 不在 ${KIND_DIRS.join(" / ")} 之下，无法判断包类型`);
  }

  return { dir, kind, name, version, target };
}

function setOutput(key, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) {
    console.log(`${key}: ${value}`);
    return;
  }
  if (value.includes("\n")) {
    appendFileSync(file, `${key}<<__OUTPUT_EOF__\n${value}\n__OUTPUT_EOF__\n`);
    return;
  }
  appendFileSync(file, `${key}=${value}\n`);
}

function setSummary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) {
    appendFileSync(file, `${markdown}\n`);
  }
}

function finish(rows, notes, extra = {}) {
  if (jsonMode) {
    console.log(JSON.stringify({ count: rows.length, noBase: extra.noBase === true, packages: rows, notes }, null, 2));
    return;
  }

  setOutput("count", String(rows.length));
  // 七列：包目录 / 包名 / 版本 / 目标仓库 / 类型 / 上一个版本 / 本包上一个发布点。
  // 上一个版本为空字符串表示新包（基准里没有它）；最后一个只用来在 publish.sh 里生成
  // release 正文 —— 它是「本包自己上次发布」，不是仓库级的上一个标签。
  setOutput("list", rows.map((row) => [row.dir, row.name, row.version, row.target, row.kind, row.previous ?? "", row.base ?? ""].join("\t")).join("\n"));

  // 表格由 publish.sh 输出：Release 链接只有发布后才知道，放两处必然不一致。
  // 这里只留基准行 —— 逐个包列「1.0.1 → 1.0.2」与表格完全重复。
  setSummary(rows.length === 0 ? `${notes.join("\n")}\n\n**本次没有需要发布的包。**` : notes.join("\n"));

  for (const note of notes) {
    console.log(note);
  }
  console.log(rows.length === 0 ? "没有需要发布的包" : `待发布 ${rows.length} 个包：${rows.map((row) => `${row.name}@${row.version}`).join(", ")}`);
}

function main() {
  const isTagPush = event === "push";
  const currentRef = isTagPush ? refName : "HEAD";

  if (isTagPush && !refName.startsWith(TAG_PREFIX)) {
    throw new Error(`标签必须形如 ${TAG_PREFIX}<批次>，实际是 ${refName}`);
  }

  if (inputPackages) {
    // 手动指定：跳过变更检测，用于补发漏掉的包（此时也可以不抬版本）
    const dirs = inputPackages
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .map(findPackageDir);
    // 上一版未知，但正文仍需要一个区间下界，取本包自己的上一个发布点（没有则退回仓库基准）
    finish(
      dirs.map((dir) => ({
        ...resolvePackage(dir),
        previous: MANUAL_PREVIOUS,
        base: previousReleaseTag(`${dir}/manifest.json`, "HEAD") || (previousTag("HEAD") ?? ""),
      })),
      [`手动指定 ${dirs.length} 个包，未做变更检测。`],
    );
    return;
  }

  const base = inputBase || previousTag(currentRef);
  if (base === null || base === "") {
    // 首次打标签：只建立基准。否则第一个标签会把 22 个包全量重发一遍。
    finish([], [`⚠️ \`${currentRef}\` 之前没有更早的 \`${TAG_PREFIX}*\` 标签，本次只作为基准，不发布任何包。`, `下次从本次标签算起，只发清单 \`version\` 变大的包。`], { noBase: true });
    return;
  }
  if (revParse(base) === null) {
    throw new Error(`基准标签 ${base} 不存在（本地缺少它的提交？checkout 需要 fetch-depth: 0）`);
  }

  // notes 只放表格里没有的信息：基准、以及被跳过的包及其原因。
  // 已发布包逐个列「旧 → 新」与汇总表重复，不再写进 summary（日志里另有）。
  const notes = [`基准：\`${base}\` → \`${currentRef}\`（正文的提交区间按各包自己的上一个发布点算）`];
  const skipped = [];
  const rows = [];

  for (const path of changedManifests(base, currentRef)) {
    const dir = dirname(path);
    const previous = versionAt(base, path);
    const pkg = resolvePackage(dir);

    if (previous === null) {
      progress(`- ${pkg.name}：新包，直接发布`);
      // 新包没有自己的发布点，退回到仓库基准 —— 否则正文里连初始化那几个提交都列不出来
      rows.push({ ...pkg, previous: null, base: previousReleaseTag(path, currentRef) || base });
      continue;
    }

    const order = compareSemver(pkg.version, previous);
    if (order === null) {
      // 静默跳过会让「抬了版本却没发」这类事故无声无息，直接报错
      throw new Error(`${pkg.name} 的版本无法按语义化版本解析，无法判断是否严格变大：${previous} → ${pkg.version}`);
    }
    if (order === 0) {
      // 只改了 displayName / description 之类，没有新版本可发
      progress(`- ${pkg.name}：清单变了但 version 仍是 ${pkg.version}，跳过`);
      skipped.push(`${pkg.name}（version 仍是 ${pkg.version}）`);
      continue;
    }
    if (order < 0) {
      throw new Error(`${pkg.name} 的 version 从 ${previous} 降到了 ${pkg.version}`);
    }
    progress(`- ${pkg.name}：${previous} → ${pkg.version}`);
    rows.push({ ...pkg, previous, base: previousReleaseTag(path, currentRef) });
  }

  // 跳过的包不在表格里，不写一句没人知道它们为什么没发
  if (skipped.length > 0) {
    notes.push(`跳过 ${skipped.length} 个包（清单变了但版本未变）：${skipped.join("、")}`);
  }

  finish(rows, notes);
}

if (isEntryPoint(import.meta.url)) {
  main();
}
