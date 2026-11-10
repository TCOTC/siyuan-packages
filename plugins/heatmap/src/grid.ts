import { expandYearRange } from "./config";
import { alignToWeekStart, formatDateKey, getWeekOffset } from "./date";
import type { DisplayMode, WeekStart, YearOrder } from "./types";

export interface PeriodGrid {
  cells: GridCell[];
  weeks: GridCell[][];
}

export interface GridCell {
  date: string;
  count: number;
  /** 当日文档数；占位 / 未来格为 0 */
  docs: number;
  /** 当月日期数字；占位格为 0 */
  day?: number;
}

export interface MonthSpec {
  year: number;
  /** 0–11 */
  month: number;
}

export interface MonthGrid {
  year: number;
  month: number;
  cells: GridCell[];
  weeks: GridCell[][];
}

/** 按日活动计数：块数 + 文档数 */
export type DayActivityMap = Map<string, { count: number; docs: number }>;

export function buildPeriods(countMap: DayActivityMap, displayMode: DisplayMode, fromYear: number | null, weekStart: WeekStart, yearOrder: YearOrder): PeriodGrid[] {
  if (displayMode !== "years" || fromYear == null) {
    return [buildRollingYearGrid(countMap, weekStart)];
  }

  const currentYear = new Date().getFullYear();
  const years = expandYearRange(fromYear, currentYear);
  years.sort((a, b) => (yearOrder === "newestFirst" ? b - a : a - b));
  return years.map((year) => buildCalendarYearGrid(countMap, year, weekStart));
}

/** 生成要展示的月份列表 */
export function buildMonthSpecs(displayMode: DisplayMode, fromYear: number | null, yearOrder: YearOrder): MonthSpec[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const specs: MonthSpec[] = [];

  if (displayMode !== "years" || fromYear == null) {
    const start = new Date(today);
    start.setDate(start.getDate() - 364);
    let y = start.getFullYear();
    let m = start.getMonth();
    const endY = today.getFullYear();
    const endM = today.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
      specs.push({ year: y, month: m });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return specs;
  }

  const currentYear = today.getFullYear();
  const years = expandYearRange(fromYear, currentYear);
  years.sort((a, b) => (yearOrder === "newestFirst" ? b - a : a - b));
  for (const year of years) {
    const lastMonth = year === currentYear ? today.getMonth() : 11;
    for (let month = 0; month <= lastMonth; month++) {
      specs.push({ year, month });
    }
  }
  return specs;
}

export function groupMonthsByYear(months: MonthGrid[], yearOrder: YearOrder): Array<{ year: number; months: MonthGrid[] }> {
  const map = new Map<number, MonthGrid[]>();
  for (const month of months) {
    let list = map.get(month.year);
    if (!list) {
      list = [];
      map.set(month.year, list);
    }
    list.push(month);
  }
  const years = [...map.keys()].sort((a, b) => (yearOrder === "newestFirst" ? b - a : a - b));
  return years.map((year) => ({ year, months: map.get(year)! }));
}

/** 单月传统日历网格（周为行） */
export function buildMonthGrid(countMap: DayActivityMap, year: number, month: number, weekStart: WeekStart): MonthGrid {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells: GridCell[] = [];
  const weeks: GridCell[][] = [];
  let week: GridCell[] = [];

  // 月初对齐到周起始的占位
  const leading = getWeekOffset(first, weekStart);
  for (let i = 0; i < leading; i++) {
    week.push({ date: "", count: -1, docs: 0, day: 0 });
  }

  for (let day = 1; day <= last.getDate(); day++) {
    const cursor = new Date(year, month, day);
    const key = formatDateKey(cursor);
    let cell: GridCell;
    if (cursor > today) {
      // 未来日期显示数字但不参与热力统计
      cell = { date: key, count: -2, docs: 0, day };
    } else {
      const activity = countMap.get(key);
      cell = { date: key, count: activity?.count || 0, docs: activity?.docs || 0, day };
      cells.push(cell);
    }
    week.push(cell);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  if (week.length > 0) {
    while (week.length < 7) {
      week.push({ date: "", count: -1, docs: 0, day: 0 });
    }
    weeks.push(week);
  }

  return { year, month, cells, weeks };
}

/** 文案宽度测量缓存（键为文案组合） */
const textWidthCache = new Map<string, number>();

/** 按 12px 字号（与 .jchm 对齐）测量最宽文案；无文案时返回 0 */
function measureMaxTextWidth(labels: string[]): number {
  const unique = [...new Set(labels.filter(Boolean))];
  if (unique.length === 0) {
    return 0;
  }
  const cacheKey = unique.join("\0");
  const cached = textWidthCache.get(cacheKey);
  if (cached != null) {
    return cached;
  }
  const probe = document.createElement("div");
  // 探测节点挂在 body 上时拿不到嵌套选择器样式，故字号写死在行内
  probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;font-size:12px;";
  const span = document.createElement("span");
  span.style.whiteSpace = "nowrap";
  probe.appendChild(span);
  document.body.appendChild(probe);
  let max = 0;
  for (const label of unique) {
    span.textContent = label;
    max = Math.max(max, span.getBoundingClientRect().width);
  }
  probe.remove();
  const width = Math.ceil(max);
  textWidthCache.set(cacheKey, width);
  return width;
}

/** 按实际显示的 weekday 文案测量列宽（取最长） */
export function measureWeekdayColumnWidth(labels: string[]): number {
  const width = measureMaxTextWidth(labels);
  return width > 0 ? width : 18;
}

/**
 * 末月文案向右的溢出留白：文案宽 - 最小格子边长（7px）。
 * 月份标签盒宽只有一格，「11 月」必然向右超出；留出这段空间才能在不撑大滚动宽度的前提下完整显示。
 */
export function measureMonthLabelReserve(months: string[]): number {
  return Math.max(measureMaxTextWidth(months) - 7, 0);
}

export function buildMonthLabels(weeks: GridCell[][], months: string[]): string[] {
  const labels: string[] = [];
  let firstLabelIndex = -1;
  let secondLabelIndex = -1;

  for (let i = 0; i < weeks.length; i++) {
    // 只挂在包含该月 1 号的周列上；开头残月不显示
    const firstOfMonth = weeks[i].find((c) => c.date && c.date.endsWith("01"));
    if (firstOfMonth) {
      const month = Number(firstOfMonth.date.slice(4, 6)) - 1;
      labels.push(months[month] || "");
      if (firstLabelIndex < 0) {
        firstLabelIndex = i;
      } else if (secondLabelIndex < 0) {
        secondLabelIndex = i;
      }
    } else {
      labels.push("");
    }
  }

  // 开头月份若周数过少，文案会溢出并与下一月重叠，故不显示
  if (firstLabelIndex >= 0 && secondLabelIndex >= 0 && secondLabelIndex - firstLabelIndex < 2) {
    labels[firstLabelIndex] = "";
  }
  return labels;
}

/** 近一年滚动窗（可跨两个日历年） */
function buildRollingYearGrid(countMap: DayActivityMap, weekStart: WeekStart): PeriodGrid {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  alignToWeekStart(start, weekStart);

  return fillGrid(start, today, countMap);
}

/** 单个日历年：年初对齐周起始，当前年截止到今天 */
function buildCalendarYearGrid(countMap: DayActivityMap, year: number, weekStart: WeekStart): PeriodGrid {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(year, 0, 1);
  alignToWeekStart(start, weekStart);

  let end = new Date(year, 11, 31);
  if (year === today.getFullYear() && end > today) {
    end = today;
  }

  // 起始对齐后可能落到上一年，格子只统计本年内的 count，跨年占位用 empty
  return fillCalendarGrid(start, end, year, countMap);
}

function cellFromMap(countMap: DayActivityMap, key: string): GridCell {
  const activity = countMap.get(key);
  return { date: key, count: activity?.count || 0, docs: activity?.docs || 0 };
}

function fillGrid(start: Date, end: Date, countMap: DayActivityMap): PeriodGrid {
  const cells: GridCell[] = [];
  const weeks: GridCell[][] = [];
  let week: GridCell[] = [];

  for (let cursor = new Date(start); ; cursor.setDate(cursor.getDate() + 1)) {
    if (cursor > end) break;
    const key = formatDateKey(cursor);
    const cell = cellFromMap(countMap, key);
    cells.push(cell);
    week.push(cell);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) {
      week.push({ date: "", count: -1, docs: 0 });
    }
    weeks.push(week);
  }

  return { cells: cells.filter((c) => c.count >= 0), weeks };
}

function fillCalendarGrid(start: Date, end: Date, year: number, countMap: DayActivityMap): PeriodGrid {
  const cells: GridCell[] = [];
  const weeks: GridCell[][] = [];
  let week: GridCell[] = [];
  const yearPrefix = String(year);

  for (let cursor = new Date(start); ; cursor.setDate(cursor.getDate() + 1)) {
    if (cursor > end) break;
    const key = formatDateKey(cursor);
    let cell: GridCell;
    if (!key.startsWith(yearPrefix)) {
      // 对齐产生的上一年占位，不计入统计
      cell = { date: "", count: -1, docs: 0 };
    } else {
      cell = cellFromMap(countMap, key);
      cells.push(cell);
    }
    week.push(cell);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) {
      week.push({ date: "", count: -1, docs: 0 });
    }
    weeks.push(week);
  }

  return { cells, weeks };
}
