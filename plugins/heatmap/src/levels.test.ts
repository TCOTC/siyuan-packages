import * as assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { I18n } from "./locale";
import { calcLevels, formatLegendTooltip } from "./levels";

const i18n = {
  legendTooltipZero: "0 个块",
  legendTooltipExact: "${count} 个块",
  legendTooltipRange: "${min}–${max} 个块",
  legendTooltipMore: "${min}+ 个块",
  legendTooltipUnused: "未使用",
} as I18n;

describe("calcLevels", () => {
  it("无正样本时百分位模式全部映射为 0，阈值全为 0", () => {
    const { levelOf, thresholds } = calcLevels([]);
    assert.deepEqual(thresholds, [0, 0, 0]);
    assert.equal(levelOf(0), 0);
    assert.equal(levelOf(10), 0);

    const zeros = calcLevels([0, 0, 0]);
    assert.deepEqual(zeros.thresholds, [0, 0, 0]);
    assert.equal(zeros.levelOf(1), 0);
  });

  it("零活动永远是空档，不进入热力色阶", () => {
    const { levelOf } = calcLevels([1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(levelOf(0), 0);
    assert.equal(levelOf(-1), 0);
  });

  it("相对分位把正样本分到 1–4 级，高计数不低于低计数", () => {
    // 均匀分布便于断言相对强弱，而不是死抠分位公式细节
    const counts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const { levelOf, thresholds } = calcLevels(counts);

    assert.ok(thresholds[0] <= thresholds[1]);
    assert.ok(thresholds[1] <= thresholds[2]);

    assert.equal(levelOf(0), 0);
    assert.ok(levelOf(1) >= 1);
    assert.ok(levelOf(12) === 4);
    assert.ok(levelOf(1) <= levelOf(6));
    assert.ok(levelOf(6) <= levelOf(12));
  });

  it("忽略非正样本后再计算分位", () => {
    const onlyPositive = calcLevels([1, 2, 3, 4]);
    const withZeros = calcLevels([0, 0, 1, 2, 3, 4, 0]);
    assert.deepEqual(withZeros.thresholds, onlyPositive.thresholds);
    assert.equal(withZeros.levelOf(4), onlyPositive.levelOf(4));
  });

  it("单一正样本时仍能给出可用色阶", () => {
    const { levelOf, thresholds } = calcLevels([5]);
    assert.equal(levelOf(0), 0);
    assert.equal(levelOf(5), 1);
    assert.equal(levelOf(6), 4);
    assert.deepEqual(thresholds, [5, 5, 5]);
  });

  it("自定义百分位改变分箱边界", () => {
    const counts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const defaults = calcLevels(counts);
    const custom = calcLevels(counts, {
      mode: "percentile",
      percentileThresholds: [10, 20, 30],
    });
    assert.notDeepEqual(custom.thresholds, defaults.thresholds);
    assert.ok(custom.thresholds[0] <= custom.thresholds[1]);
    assert.ok(custom.thresholds[1] <= custom.thresholds[2]);
    assert.ok(custom.levelOf(10) >= custom.levelOf(1));
  });

  it("块数模式按绝对阈值分档，不依赖样本分布", () => {
    const { levelOf, thresholds } = calcLevels([0, 1, 100], {
      mode: "count",
      countThresholds: [2, 5, 10],
    });
    assert.deepEqual(thresholds, [2, 5, 10]);
    assert.equal(levelOf(0), 0);
    assert.equal(levelOf(1), 1);
    assert.equal(levelOf(2), 1);
    assert.equal(levelOf(3), 2);
    assert.equal(levelOf(5), 2);
    assert.equal(levelOf(6), 3);
    assert.equal(levelOf(10), 3);
    assert.equal(levelOf(11), 4);
  });

  it("块数模式在无正样本时仍使用配置阈值", () => {
    const { levelOf, thresholds } = calcLevels([], {
      mode: "count",
      countThresholds: [3, 6, 9],
    });
    assert.deepEqual(thresholds, [3, 6, 9]);
    assert.equal(levelOf(4), 2);
    assert.equal(levelOf(10), 4);
  });
});

describe("formatLegendTooltip", () => {
  it("0 级固定说明无活动", () => {
    assert.equal(formatLegendTooltip(0, [1, 2, 3], i18n), "0 个块");
  });

  it("最高档使用「min+」形式", () => {
    assert.equal(formatLegendTooltip(4, [2, 5, 9], i18n), "10+ 个块");
  });

  it("中间档优先用区间文案", () => {
    assert.equal(formatLegendTooltip(1, [2, 5, 9], i18n), "1–2 个块");
    assert.equal(formatLegendTooltip(2, [2, 5, 9], i18n), "3–5 个块");
    assert.equal(formatLegendTooltip(3, [2, 5, 9], i18n), "6–9 个块");
  });

  it("区间塌缩为单点时退化为精确数量说明", () => {
    // t1 === 1 时 1 级区间为 [1, 1]
    assert.equal(formatLegendTooltip(1, [1, 4, 8], i18n), "1 个块");
  });

  it("分位重合导致空档时标为未使用，不捏造区间", () => {
    // t1 === t2 === 5 时 2 级区间为 [6, 5]
    assert.equal(formatLegendTooltip(2, [5, 5, 5], i18n), "未使用");
    assert.equal(formatLegendTooltip(3, [5, 5, 5], i18n), "未使用");
    assert.equal(formatLegendTooltip(1, [5, 5, 5], i18n), "1–5 个块");
    assert.equal(formatLegendTooltip(4, [5, 5, 5], i18n), "6+ 个块");
  });

  it("全零阈值时更高档回退为 1+", () => {
    assert.equal(formatLegendTooltip(4, [0, 0, 0], i18n), "1+ 个块");
  });
});
