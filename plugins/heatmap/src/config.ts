import { Menu } from "siyuan";
import { heatHexFromHue, hexToOklch } from "./color-oklch";
import type { I18n } from "./i18n";
import { DEFAULT_COUNT_THRESHOLDS, DEFAULT_PERCENTILE_THRESHOLDS } from "./levels";
import type { DisplayMode, HeatMapConfigOptions, LevelCuts, LevelMode, StatMode, ViewMode, WeekStart, YearOrder } from "./types";

/**
 * 生成显示范围可选的起始年份（从新到旧）：
 * 从 min(库内最早年, 已选 fromYear, 今年) 到今年。
 * 选择某年表示显示「该年 → 今年」的连续区间。
 */
export function buildYearOptions(earliestFromDb: number | null, fromYear: number | null, now = new Date()): number[] {
  const currentYear = now.getFullYear();
  const candidates = [currentYear];
  if (earliestFromDb != null) {
    candidates.push(earliestFromDb);
  }
  if (fromYear != null) {
    candidates.push(fromYear);
  }
  const minYear = Math.min(...candidates);
  const years: number[] = [];
  for (let y = currentYear; y >= minYear; y--) {
    years.push(y);
  }
  return years;
}

/** 展开 [fromYear, toYear] 闭区间年份列表 */
export function expandYearRange(fromYear: number, toYear: number): number[] {
  const start = Math.min(fromYear, toYear);
  const end = Math.max(fromYear, toYear);
  const years: number[] = [];
  for (let y = start; y <= end; y++) {
    years.push(y);
  }
  return years;
}

/** 标题栏显示范围切换项：「最近一年」或某一起始年 */
export type DisplayRangeOption = { kind: "recent" } | { kind: "years"; fromYear: number };

/** 生成 [最近一年, 今年, …, 最早年] 切换序列 */
export function buildDisplayRangeOptions(yearOptions: number[]): DisplayRangeOption[] {
  return [{ kind: "recent" }, ...yearOptions.map((fromYear) => ({ kind: "years" as const, fromYear }))];
}

/** 当前配置在切换序列中的下标；找不到时回退「最近一年」 */
export function getDisplayRangeIndex(config: Pick<HeatMapConfigOptions, "displayMode" | "fromYear">, options: DisplayRangeOption[]): number {
  if (config.displayMode !== "years" || config.fromYear == null) {
    return 0;
  }
  const idx = options.findIndex((item) => item.kind === "years" && item.fromYear === config.fromYear);
  return idx >= 0 ? idx : 0;
}

/**
 * 标题中间文案：
 * - recent →「最近一年」
 * - 仅今年 →「2026」
 * - 跨年 →「2025-2026」
 */
export function getDisplayRangeLabel(config: Pick<HeatMapConfigOptions, "displayMode" | "fromYear">, recentLabel: string, now = new Date()): string {
  if (config.displayMode !== "years" || config.fromYear == null) {
    return recentLabel;
  }
  const currentYear = now.getFullYear();
  const fromYear = Math.min(config.fromYear, currentYear);
  if (fromYear >= currentYear) {
    return String(currentYear);
  }
  return `${fromYear}-${currentYear}`;
}

/** 将切换项转为配置补丁 */
export function displayRangeOptionToPatch(option: DisplayRangeOption): Pick<HeatMapConfigOptions, "displayMode" | "fromYear"> {
  if (option.kind === "recent") {
    return { displayMode: "recent", fromYear: null };
  }
  return { displayMode: "years", fromYear: option.fromYear };
}

export interface OpenConfigMenuOptions {
  i18n: I18n;
  /** 读取当前配置（每次点击时取最新，避免菜单闭包快照过期） */
  getConfig: () => HeatMapConfigOptions;
  rect: DOMRect;
  isMobile: boolean;
  onChange: (patch: Partial<HeatMapConfigOptions>) => void;
  /** 打开「筛选笔记本」勾选 Dialog */
  onOpenScope: () => void;
  /** 打开「颜色」十六进制配置 Dialog */
  onOpenColor: () => void;
  /** 打开「格子档位」阈值 Dialog */
  onOpenLevels: () => void;
}

/** 弹出配置菜单（视图、统计方式、年份排序、每周第一天、筛选笔记本、格子档位、颜色、记住弹窗位置） */
export function openConfigMenu(options: OpenConfigMenuOptions): void {
  const { i18n, getConfig, rect, isMobile, onChange, onOpenScope, onOpenColor, onOpenLevels } = options;
  const config = getConfig();
  const menu = new Menu("heatmap-config");

  menu.addItem({
    id: "heatmap-view-mode",
    label: i18n.viewMode,
    iconHTML: "",
    type: "submenu",
    submenu: [
      {
        id: "heatmap-view-heatmap",
        label: i18n.viewModeHeatmap,
        iconHTML: "",
        checked: config.viewMode === "heatmap",
        click: () => {
          if (getConfig().viewMode !== "heatmap") {
            onChange({ viewMode: "heatmap" });
          }
        },
      },
      {
        id: "heatmap-view-calendar",
        label: i18n.viewModeCalendar,
        iconHTML: "",
        checked: config.viewMode === "calendar",
        click: () => {
          if (getConfig().viewMode !== "calendar") {
            onChange({ viewMode: "calendar" });
          }
        },
      },
    ],
  });

  menu.addItem({
    id: "heatmap-stat-mode",
    label: i18n.statMode,
    iconHTML: "",
    type: "submenu",
    submenu: [
      {
        id: "heatmap-stat-created",
        label: i18n.statModeCreated,
        iconHTML: "",
        checked: config.statMode === "created",
        click: () => {
          if (getConfig().statMode !== "created") {
            onChange({ statMode: "created" });
          }
        },
      },
      {
        id: "heatmap-stat-updated",
        label: i18n.statModeUpdated,
        iconHTML: "",
        checked: config.statMode === "updated",
        click: () => {
          if (getConfig().statMode !== "updated") {
            onChange({ statMode: "updated" });
          }
        },
      },
      {
        id: "heatmap-stat-mixed",
        label: i18n.statModeMixed,
        iconHTML: "",
        checked: config.statMode === "mixed",
        click: () => {
          if (getConfig().statMode !== "mixed") {
            onChange({ statMode: "mixed" });
          }
        },
      },
    ],
  });

  menu.addItem({
    id: "heatmap-year-order",
    label: i18n.yearOrder,
    iconHTML: "",
    type: "submenu",
    submenu: [
      {
        id: "heatmap-year-order-newest",
        label: i18n.yearOrderNewestFirst,
        iconHTML: "",
        checked: config.yearOrder === "newestFirst",
        click: () => {
          if (getConfig().yearOrder !== "newestFirst") {
            onChange({ yearOrder: "newestFirst" });
          }
        },
      },
      {
        id: "heatmap-year-order-oldest",
        label: i18n.yearOrderOldestFirst,
        iconHTML: "",
        checked: config.yearOrder === "oldestFirst",
        click: () => {
          if (getConfig().yearOrder !== "oldestFirst") {
            onChange({ yearOrder: "oldestFirst" });
          }
        },
      },
    ],
  });

  menu.addItem({
    id: "heatmap-week-start",
    label: i18n.weekStart,
    iconHTML: "",
    type: "submenu",
    submenu: [
      {
        id: "heatmap-week-monday",
        label: i18n.weekStartMonday,
        iconHTML: "",
        checked: config.weekStart === "monday",
        click: () => {
          if (getConfig().weekStart !== "monday") {
            onChange({ weekStart: "monday" });
          }
        },
      },
      {
        id: "heatmap-week-sunday",
        label: i18n.weekStartSunday,
        iconHTML: "",
        checked: config.weekStart === "sunday",
        click: () => {
          if (getConfig().weekStart !== "sunday") {
            onChange({ weekStart: "sunday" });
          }
        },
      },
    ],
  });

  menu.addItem({
    id: "heatmap-stat-scope",
    label: i18n.statScope,
    iconHTML: "",
    click: () => {
      onOpenScope();
    },
  });

  menu.addItem({
    id: "heatmap-levels",
    label: i18n.levels,
    iconHTML: "",
    click: () => {
      onOpenLevels();
    },
  });

  menu.addItem({
    id: "heatmap-color",
    label: i18n.color,
    iconHTML: "",
    click: () => {
      onOpenColor();
    },
  });

  menu.addItem({
    id: "jchm-persist-position",
    label: i18n.persistPosition,
    iconHTML: "",
    checked: config.persistPosition,
    click: () => {
      onChange({ persistPosition: !getConfig().persistPosition });
    },
  });

  if (isMobile) {
    menu.fullscreen();
  } else {
    menu.open({
      x: rect.right,
      y: rect.bottom,
      isLeft: true,
    });
  }
}

export function isStatMode(value: unknown): value is StatMode {
  return value === "created" || value === "updated" || value === "mixed";
}

export function isWeekStart(value: unknown): value is WeekStart {
  return value === "monday" || value === "sunday";
}

export function isYearOrder(value: unknown): value is YearOrder {
  return value === "newestFirst" || value === "oldestFirst";
}

export function isDisplayMode(value: unknown): value is DisplayMode {
  return value === "recent" || value === "years";
}

export function isViewMode(value: unknown): value is ViewMode {
  return value === "heatmap" || value === "calendar";
}

export function isLevelMode(value: unknown): value is LevelMode {
  return value === "percentile" || value === "count";
}

/**
 * 规范化档位三元组：
 * - 非数组 / 长度不足 → 回退默认
 * - 百分位：整数钳到 1–100，再升序
 * - 块数：正整数（≥ 1），再升序
 */
export function normalizeLevelCuts(mode: LevelMode, value: unknown): LevelCuts {
  const fallback = mode === "percentile" ? DEFAULT_PERCENTILE_THRESHOLDS : DEFAULT_COUNT_THRESHOLDS;
  if (!Array.isArray(value) || value.length < 3) {
    return fallback;
  }
  const parsed: number[] = [];
  for (let i = 0; i < 3; i++) {
    const n = Number(value[i]);
    if (!Number.isFinite(n)) {
      return fallback;
    }
    if (mode === "percentile") {
      const clamped = Math.min(100, Math.max(1, Math.round(n)));
      parsed.push(clamped);
    } else {
      const int = Math.round(n);
      if (int < 1) {
        return fallback;
      }
      parsed.push(int);
    }
  }
  parsed.sort((a, b) => a - b);
  return [parsed[0], parsed[1], parsed[2]];
}

export function normalizeFromYear(value: unknown): number | null {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1970 || year > 2100) {
    return null;
  }
  return year;
}

/**
 * 规范化统计范围：
 * - null / 缺省 → 不限制
 * - 非数组 → 回退不限制
 * - 数组 → 去重后的非空字符串 id 列表（可为空数组）
 */
export function normalizeIncludedBoxIds(value: unknown): string[] | null {
  if (value == null) {
    return null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const id = item.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * 规范化热力主色：
 * - null / 空 / 非法 → null（跟随主题）
 * - 接受 #RGB / #RRGGBB（可省略 #），统一为小写 #RRGGBB
 */
export function normalizeHeatColor(value: unknown): string | null {
  if (value == null || typeof value !== "string") {
    return null;
  }
  const raw = value.trim();
  if (!raw) {
    return null;
  }
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toLowerCase()}`;
  }
  return null;
}

function resolveCssHex(host: Element, cssColor: string): string | null {
  const probe = document.createElement("span");
  probe.style.color = cssColor;
  const parent = host.isConnected ? host : document.body;
  parent.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const match = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) {
    return null;
  }
  const toHex = (n: string) => Number(n).toString(16).padStart(2, "0");
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}

/**
 * 把热力主色写到根节点 CSS 变量；null 则清除以回退主题色。
 * 自定义色只保留色相，L/C 按当前主题与字色重新钳制（明暗切换后需再调用）。
 */
export function applyHeatColor(el: HTMLElement, color: string | null): void {
  if (color) {
    const textL = hexToOklch(resolveCssHex(el, "var(--b3-theme-on-surface)") || "")?.l ?? 0.25;
    const surfaceL = hexToOklch(resolveCssHex(el, "var(--b3-theme-surface)") || "")?.l ?? 0.95;
    const themeHex = resolveCssHex(el, "var(--b3-theme-primary)") || "#3575f0";
    const themeOklch = hexToOklch(themeHex) ?? { l: 0.55, c: 0.14, h: 250 };
    const hue = hexToOklch(color)?.h ?? themeOklch.h;
    el.style.setProperty("--jchm-heat", heatHexFromHue(hue, themeOklch, textL, surfaceL));
  } else {
    el.style.removeProperty("--jchm-heat");
  }
}
