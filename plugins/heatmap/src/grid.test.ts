import * as assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildMonthGrid, buildMonthLabels, buildMonthSpecs, buildPeriods, groupMonthsByYear, type MonthGrid } from "./grid";
import { formatDateKey } from "./date";

describe("buildMonthGrid", () => {
  it("每周恰好 7 格，含月初月末占位", () => {
    // 2024-01 月初是周一；周一制下无 leading 占位
    const jan = buildMonthGrid(new Map(), 2024, 0, "monday");
    assert.ok(jan.weeks.length >= 4);
    for (const week of jan.weeks) {
      assert.equal(week.length, 7);
    }

    // 2024-02 月初是周四；周一制应有 3 个 leading 占位
    const feb = buildMonthGrid(new Map(), 2024, 1, "monday");
    const leading = feb.weeks[0].filter((c) => c.count === -1 && c.day === 0);
    assert.equal(leading.length, 3);
    assert.equal(feb.weeks[0][3].day, 1);
  });

  it("把 countMap 填入对应日期，缺失视为 0", () => {
    const countMap = new Map([["20240115", { count: 7, docs: 2 }]]);
    const grid = buildMonthGrid(countMap, 2024, 0, "sunday");
    const cell = grid.cells.find((c) => c.date === "20240115");
    assert.ok(cell);
    assert.equal(cell!.count, 7);
    assert.equal(cell!.docs, 2);

    const empty = grid.cells.find((c) => c.date === "20240116");
    assert.ok(empty);
    assert.equal(empty!.count, 0);
    assert.equal(empty!.docs, 0);
  });

  it("未来日期带 day 数字但不计入 cells 统计集合", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // 选一个确定有未来日的月份：若已是月末则用下月，否则用当月
    const year = today.getFullYear();
    const month = today.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();

    if (today.getDate() < lastDay) {
      const grid = buildMonthGrid(new Map(), year, month, "monday");
      const futureInWeeks = ([] as (typeof grid.weeks)[number]).concat(...grid.weeks).filter((c) => c.count === -2);
      assert.ok(futureInWeeks.length > 0);
      assert.ok(futureInWeeks.every((c) => c.day! > today.getDate()));
      assert.ok(!grid.cells.some((c) => c.count === -2));
    } else {
      // 月末：下月全部相对“今天”多为未来（除不可能的情况）
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const grid = buildMonthGrid(new Map(), nextYear, nextMonth, "monday");
      const futureInWeeks = ([] as (typeof grid.weeks)[number]).concat(...grid.weeks).filter((c) => c.count === -2);
      assert.ok(futureInWeeks.length > 0);
      assert.equal(grid.cells.length, 0);
    }
  });

  it("cells 只包含已发生日期，day 与日历日一致", () => {
    const grid = buildMonthGrid(new Map(), 2023, 5, "sunday"); // 2023-06 已完全过去
    assert.equal(grid.year, 2023);
    assert.equal(grid.month, 5);
    assert.equal(grid.cells.length, 30);
    assert.ok(grid.cells.every((c) => c.day === Number(c.date.slice(6, 8))));
  });
});

describe("groupMonthsByYear", () => {
  const sample: MonthGrid[] = [
    { year: 2024, month: 0, cells: [], weeks: [] },
    { year: 2025, month: 1, cells: [], weeks: [] },
    { year: 2024, month: 2, cells: [], weeks: [] },
  ];

  it("按年份分组并保留同组内原有顺序", () => {
    const grouped = groupMonthsByYear(sample, "oldestFirst");
    assert.deepEqual(
      grouped.map((g) => g.year),
      [2024, 2025],
    );
    assert.deepEqual(
      grouped[0].months.map((m) => m.month),
      [0, 2],
    );
  });

  it("支持最近年份优先", () => {
    const grouped = groupMonthsByYear(sample, "newestFirst");
    assert.deepEqual(
      grouped.map((g) => g.year),
      [2025, 2024],
    );
  });
});

describe("buildMonthSpecs", () => {
  it("recent 模式覆盖近一年滚动窗内的月份，止于当月", () => {
    const specs = buildMonthSpecs("recent", null, "oldestFirst");
    assert.ok(specs.length >= 12);
    assert.ok(specs.length <= 13);

    const today = new Date();
    const last = specs[specs.length - 1];
    assert.equal(last.year, today.getFullYear());
    assert.equal(last.month, today.getMonth());

    // 月份序列连续
    for (let i = 1; i < specs.length; i++) {
      const prev = specs[i - 1];
      const curr = specs[i];
      const expectedMonth = prev.month === 11 ? 0 : prev.month + 1;
      const expectedYear = prev.month === 11 ? prev.year + 1 : prev.year;
      assert.equal(curr.month, expectedMonth);
      assert.equal(curr.year, expectedYear);
    }
  });

  it("years 模式按 yearOrder 展开 fromYear→今年的月份", () => {
    const currentYear = new Date().getFullYear();
    const fromYear = currentYear - 1;

    const newest = buildMonthSpecs("years", fromYear, "newestFirst");
    assert.equal(newest[0].year, currentYear);
    assert.equal(newest[0].month, 0);
    assert.ok(newest.some((s) => s.year === fromYear && s.month === 11));

    const oldest = buildMonthSpecs("years", fromYear, "oldestFirst");
    assert.equal(oldest[0].year, fromYear);
    assert.equal(oldest[0].month, 0);

    // 当前年只到当月
    const thisYearMonths = newest.filter((s) => s.year === currentYear);
    assert.equal(thisYearMonths[thisYearMonths.length - 1].month, new Date().getMonth());
  });
});

describe("buildMonthLabels", () => {
  const months = ["1 月", "2 月", "3 月", "4 月", "5 月", "6 月", "7 月", "8 月", "9 月", "10 月", "11 月", "12 月"];

  it("在包含每月 1 号的周列挂上月份文案", () => {
    const weeks = [
      [
        { date: "20240129", count: 0, docs: 0 },
        { date: "20240130", count: 0, docs: 0 },
        { date: "20240131", count: 0, docs: 0 },
        { date: "20240201", count: 0, docs: 0 },
        { date: "", count: -1, docs: 0 },
        { date: "", count: -1, docs: 0 },
        { date: "", count: -1, docs: 0 },
      ],
      [
        { date: "20240205", count: 0, docs: 0 },
        { date: "20240206", count: 0, docs: 0 },
        { date: "20240207", count: 0, docs: 0 },
        { date: "20240208", count: 0, docs: 0 },
        { date: "20240209", count: 0, docs: 0 },
        { date: "20240210", count: 0, docs: 0 },
        { date: "20240211", count: 0, docs: 0 },
      ],
      [
        { date: "20240226", count: 0, docs: 0 },
        { date: "20240227", count: 0, docs: 0 },
        { date: "20240228", count: 0, docs: 0 },
        { date: "20240229", count: 0, docs: 0 },
        { date: "20240301", count: 0, docs: 0 },
        { date: "", count: -1, docs: 0 },
        { date: "", count: -1, docs: 0 },
      ],
    ];
    const labels = buildMonthLabels(weeks, months);
    assert.equal(labels.length, 3);
    assert.equal(labels[0], "2 月");
    assert.equal(labels[1], "");
    assert.equal(labels[2], "3 月");
  });

  it("相邻月标签过近时隐藏前者，避免重叠", () => {
    const weeks = [
      [
        { date: "20240101", count: 0, docs: 0 },
        { date: "", count: -1, docs: 0 },
        { date: "", count: -1, docs: 0 },
        { date: "", count: -1, docs: 0 },
        { date: "", count: -1, docs: 0 },
        { date: "", count: -1, docs: 0 },
        { date: "", count: -1, docs: 0 },
      ],
      [
        { date: "20240201", count: 0, docs: 0 },
        { date: "", count: -1, docs: 0 },
        { date: "", count: -1, docs: 0 },
        { date: "", count: -1, docs: 0 },
        { date: "", count: -1, docs: 0 },
        { date: "", count: -1, docs: 0 },
        { date: "", count: -1, docs: 0 },
      ],
    ];
    const labels = buildMonthLabels(weeks, months);
    assert.equal(labels[0], "");
    assert.equal(labels[1], "2 月");
  });
});

describe("buildPeriods", () => {
  it("recent 模式只返回一段滚动窗口", () => {
    const periods = buildPeriods(new Map(), "recent", null, "monday", "newestFirst");
    assert.equal(periods.length, 1);
    assert.ok(periods[0].cells.length >= 365);
    assert.ok(periods[0].weeks.every((w) => w.length === 7));
  });

  it("years 模式每年一段，顺序跟随 yearOrder", () => {
    const currentYear = new Date().getFullYear();
    const fromYear = currentYear - 1;

    const newest = buildPeriods(new Map(), "years", fromYear, "monday", "newestFirst");
    assert.equal(newest.length, 2);
    // 新年网格第一格应落在该年或对齐产生的上一年占位之后的本年
    assert.ok(newest[0].cells[0].date.startsWith(String(currentYear)));

    const oldest = buildPeriods(new Map(), "years", fromYear, "monday", "oldestFirst");
    assert.ok(oldest[0].cells[0].date.startsWith(String(fromYear)));
  });

  it("把活动计数写入对应日期格子", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const key = formatDateKey(today);

    const periods = buildPeriods(new Map([[key, { count: 42, docs: 5 }]]), "recent", null, "sunday", "newestFirst");
    const cell = periods[0].cells.find((c) => c.date === key);
    assert.ok(cell);
    assert.equal(cell!.count, 42);
    assert.equal(cell!.docs, 5);
  });
});
