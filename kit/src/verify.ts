import { unzipSync } from "fflate";
import { readFileSync } from "node:fs";

/**
 * 产物对拍。
 *
 * 构建系统迁移最大的危险不是「构建失败」，而是「构建成功但运行时报错」：
 * CJS 导出形状变了、process.env 的 shim 丢了、i18n 路径错了、CSS 改名了。
 * 这些在 CI 里都不会失败，只会在用户装上之后暴露。
 *
 * 所以迁移每个包时，用旧仓库产出的 package.zip 当基线，比对新产物的
 * 文件清单与各自体积。只报差异，不判断对错——体积的合理变化（压缩策略、
 * 是否带 sourcemap）需要人看。
 */
export interface ZipEntry {
  name: string;
  size: number;
}

export function readZip(path: string): Map<string, ZipEntry> {
  const entries = unzipSync(readFileSync(path));
  const result = new Map<string, ZipEntry>();
  for (const [name, data] of Object.entries(entries)) {
    // 目录条目长度恒为 0，不参与比对
    if (name.endsWith("/")) {
      continue;
    }
    result.set(name, { name, size: data.length });
  }
  return result;
}

export interface ZipDiff {
  onlyInBaseline: string[];
  onlyInCurrent: string[];
  /** 同名但体积变化超过阈值的条目。 */
  sizeChanged: { name: string; baseline: number; current: number }[];
}

export function diffZip(
  baseline: Map<string, ZipEntry>,
  current: Map<string, ZipEntry>,
  /** 体积变化容忍度，默认 5%。压缩方式或构建器变化会带来小幅差异。 */
  tolerance = 0.05,
): ZipDiff {
  const onlyInBaseline = [...baseline.keys()].filter((name) => !current.has(name)).toSorted();
  const onlyInCurrent = [...current.keys()].filter((name) => !baseline.has(name)).toSorted();

  const sizeChanged: ZipDiff["sizeChanged"] = [];
  for (const [name, base] of baseline) {
    const now = current.get(name);
    if (!now || base.size === 0) {
      continue;
    }
    const delta = Math.abs(now.size - base.size) / base.size;
    if (delta > tolerance) {
      sizeChanged.push({ name, baseline: base.size, current: now.size });
    }
  }

  return { onlyInBaseline, onlyInCurrent, sizeChanged };
}

export function formatDiff(diff: ZipDiff): string {
  const lines: string[] = [];

  if (diff.onlyInBaseline.length > 0) {
    lines.push("缺少以下文件（基线里有，新产物没有）：");
    for (const name of diff.onlyInBaseline) {
      lines.push(`  - ${name}`);
    }
  }
  if (diff.onlyInCurrent.length > 0) {
    lines.push("新增以下文件：");
    for (const name of diff.onlyInCurrent) {
      lines.push(`  + ${name}`);
    }
  }
  if (diff.sizeChanged.length > 0) {
    lines.push("体积变化超过阈值：");
    for (const item of diff.sizeChanged) {
      lines.push(`  ~ ${item.name}  ${item.baseline} → ${item.current}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "与基线一致。";
}
