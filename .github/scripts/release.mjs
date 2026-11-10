#!/usr/bin/env node
/**
 * 发布：检测要发的包 → 打时间戳标签 → 推送，推完 Publish 工作流自动开始。
 *
 *   pnpm release                  检测 + 打标签 + 推送（最常用，零参数）
 *   pnpm release --dry-run        只检测并打印标签名与待发清单，不建标签
 *   pnpm release --no-push        只打标签，自己稍后推
 *   pnpm release --allow-empty    区间内没有版本变化时也打标签（只推进基准）
 *
 * 标签名形如 `release/20261110-153012`，时间戳只用来保证唯一 —— 同一天可以发多批。
 * 「上一个标签」由 detect-packages.mjs 按 creatordate 排序得到，与名字的字典序无关。
 *
 * 和 detect-packages.mjs 一样放在 .github/scripts/ 下：两者共用 tag.mjs 里的格式定义，
 * 标签格式只有一份真相。
 */
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatTag, isEntryPoint } from "./tag.mjs";

/** 脚本在 .github/scripts/，上两级是仓库根；不依赖 cwd，从包目录里跑也对。 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DETECT = join(ROOT, ".github", "scripts", "detect-packages.mjs");

const USAGE = `用法：pnpm release [--dry-run] [--no-push] [--allow-empty]

  无参数        检测 → 打标签 → 推送到 origin，推完 Publish 工作流自动开始
  --dry-run     只检测并打印标签名与待发清单，不建标签、不推送
  --no-push     只打标签，不推送（稍后自己 git push origin <标签>）
  --allow-empty 区间内没有清单版本变化时也打标签（只推进基准）

发一个版本的完整流程：
  1. 抬要发的包 manifest.json 里的 version
  2. 提交并推送 main
  3. pnpm release
`;

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    if (allowFailure) {
      return null;
    }
    // git 的 diagnostic 在 stderr 上，不带上就只剩一句 "Command failed"
    const stderr = error !== null && typeof error === "object" && typeof error.stderr === "string" ? error.stderr.trim() : "";
    throw new Error(stderr === "" ? String(error) : stderr, { cause: error });
  }
}

/** 跑一遍变更检测。stdout 走 inherit，出问题时能直接看到检测阶段打印的原因。 */
function detect() {
  const output = execFileSync(process.execPath, [DETECT, "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    // 强制成「非 tag 推送」模式：此时基准取最近的既有标签，HEAD 当本次
    env: { ...process.env, EVENT: "workflow_dispatch", REF_NAME: "HEAD", INPUT_BASE: "", INPUT_PACKAGES: "" },
  });
  return JSON.parse(output);
}

function main() {
  const flags = new Set(process.argv.slice(2));
  if (flags.has("--help") || flags.has("-h")) {
    console.log(USAGE);
    return;
  }
  const push = !flags.has("--no-push");
  const dryRun = flags.has("--dry-run");
  const allowEmpty = flags.has("--allow-empty");

  // 标签指向 commit，工作区里的改动不会进发布包；有未提交改动时先拦住
  const dirty = git(["status", "--porcelain", "--untracked-files=no"]);
  if (dirty !== "") {
    throw new Error(`工作区有未提交的改动，标签会指向不含这些改动的提交：\n${dirty}`);
  }

  console.log("正在检测本次要发布的包…");
  const result = detect();
  for (const note of result.notes) {
    console.log(note);
  }

  if (result.count === 0 && !result.noBase && !allowEmpty) {
    throw new Error("区间内没有清单版本变化，打标签也不会发布任何包。\n・要发布：先抬对应包 manifest.json 的 version 并提交\n・只是推进基准（例如已经用 workflow_dispatch 手动补发过）：加 --allow-empty");
  }

  const name = formatTag(new Date());
  if (git(["tag", "--list", name]) !== "") {
    throw new Error(`${name} 已存在（同一秒内重复执行？等一秒再试）`);
  }

  if (result.count > 0) {
    console.log(`\n待发布 ${result.count} 个包：`);
    for (const pkg of result.packages) {
      console.log(`  ${pkg.name}@${pkg.version} → ${pkg.target}`);
    }
  } else if (result.noBase) {
    console.log("\n这是第一个 release 标签，本次只建立基准，不发布任何包。");
  } else {
    console.log("\n没有待发布的包，本次只推进基准。");
  }

  // 推标签会连同 commit 对象一起送到远端，所以不阻塞；但 main 落后会让仓库历史看起来不对
  const ahead = git(["log", "--oneline", "@{upstream}..HEAD"], { allowFailure: true });
  if (ahead !== null && ahead !== "") {
    console.warn(`\n提示：有 ${ahead.split("\n").length} 个提交还没推到远端分支，建议先 git push。`);
  }

  if (dryRun) {
    console.log(`\n[dry-run] 不建标签。将要使用的是：${name}`);
    return;
  }

  git(["tag", name]);
  console.log(`\n已建标签 ${name}`);

  if (!push) {
    console.log(`下一步：git push origin ${name}`);
    return;
  }

  git(["push", "origin", name]);
  console.log(`已推送 ${name}，Publish 工作流会自动开始。`);
}

if (isEntryPoint(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
