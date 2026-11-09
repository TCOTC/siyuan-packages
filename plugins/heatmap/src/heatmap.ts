export type { DayCount, DayDoc, DayDocsResult, DisplayMode, HeatMapConfigOptions, LevelCuts, LevelMode, ScopeNotebook, StatMode, ViewMode, WeekStart, YearOrder } from "./types";

export {
  applyHeatColor,
  buildDisplayRangeOptions,
  buildYearOptions,
  displayRangeOptionToPatch,
  expandYearRange,
  getDisplayRangeIndex,
  getDisplayRangeLabel,
  isDisplayMode,
  isLevelMode,
  isStatMode,
  isViewMode,
  isWeekStart,
  isYearOrder,
  normalizeFromYear,
  normalizeHeatColor,
  normalizeIncludedBoxIds,
  normalizeLevelCuts,
  openConfigMenu,
  type DisplayRangeOption,
  type OpenConfigMenuOptions,
} from "./config";

export { openColorDialog, type OpenColorDialogOptions } from "./color-dialog";

export { openLevelsDialog, type OpenLevelsDialogOptions } from "./level-dialog";

export { openScopeDialog, type OpenScopeDialogOptions } from "./scope-dialog";

export { buildBoxFilter, DAY_DOCS_LIMIT, getActivityCacheKey, queryActivity, queryDayDocs, queryEarliestYear, type ActivityResult } from "./query";

export { renderHeatMap } from "./render-heatmap";

export { renderDayDocList, renderDayLoading, type RenderDayDocListOptions, type RenderDayLoadingOptions } from "./render-day";
