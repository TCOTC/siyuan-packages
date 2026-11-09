export type StatMode = "created" | "updated" | "mixed";
export type WeekStart = "monday" | "sunday";
export type YearOrder = "newestFirst" | "oldestFirst";

/**
 * 显示范围：
 * - recent：近一年滚动窗（可跨两个日历年）
 * - years：从 fromYear 到今年的每个日历年分行显示
 */
export type DisplayMode = "recent" | "years";

/**
 * 展示形式：
 * - heatmap：GitHub 风格连续周列热力图
 * - calendar：传统日历，每个月一个方块
 */
export type ViewMode = "heatmap" | "calendar";

/**
 * 格子档位划分方式：
 * - percentile：按正样本分位数（默认 25/50/75）
 * - count：按绝对块数阈值
 */
export type LevelMode = "percentile" | "count";

/** 三档上限（1/2/3 级），第 4 级为超过第三档 */
export type LevelCuts = readonly [number, number, number];

export interface DayCount {
  date: string; // YYYYMMDD
  /** 当日叶子块数 */
  count: number;
  /** 当日有活动的文档数（按 root_id 去重） */
  docs: number;
}

export interface DayDoc {
  id: string;
  title: string;
  icon: string;
  count: number;
}

/** 单日文档查询结果；truncated 表示实际超过展示上限 */
export interface DayDocsResult {
  docs: DayDoc[];
  truncated: boolean;
  /** 当日实际文档总数（不受列表截断影响） */
  totalDocs: number;
  /** 当日实际块总数（不受列表截断影响） */
  totalBlocks: number;
}

export interface HeatMapConfigOptions {
  statMode: StatMode;
  weekStart: WeekStart;
  displayMode: DisplayMode;
  /** 按年模式下的起始年；显示 [fromYear, 今年]；切回「最近一年」时清空 */
  fromYear: number | null;
  yearOrder: YearOrder;
  viewMode: ViewMode;
  /**
   * 统计范围（笔记本白名单）：
   * - null：不限制（全部笔记本，含日后新建）
   * - string[]：仅统计这些 boxId；空数组表示不统计任何笔记本
   */
  includedBoxIds: string[] | null;
  /**
   * 热力主色（十六进制，如 #40c463）：
   * - null：跟随主题 --b3-theme-primary
   */
  color: string | null;
  /** 格子档位划分方式 */
  levelMode: LevelMode;
  /** 百分位模式阈值（1–100），默认 25/50/75 */
  percentileThresholds: LevelCuts;
  /** 块数模式阈值（正整数块数），默认 1/10/40 */
  countThresholds: LevelCuts;
  /** 是否记住主弹窗拖拽后的位置与尺寸（下次打开复用） */
  persistPosition: boolean;
}

/** 统计范围 Dialog 中展示的笔记本条目 */
export interface ScopeNotebook {
  id: string;
  name: string;
  icon: string;
  closed: boolean;
  encrypted: boolean;
}
