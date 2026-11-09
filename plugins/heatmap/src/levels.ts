import type { I18n } from "./i18n";
import type { LevelCuts, LevelMode } from "./types";

/** 分位 / 块数解析后的绝对块数阈值：依次为 1/2/3 级上限 */
export type LevelThresholds = LevelCuts;

export const DEFAULT_PERCENTILE_THRESHOLDS: LevelCuts = [25, 50, 75];
export const DEFAULT_COUNT_THRESHOLDS: LevelCuts = [1, 10, 40];

export interface CalcLevelsOptions {
  mode?: LevelMode;
  percentileThresholds?: LevelCuts;
  countThresholds?: LevelCuts;
}

/** 按配置的百分位或绝对块数映射到 1–4 级，并返回阈值供图例 tooltip 使用 */
export function calcLevels(
  counts: number[],
  options: CalcLevelsOptions = {},
): {
  levelOf: (count: number) => number;
  thresholds: LevelThresholds;
} {
  const mode = options.mode ?? "percentile";

  if (mode === "count") {
    const thresholds = options.countThresholds ?? DEFAULT_COUNT_THRESHOLDS;
    return {
      levelOf: levelOfFromThresholds(thresholds),
      thresholds,
    };
  }

  const positive = counts.filter((c) => c > 0).sort((a, b) => a - b);
  if (positive.length === 0) {
    return {
      levelOf: () => 0,
      thresholds: [0, 0, 0],
    };
  }

  const pct = options.percentileThresholds ?? DEFAULT_PERCENTILE_THRESHOLDS;
  const q = (p: number) => positive[Math.min(positive.length - 1, Math.floor(positive.length * p))];
  const thresholds: LevelThresholds = [q(pct[0] / 100), q(pct[1] / 100), q(pct[2] / 100)];
  return {
    levelOf: levelOfFromThresholds(thresholds),
    thresholds,
  };
}

function levelOfFromThresholds(thresholds: LevelThresholds): (count: number) => number {
  const [t1, t2, t3] = thresholds;
  return (count: number) => {
    if (count <= 0) return 0;
    if (count <= t1) return 1;
    if (count <= t2) return 2;
    if (count <= t3) return 3;
    return 4;
  };
}

/** 根据分位阈值生成图例格子的数量说明 */
export function formatLegendTooltip(level: number, thresholds: LevelThresholds, i18n: I18n): string {
  if (level === 0) {
    return i18n.legendTooltipZero;
  }

  const [t1, t2, t3] = thresholds;
  const bands: Array<[number, number | null]> = [
    [1, t1],
    [t1 + 1, t2],
    [t2 + 1, t3],
    [t3 + 1, null],
  ];
  const [min, max] = bands[level - 1];

  // 无正样本量时阈值全为 0，仅保留「1+」作为更高颜色的说明
  if (t1 === 0 && t2 === 0 && t3 === 0) {
    return i18n.legendTooltipMore.replace("${min}", "1");
  }

  if (max === null) {
    return i18n.legendTooltipMore.replace("${min}", String(min));
  }
  // 分位重合导致该等级区间为空（min > max）时，不捏造区间
  if (min > max) {
    return i18n.legendTooltipUnused;
  }
  if (min === max) {
    return i18n.legendTooltipExact.replace("${count}", String(min));
  }
  return i18n.legendTooltipRange.replace("${min}", String(min)).replace("${max}", String(max));
}
