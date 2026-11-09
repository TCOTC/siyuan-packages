import { Dialog, getFrontend, openMobileFileById, openTab, Plugin, showMessage } from "siyuan";
import { getDefaultWeekStart, getI18n } from "./i18n";
import {
  applyHeatColor,
  buildDisplayRangeOptions,
  buildYearOptions,
  displayRangeOptionToPatch,
  getActivityCacheKey,
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
  openColorDialog,
  openConfigMenu,
  openLevelsDialog,
  openScopeDialog,
  queryActivity,
  queryDayDocs,
  queryEarliestYear,
  renderDayDocList,
  renderDayLoading,
  renderHeatMap,
  type DayCount,
  type DayDocsResult,
  type DisplayMode,
  type LevelCuts,
  type LevelMode,
  type StatMode,
  type ViewMode,
  type WeekStart,
  type YearOrder,
} from "./heatmap";
import { DEFAULT_COUNT_THRESHOLDS, DEFAULT_PERCENTILE_THRESHOLDS } from "./levels";
import "./index.scss";

const STORAGE_NAME = "config.json";
/** 查询超过该时间仍未返回时，再显示 Loading 占位弹窗/面板 */
const LOADING_DELAY_MS = 700;
/** 主弹窗位置持久化在思源 local-dialogposition 中的键 */
const DIALOG_POSITION_ID = "jchm-dialog";

interface PluginConfig {
  statMode: StatMode;
  weekStart: WeekStart;
  displayMode: DisplayMode;
  fromYear: number | null;
  yearOrder: YearOrder;
  viewMode: ViewMode;
  includedBoxIds: string[] | null;
  color: string | null;
  levelMode: LevelMode;
  percentileThresholds: LevelCuts;
  countThresholds: LevelCuts;
  persistPosition: boolean;
}

export default class HeatMap extends Plugin {
  private isMobile = false;
  private dialog?: Dialog;
  private config: PluginConfig = {
    statMode: "created",
    weekStart: getDefaultWeekStart(),
    displayMode: "recent",
    fromYear: null,
    yearOrder: "newestFirst",
    viewMode: "heatmap",
    includedBoxIds: null,
    color: null,
    levelMode: "percentile",
    percentileThresholds: DEFAULT_PERCENTILE_THRESHOLDS,
    countThresholds: DEFAULT_COUNT_THRESHOLDS,
    persistPosition: false,
  };
  private refreshing = false;
  /** 刷新进行中又收到配置变更时，结束后再刷一次最新配置 */
  private refreshQueued = false;
  private loadingDay = false;
  private view: "heatmap" | "day" = "heatmap";
  /** 进入日详情前暂存热力图面板，返回时直接还原，避免重复 SQL */
  private cachedHeatmapPanel: HTMLElement | null = null;
  /** 标题栏显示范围可选起始年（含库内最早年查询结果） */
  private rangeNavYearOptions: number[] = [];
  /** 监听弹窗宽度：过窄时隐藏标题，更窄时收起范围文案只留箭头 */
  private titleVisibilityObserver?: ResizeObserver;
  /** 下次挂载图表后按内容重新撑开弹窗（视图 / 范围切换） */
  private pendingDialogFit = false;
  /** 打开统计面板时的请求；关闭弹窗或重复打开前 abort */
  private openAbort?: AbortController;
  /** 日详情请求；关闭弹窗 / 返回热力图时 abort */
  private dayAbort?: AbortController;
  /** 热力图刷新请求 */
  private chartAbort?: AbortController;
  /** 配置从磁盘加载完成（点击顶栏时等待） */
  private configReady: Promise<void> = Promise.resolve();
  /** 串行化 saveData，避免并发写回旧配置 */
  private saveChain: Promise<void> = Promise.resolve();
  /** 外观切换后延迟重算热力色（等主题 CSS 生效） */
  private heatColorThemeTimer = 0;
  /**
   * 弹窗生命周期内的 SQL 结果缓存。
   * 弹窗打开后用户通常无法编辑文档，数据可视为稳定；关闭时全部清空。
   */
  private cachedDays: DayCount[] | null = null;
  private cachedTotalDocs = 0;
  private cachedDaysKey: string | null = null;
  private earliestYearCache: { key: string; year: number | null } | null = null;
  private dayDocsCache = new Map<string, DayDocsResult>();

  override onload() {
    // 对齐思源 litheness：symbol + viewBox 24 + stroke currentColor 1.7
    this.addIcons('<symbol id="iconJCHMFlame" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/></symbol>');

    this.configReady = this.loadData(STORAGE_NAME)
      .then((data) => {
        this.config = this.normalizeConfig(data);
      })
      .catch((e) => {
        const errorMessage = `${this.displayName}: failed to load data [${STORAGE_NAME}]: ${e.msg}`;
        showMessage(errorMessage);
        console.error(errorMessage);
      });

    console.log(this.displayName, "plugin loaded");
  }

  override onLayoutReady() {
    const frontEnd = getFrontend();
    this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
    const i18n = getI18n();

    this.addTopBar({
      icon: "iconJCHMFlame",
      title: i18n.openHeatMap,
      position: "left",
      callback: () => {
        this.openHeatMap();
      },
    });

    this.addCommand({
      langKey: "openHeatMap",
      langText: i18n.openHeatMapCommand,
      hotkey: "",
      callback: () => {
        this.openHeatMap();
      },
    });

    // 明暗 / 主题切换后按当前字色与主题主色重算自定义热力色
    this.eventBus.on("ws-main", this.onWsMain);

    console.log(this.displayName, "plugin layout ready");
  }

  override onunload() {
    this.eventBus.off("ws-main", this.onWsMain);
    window.clearTimeout(this.heatColorThemeTimer);
    this.abortAllLoads();
    this.dialog?.destroy();
    console.log(this.displayName, "plugin unloaded");
  }

  override uninstall() {
    this.removeData(STORAGE_NAME).catch((e) => {
      const errorMessage = `${this.displayName}: failed to uninstall remove data [${STORAGE_NAME}]: ${e.msg}`;
      showMessage(errorMessage);
      console.error(errorMessage);
    });

    console.log(this.displayName, "plugin uninstalled");
  }

  private normalizeConfig(data: unknown): PluginConfig {
    const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const fromYear = normalizeFromYear(raw.fromYear);
    let displayMode: DisplayMode = isDisplayMode(raw.displayMode) ? raw.displayMode : "recent";
    if (displayMode === "years" && fromYear == null) {
      displayMode = "recent";
    }
    return {
      statMode: isStatMode(raw.statMode) ? raw.statMode : "created",
      weekStart: isWeekStart(raw.weekStart) ? raw.weekStart : getDefaultWeekStart(),
      displayMode,
      fromYear: displayMode === "years" ? fromYear : null,
      yearOrder: isYearOrder(raw.yearOrder) ? raw.yearOrder : "newestFirst",
      viewMode: isViewMode(raw.viewMode) ? raw.viewMode : "heatmap",
      includedBoxIds: normalizeIncludedBoxIds(raw.includedBoxIds),
      color: normalizeHeatColor(raw.color),
      levelMode: isLevelMode(raw.levelMode) ? raw.levelMode : "percentile",
      percentileThresholds: normalizeLevelCuts("percentile", raw.percentileThresholds),
      countThresholds: normalizeLevelCuts("count", raw.countThresholds),
      persistPosition: raw.persistPosition === true,
    };
  }

  private saveConfig() {
    this.saveChain = this.saveChain
      .catch((): void => undefined)
      .then(async (): Promise<void> => {
        try {
          await this.saveData(STORAGE_NAME, this.config);
        } catch (e) {
          console.error(this.displayName, "save config failed", e);
        }
      });
  }

  private abortAllLoads() {
    this.openAbort?.abort();
    this.dayAbort?.abort();
    this.chartAbort?.abort();
    this.openAbort = undefined;
    this.dayAbort = undefined;
    this.chartAbort = undefined;
  }

  private isAbortError(error: unknown): boolean {
    return (error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && error.name === "AbortError");
  }

  /** 先等数据；超过 delay 仍未完成则回调展示 Loading，再继续等到数据或 abort */
  private async awaitWithLoadingDelay<T>(task: Promise<T>, onShowLoading: () => void, signal: AbortSignal, delayMs = LOADING_DELAY_MS): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delayPromise = new Promise<"delay">((resolve) => {
      timer = setTimeout(() => resolve("delay"), delayMs);
    });

    try {
      const raced = await Promise.race([task.then((value) => ({ kind: "data" as const, value })), delayPromise.then(() => ({ kind: "delay" as const }))]);
      if (raced.kind === "data") {
        return raced.value;
      }
      if (!signal.aborted) {
        onShowLoading();
      }
      return await task;
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  private async openHeatMap() {
    if (this.dialog || this.openAbort) {
      return;
    }

    await this.configReady;
    // 等待配置期间可能已打开或正在打开
    if (this.dialog || this.openAbort) {
      return;
    }

    this.view = "heatmap";
    this.cachedHeatmapPanel = null;
    this.openAbort = new AbortController();
    const { signal } = this.openAbort;
    const i18n = getI18n();

    try {
      const { days, totalDocs } = await this.awaitWithLoadingDelay(
        queryActivity(this.config.statMode, this.config, signal),
        () => {
          this.ensureDialog(true);
        },
        signal,
      );
      if (signal.aborted) {
        return;
      }

      this.ensureDialog(false);
      const container = this.getDialogBody();
      if (!container) {
        return;
      }
      this.cachedDays = days;
      this.cachedTotalDocs = totalDocs;
      this.cachedDaysKey = getActivityCacheKey(this.config.statMode, this.config);
      this.mountHeatmapPanel(container, days, totalDocs);
    } catch (e) {
      if (this.isAbortError(e) || signal.aborted) {
        return;
      }
      console.error(this.displayName, e);
      showMessage(`${this.displayName}: ${i18n.loadFailed}`);
      if (this.dialog) {
        const container = this.getDialogBody();
        if (container) {
          const panel = document.createElement("div");
          panel.className = "jchm-panel";
          panel.textContent = i18n.loadFailed;
          container.replaceChildren(panel);
        }
      }
    } finally {
      if (this.openAbort?.signal === signal) {
        this.openAbort = undefined;
      }
    }
  }

  /** 若弹窗尚未创建则创建；withLoading 为首次内容是否使用 Loading 占位 */
  private ensureDialog(withLoading: boolean) {
    if (this.dialog) {
      return;
    }

    const i18n = getI18n();
    const content = document.createElement("div");
    content.className = "b3-dialog__content jchm-dialog";
    if (withLoading) {
      const panel = document.createElement("div");
      panel.className = "jchm-panel";
      panel.appendChild(this.createLoadingEl());
      content.appendChild(panel);
    } else {
      const panel = document.createElement("div");
      panel.className = "jchm-panel";
      const chartHost = document.createElement("div");
      chartHost.className = "jchm-panel__chart";
      panel.appendChild(chartHost);
      content.appendChild(panel);
    }

    this.dialog = new Dialog({
      positionId: this.config.persistPosition ? DIALOG_POSITION_ID : undefined,
      title: i18n.heatmapTitle,
      content: content.outerHTML,
      width: "max-content",
      destroyCallback: () => {
        this.titleVisibilityObserver?.disconnect();
        this.titleVisibilityObserver = undefined;
        this.abortAllLoads();
        this.dialog = undefined;
        this.view = "heatmap";
        this.cachedHeatmapPanel = null;
        this.pendingDialogFit = false;
        this.clearQueryCaches();
        this.refreshing = false;
        this.refreshQueued = false;
        this.loadingDay = false;
      },
    });

    if (this.config.persistPosition) {
      this.dialog.element.setAttribute("data-key", DIALOG_POSITION_ID);
    }
    this.dialog.element.querySelector(".b3-dialog")?.classList.add("jchm-dialog-host");
    this.dialog.element.querySelector(".b3-dialog__container")?.classList.add("jchm-dialog__container");
    this.mountRangeNavigator(this.dialog.element);
    this.mountSettingsButton(this.dialog.element);
    this.bindHeaderLayout(this.dialog.element);
    void this.refreshRangeNavigatorYears();
  }

  /** 在弹窗标题栏居中挂载「< 范围 >」切换，左侧保留原标题 */
  private mountRangeNavigator(dialogEl: HTMLElement) {
    const header = dialogEl.querySelector(".b3-dialog__header") as HTMLElement | null;
    if (!header || header.querySelector(".jchm-range-nav")) {
      return;
    }

    const i18n = getI18n();
    header.classList.add("jchm-dialog__header");

    const title = document.createElement("span");
    title.className = "jchm-dialog__title";
    title.textContent = i18n.heatmapTitle;

    const nav = document.createElement("div");
    nav.className = "jchm-range-nav";
    nav.setAttribute("role", "group");
    nav.setAttribute("aria-label", i18n.displayRange);

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "jchm-range-nav__btn block__icon block__icon--show";
    prev.setAttribute("aria-label", "<");
    prev.innerHTML = '<svg><use xlink:href="#iconLeft"></use></svg>';

    const label = document.createElement("span");
    label.className = "jchm-range-nav__label";

    const next = document.createElement("button");
    next.type = "button";
    next.className = "jchm-range-nav__btn block__icon block__icon--show";
    next.setAttribute("aria-label", ">");
    next.innerHTML = '<svg><use xlink:href="#iconRight"></use></svg>';

    const stopDrag = (event: Event) => {
      // 必须 stopPropagation：思源在 container mousedown 里只要点到 resize__move
      //（标题栏）就会把 width 钉成像素，之后 max-content 再也撑不开
      // 只拦左右按钮；中间 label 仍可冒泡，以便拖拽弹窗
      event.preventDefault();
      event.stopPropagation();
    };
    prev.addEventListener("mousedown", stopDrag);
    next.addEventListener("mousedown", stopDrag);
    prev.addEventListener("click", (event) => {
      event.preventDefault();
      this.shiftDisplayRange(1);
    });
    next.addEventListener("click", (event) => {
      event.preventDefault();
      this.shiftDisplayRange(-1);
    });

    nav.append(prev, label, next);
    header.replaceChildren(title, nav);

    this.rangeNavYearOptions = buildYearOptions(null, this.config.fromYear);
    this.syncRangeNavigator();
  }

  /** 监听容器尺寸，同步标题 / 范围文案的显隐 */
  private bindHeaderLayout(dialogEl: HTMLElement) {
    const container = dialogEl.querySelector(".jchm-dialog__container") as HTMLElement | null;
    if (!container) {
      return;
    }
    this.titleVisibilityObserver?.disconnect();
    this.titleVisibilityObserver = new ResizeObserver(() => {
      this.syncHeaderLayout();
    });
    this.titleVisibilityObserver.observe(container);
    this.syncHeaderLayout();
  }

  /**
   * 标题栏自适应布局：
   * 1. 范围切换将碰到设置按钮时，收起中间文案只留箭头；
   * 2. 标题将碰到范围切换时整段隐藏（不截断）。
   */
  private syncHeaderLayout() {
    const header = this.dialog?.element.querySelector(".jchm-dialog__header") as HTMLElement | null;
    const title = header?.querySelector(".jchm-dialog__title") as HTMLElement | null;
    const nav = header?.querySelector(".jchm-range-nav") as HTMLElement | null;
    const label = nav?.querySelector(".jchm-range-nav__label") as HTMLElement | null;
    const setting = header?.querySelector(".jchm-dialog__setting") as HTMLElement | null;
    if (!nav) {
      return;
    }

    const gap = 8;
    const i18n = getI18n();

    // 先恢复文案再量；与设置重叠则只留箭头
    if (label) {
      label.classList.remove("fn__none");
      if (setting) {
        const overlapsSetting = nav.getBoundingClientRect().right + gap > setting.getBoundingClientRect().left;
        label.classList.toggle("fn__none", overlapsSetting);
      }
      // 文案隐藏时把当前范围挂到导航上，便于读屏
      const rangeText = label.textContent || i18n.displayRange;
      nav.setAttribute("aria-label", label.classList.contains("fn__none") ? rangeText : i18n.displayRange);
    }

    // 再处理左侧标题：与范围切换重叠则隐藏
    if (title) {
      title.classList.remove("fn__none");
      const overlapsNav = title.getBoundingClientRect().right + gap > nav.getBoundingClientRect().left;
      title.classList.toggle("fn__none", overlapsNav);
    }
  }

  /** 按当前配置与可选年刷新标题栏文案与左右按钮可用性 */
  private syncRangeNavigator() {
    const nav = this.dialog?.element.querySelector(".jchm-range-nav") as HTMLElement | null;
    if (!nav) {
      return;
    }
    const i18n = getI18n();
    const options = buildDisplayRangeOptions(this.rangeNavYearOptions);
    const index = getDisplayRangeIndex(this.config, options);
    const label = nav.querySelector(".jchm-range-nav__label");
    if (label) {
      label.textContent = getDisplayRangeLabel(this.config, i18n.displayRecentYear);
    }
    const buttons = nav.querySelectorAll(".jchm-range-nav__btn");
    const prev = buttons[0] as HTMLButtonElement | undefined;
    const next = buttons[1] as HTMLButtonElement | undefined;
    if (prev) {
      prev.disabled = index >= options.length - 1;
    }
    if (next) {
      next.disabled = index <= 0;
    }
    // 范围文案变长/变短后，重新判断标题与中间文案显隐
    this.syncHeaderLayout();
  }

  /** 拉取库内最早年后更新标题栏可切换年份 */
  private async refreshRangeNavigatorYears() {
    const earliest = await this.resolveEarliestYear();
    if (!this.dialog) {
      return;
    }
    this.rangeNavYearOptions = buildYearOptions(earliest, this.config.fromYear);
    this.syncRangeNavigator();
  }

  /**
   * 左右切换显示范围。
   * delta > 0：更早（最近一年 → 今年 → … → 最早年）；
   * delta < 0：更新。
   */
  private shiftDisplayRange(delta: number) {
    const options = buildDisplayRangeOptions(this.rangeNavYearOptions);
    const index = getDisplayRangeIndex(this.config, options);
    const next = options[index + delta];
    if (!next) {
      return;
    }
    this.applyConfigPatch(displayRangeOptionToPatch(next));
  }

  /** 外观 / 主题 CSS 刷新后，重算已打开面板上的自定义热力色 */
  private onWsMain = (event: CustomEvent) => {
    const cmd = (event as CustomEvent<{ cmd?: string }>).detail?.cmd;
    if (cmd !== "setAppearance" && cmd !== "refreshtheme") {
      return;
    }
    window.clearTimeout(this.heatColorThemeTimer);
    // 等主题 stylesheet / CSS 变量写入后再读 on-surface / primary
    this.heatColorThemeTimer = window.setTimeout(() => {
      this.reapplyOpenHeatColors();
    }, 80);
  };

  private reapplyOpenHeatColors() {
    if (!this.config.color) {
      return;
    }
    const chartHost = this.dialog?.element.querySelector(".jchm-panel__chart") as HTMLElement | null;
    const roots = [chartHost?.querySelector(".jchm"), this.cachedHeatmapPanel?.querySelector(".jchm")];
    for (const root of roots) {
      if (root instanceof HTMLElement) {
        applyHeatColor(root, this.config.color);
      }
    }
  }

  /** 应用配置补丁：持久化并按需刷新图表 / 标题栏范围 */
  private applyConfigPatch(patch: Partial<PluginConfig>) {
    const chartHost = this.dialog?.element.querySelector(".jchm-panel__chart") as HTMLElement | null;
    const prevScopeKey = this.earliestYearScopeKey();
    const rangeChanged = Object.prototype.hasOwnProperty.call(patch, "displayMode") || Object.prototype.hasOwnProperty.call(patch, "fromYear");
    const viewChanged = Object.prototype.hasOwnProperty.call(patch, "viewMode");

    this.config = { ...this.config, ...patch };
    this.saveConfig();

    if (this.earliestYearScopeKey() !== prevScopeKey) {
      this.earliestYearCache = null;
      void this.refreshRangeNavigatorYears();
    } else if (rangeChanged) {
      this.rangeNavYearOptions = buildYearOptions(this.earliestYearCache?.year ?? null, this.config.fromYear);
      this.syncRangeNavigator();
    }

    // 仅改颜色时直接改 CSS 变量（含日详情缓存的热力图），避免重新跑 SQL
    const keys = Object.keys(patch);
    if (keys.length === 1 && keys[0] === "color") {
      const roots = [chartHost?.querySelector(".jchm"), this.cachedHeatmapPanel?.querySelector(".jchm")];
      let applied = false;
      for (const root of roots) {
        if (root instanceof HTMLElement) {
          applyHeatColor(root, this.config.color);
          applied = true;
        }
      }
      if (applied) {
        return;
      }
    }

    // 仅切换位置持久化：同步当前弹窗的 data-key，不刷新图表
    if (keys.length === 1 && keys[0] === "persistPosition") {
      this.syncDialogPositionKey();
      return;
    }

    // 视图 / 显示范围变化后按内容重新撑开（避免曾被拖拽钉死的宽高卡住）
    if (rangeChanged || viewChanged) {
      this.pendingDialogFit = true;
    }

    // 配置变了，DOM 缓存作废；日详情中改范围则回到热力图
    this.cachedHeatmapPanel = null;
    if (rangeChanged && this.view === "day") {
      const body = this.getDialogBody();
      if (body) {
        void this.renderPanel(body);
      }
      return;
    }
    if (chartHost && this.view === "heatmap") {
      this.refreshChart(chartHost);
    }
  }

  /**
   * 把主弹窗容器恢复为内容驱动尺寸。
   * 思源 Dialog 在标题栏 mousedown / 拖拽改尺寸后会写入像素 width/height，
   * 不清掉的话切换视图或范围时无法再随内容变化。
   */
  private fitDialogToContent() {
    const container = this.dialog?.element.querySelector(".jchm-dialog__container") as HTMLElement | null;
    if (!container) {
      return;
    }
    container.style.width = "max-content";
    container.style.height = "auto";
    container.style.maxWidth = "";
    container.style.maxHeight = "";
  }

  private mountHeatmapPanel(container: HTMLElement, days: DayCount[], totalDocs: number) {
    this.view = "heatmap";
    const i18n = getI18n();
    const panel = document.createElement("div");
    panel.className = "jchm-panel";
    const chartHost = document.createElement("div");
    chartHost.className = "jchm-panel__chart";
    chartHost.appendChild(
      renderHeatMap(
        days,
        i18n,
        this.config,
        (dateKey) => {
          this.openDayDetail(dateKey);
        },
        totalDocs,
      ),
    );
    panel.appendChild(chartHost);
    container.replaceChildren(panel);
  }

  private mountSettingsButton(dialogEl: HTMLElement) {
    const header = dialogEl.querySelector(".b3-dialog__header") as HTMLElement | null;
    if (!header || header.querySelector(".jchm-dialog__setting")) {
      return;
    }

    const i18n = getI18n();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "jchm-dialog__setting block__icon block__icon--show ariaLabel";
    btn.setAttribute("data-position", "north");
    btn.setAttribute("aria-label", i18n.settings);
    btn.innerHTML = '<svg><use xlink:href="#iconSettings"></use></svg>';
    btn.addEventListener("mousedown", (event) => {
      // 避免点设置时触发标题栏 drag，把弹窗钉成固定 top/left
      event.preventDefault();
      event.stopPropagation();
    });
    btn.addEventListener("click", (event) => {
      // 设置按钮需 stopPropagation，否则同一次 click 会冒泡到思源全局逻辑并立刻关掉刚打开的菜单
      event.preventDefault();
      event.stopPropagation();
      this.openSettingsMenu(btn.getBoundingClientRect());
    });

    const close = header.querySelector(".b3-dialog__close");
    if (close) {
      header.insertBefore(btn, close);
    } else {
      header.appendChild(btn);
    }
  }

  /** 按配置给当前主弹窗挂上/摘掉思源 Dialog 位置持久化用的 data-key */
  private syncDialogPositionKey() {
    if (!this.dialog) {
      return;
    }
    if (this.config.persistPosition) {
      this.dialog.element.setAttribute("data-key", DIALOG_POSITION_ID);
    } else {
      this.dialog.element.removeAttribute("data-key");
    }
  }

  private openSettingsMenu(rect: DOMRect) {
    const chartHost = this.dialog?.element.querySelector(".jchm-panel__chart") as HTMLElement | null;
    const i18n = getI18n();

    openConfigMenu({
      i18n,
      getConfig: () => this.config,
      rect,
      isMobile: this.isMobile,
      onChange: (patch) => {
        this.applyConfigPatch(patch);
      },
      onOpenScope: () => {
        openScopeDialog({
          i18n,
          includedBoxIds: this.config.includedBoxIds,
          isMobile: this.isMobile,
          onConfirm: (includedBoxIds) => {
            const prev = this.config.includedBoxIds;
            const same = (prev == null && includedBoxIds == null) || (Array.isArray(prev) && Array.isArray(includedBoxIds) && prev.length === includedBoxIds.length && prev.every((id, i) => id === includedBoxIds[i]));
            if (!same) {
              this.applyConfigPatch({ includedBoxIds });
            }
          },
        });
      },
      onOpenColor: () => {
        const previewColor = (next: string | null) => {
          const roots = [chartHost?.querySelector(".jchm"), this.cachedHeatmapPanel?.querySelector(".jchm")];
          for (const root of roots) {
            if (root instanceof HTMLElement) {
              applyHeatColor(root, next);
            }
          }
        };
        openColorDialog({
          i18n,
          color: this.config.color,
          onPreview: previewColor,
          onSave: (color) => {
            if (this.config.color !== color) {
              this.applyConfigPatch({ color });
            } else {
              previewColor(color);
            }
          },
        });
      },
      onOpenLevels: () => {
        openLevelsDialog({
          i18n,
          isMobile: this.isMobile,
          levelMode: this.config.levelMode,
          percentileThresholds: this.config.percentileThresholds,
          countThresholds: this.config.countThresholds,
          onConfirm: (result) => {
            const same = this.config.levelMode === result.levelMode && sameCuts(this.config.percentileThresholds, result.percentileThresholds) && sameCuts(this.config.countThresholds, result.countThresholds);
            if (!same) {
              this.applyConfigPatch(result);
            }
          },
        });
      },
    });
  }

  private getDialogBody(): HTMLElement | null {
    return this.dialog?.element.querySelector(".jchm-dialog") as HTMLElement | null;
  }

  private createLoadingEl(): HTMLElement {
    const el = document.createElement("div");
    el.className = "jchm-loading";
    el.setAttribute("aria-label", getI18n().loading);
    el.innerHTML = '<img width="48" height="48" src="/stage/loading-pure.svg" alt="">';
    return el;
  }

  private async renderPanel(container: HTMLElement) {
    this.view = "heatmap";
    this.cachedHeatmapPanel = null;
    const panel = document.createElement("div");
    panel.className = "jchm-panel";

    const chartHost = document.createElement("div");
    chartHost.className = "jchm-panel__chart";
    panel.appendChild(chartHost);

    container.replaceChildren(panel);
    await this.refreshChart(chartHost);
  }

  private restoreHeatmapPanel(container: HTMLElement) {
    this.dayAbort?.abort();
    this.dayAbort = undefined;
    this.loadingDay = false;

    if (this.cachedHeatmapPanel) {
      this.view = "heatmap";
      container.replaceChildren(this.cachedHeatmapPanel);
      this.cachedHeatmapPanel = null;
      return;
    }
    this.renderPanel(container);
  }

  private clearQueryCaches() {
    this.cachedDays = null;
    this.cachedTotalDocs = 0;
    this.cachedDaysKey = null;
    this.earliestYearCache = null;
    this.dayDocsCache.clear();
  }

  private dayDocsCacheKey(dateKey: string): string {
    const box = this.config.includedBoxIds == null ? "*" : this.config.includedBoxIds.join("\0");
    return `${dateKey}|${this.config.statMode}|${box}`;
  }

  private earliestYearScopeKey(): string {
    const box = this.config.includedBoxIds == null ? "*" : this.config.includedBoxIds.join("\0");
    return `${this.config.statMode}|${box}`;
  }

  private async resolveEarliestYear(): Promise<number | null> {
    const key = this.earliestYearScopeKey();
    if (this.earliestYearCache?.key === key) {
      return this.earliestYearCache.year;
    }
    try {
      const year = await queryEarliestYear(this.config.statMode, {
        includedBoxIds: this.config.includedBoxIds,
      });
      this.earliestYearCache = { key, year };
      return year;
    } catch (e) {
      console.error(this.displayName, "query earliest year failed", e);
      return null;
    }
  }

  private mountChart(chartHost: HTMLElement, days: DayCount[], totalDocs: number) {
    const i18n = getI18n();
    chartHost.replaceChildren(
      renderHeatMap(
        days,
        i18n,
        this.config,
        (dateKey) => {
          this.openDayDetail(dateKey);
        },
        totalDocs,
      ),
    );
    if (this.pendingDialogFit) {
      this.pendingDialogFit = false;
      this.fitDialogToContent();
    }
  }

  private async refreshChart(chartHost: HTMLElement) {
    if (this.refreshing) {
      this.refreshQueued = true;
      this.chartAbort?.abort();
      return;
    }
    this.refreshing = true;
    this.refreshQueued = false;

    try {
      do {
        this.refreshQueued = false;
        const queryKey = getActivityCacheKey(this.config.statMode, this.config);
        const i18n = getI18n();

        // 查询边界未变（如只改年份排序）时复用数据，跳过全表扫描
        if (this.cachedDays && this.cachedDaysKey === queryKey) {
          if (!this.dialog || this.view !== "heatmap") {
            continue;
          }
          this.mountChart(chartHost, this.cachedDays, this.cachedTotalDocs);
          continue;
        }

        this.chartAbort?.abort();
        this.chartAbort = new AbortController();
        const { signal } = this.chartAbort;
        const hasChart = Boolean(chartHost.querySelector(".jchm"));

        try {
          const { days, totalDocs } = await this.awaitWithLoadingDelay(
            queryActivity(this.config.statMode, this.config, signal),
            () => {
              // 已有图表时保留旧内容；仅空壳时才上 Loading
              if (!hasChart && !signal.aborted) {
                chartHost.replaceChildren(this.createLoadingEl());
              }
            },
            signal,
          );
          if (signal.aborted || !this.dialog || this.view !== "heatmap") {
            continue;
          }
          this.cachedDays = days;
          this.cachedTotalDocs = totalDocs;
          this.cachedDaysKey = queryKey;
          this.mountChart(chartHost, days, totalDocs);
        } catch (e) {
          if (this.isAbortError(e) || signal.aborted) {
            continue;
          }
          console.error(this.displayName, e);
          if (!this.dialog || this.view !== "heatmap") {
            continue;
          }
          chartHost.textContent = i18n.loadFailed;
          showMessage(`${this.displayName}: ${i18n.loadFailed}`);
        } finally {
          if (this.chartAbort?.signal === signal) {
            this.chartAbort = undefined;
          }
        }
      } while (this.refreshQueued && this.dialog && this.view === "heatmap");
    } finally {
      this.refreshing = false;
      // 循环退出后若又有排队（极端时序），再启一轮
      if (this.refreshQueued && this.dialog && this.view === "heatmap") {
        void this.refreshChart(chartHost);
      }
    }
  }

  private bindDayBack(onBack: () => void): () => void {
    return () => {
      this.dayAbort?.abort();
      this.dayAbort = undefined;
      this.loadingDay = false;
      onBack();
    };
  }

  private mountDayDocPanel(container: HTMLElement, dateKey: string, result: DayDocsResult) {
    const i18n = getI18n();
    this.view = "day";
    const panel = document.createElement("div");
    panel.className = "jchm-panel jchm-panel--day";
    panel.appendChild(
      renderDayDocList({
        dateKey,
        docs: result.docs,
        truncated: result.truncated,
        totalDocs: result.totalDocs,
        totalBlocks: result.totalBlocks,
        i18n,
        onBack: this.bindDayBack(() => {
          const body = this.getDialogBody();
          if (body) {
            this.restoreHeatmapPanel(body);
          }
        }),
        onOpenDoc: (id) => {
          // 移动端 openTab 为空实现，需走 openMobileFileById
          if (this.isMobile) {
            openMobileFileById(this.app, id);
            this.dialog?.destroy();
            return;
          }
          openTab({
            app: this.app,
            doc: { id },
          });
        },
      }),
    );
    container.replaceChildren(panel);
  }

  private async openDayDetail(dateKey: string) {
    const container = this.getDialogBody();
    if (!container || this.loadingDay || !this.dialog) {
      return;
    }

    const heatmapPanel = container.querySelector(".jchm-panel") as HTMLElement | null;
    const cacheKey = this.dayDocsCacheKey(dateKey);
    const cached = this.dayDocsCache.get(cacheKey);
    if (cached) {
      if (heatmapPanel) {
        this.cachedHeatmapPanel = heatmapPanel;
      }
      this.mountDayDocPanel(container, dateKey, cached);
      return;
    }

    this.loadingDay = true;
    this.dayAbort?.abort();
    this.dayAbort = new AbortController();
    const { signal } = this.dayAbort;
    const i18n = getI18n();
    let switchedToLoading = false;

    const showDayLoading = () => {
      if (switchedToLoading || signal.aborted || !this.dialog) {
        return;
      }
      if (heatmapPanel) {
        this.cachedHeatmapPanel = heatmapPanel;
      }
      switchedToLoading = true;
      this.view = "day";
      const panel = document.createElement("div");
      panel.className = "jchm-panel jchm-panel--day";
      panel.appendChild(
        renderDayLoading({
          dateKey,
          i18n,
          loadingEl: this.createLoadingEl(),
          onBack: this.bindDayBack(() => {
            const body = this.getDialogBody();
            if (body) {
              this.restoreHeatmapPanel(body);
            }
          }),
        }),
      );
      container.replaceChildren(panel);
    };

    try {
      const result = await this.awaitWithLoadingDelay(queryDayDocs(dateKey, this.config.statMode, { includedBoxIds: this.config.includedBoxIds }, signal), showDayLoading, signal);
      if (signal.aborted || !this.dialog) {
        return;
      }

      this.dayDocsCache.set(cacheKey, result);
      if (heatmapPanel && !switchedToLoading) {
        this.cachedHeatmapPanel = heatmapPanel;
      }
      this.mountDayDocPanel(container, dateKey, result);
    } catch (e) {
      if (this.isAbortError(e) || signal.aborted) {
        return;
      }
      console.error(this.displayName, e);
      showMessage(`${this.displayName}: ${i18n.loadDayFailed}`);
      if (switchedToLoading) {
        const body = this.getDialogBody();
        if (body) {
          this.restoreHeatmapPanel(body);
        }
      }
    } finally {
      if (this.dayAbort?.signal === signal) {
        this.dayAbort = undefined;
      }
      this.loadingDay = false;
    }
  }
}

function sameCuts(a: LevelCuts, b: LevelCuts): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
