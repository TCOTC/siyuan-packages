import { formatDisplayDate, isSparseWeekday, orderWeekdays } from "./date";
import { applyHeatColor } from "./config";
import { buildMonthLabels, buildPeriods, measureMonthLabelReserve, measureWeekdayColumnWidth, type PeriodGrid } from "./grid";
import type { I18n } from "./i18n";
import { calcLevels } from "./levels";
import { renderCalendarView } from "./render-calendar";
import { renderFooter } from "./render-shared";
import type { DayCount, HeatMapConfigOptions, WeekStart } from "./types";

/** 渲染热力图图表区域（GitHub 周列 / 传统月历） */
export function renderHeatMap(days: DayCount[], i18n: I18n, config: Pick<HeatMapConfigOptions, "weekStart" | "displayMode" | "fromYear" | "yearOrder" | "viewMode" | "color" | "levelMode" | "percentileThresholds" | "countThresholds">, onDayClick?: (dateKey: string, count: number) => void, totalDocs = 0): HTMLElement {
  if (config.viewMode === "calendar") {
    return renderCalendarView(days, i18n, config, onDayClick, totalDocs);
  }
  return renderGithubView(days, i18n, config, onDayClick, totalDocs);
}

/** 渲染 GitHub 风格热力图 */
function renderGithubView(days: DayCount[], i18n: I18n, config: Pick<HeatMapConfigOptions, "weekStart" | "displayMode" | "fromYear" | "yearOrder" | "color" | "levelMode" | "percentileThresholds" | "countThresholds">, onDayClick?: (dateKey: string, count: number) => void, totalDocs = 0): HTMLElement {
  const { weekStart, displayMode, fromYear, yearOrder, color, levelMode, percentileThresholds, countThresholds } = config;
  const countMap = new Map(days.map((d) => [d.date, { count: d.count, docs: d.docs }]));
  const periods = buildPeriods(countMap, displayMode, fromYear, weekStart, yearOrder);

  const allCounts: number[] = [];
  let totalBlocks = 0;
  for (const period of periods) {
    for (const cell of period.cells) {
      allCounts.push(cell.count);
      if (cell.count > 0) {
        totalBlocks += cell.count;
      }
    }
  }
  const { levelOf, thresholds } = calcLevels(allCounts, {
    mode: levelMode,
    percentileThresholds,
    countThresholds,
  });
  const weekdayLabels = orderWeekdays(i18n.weekdays, weekStart);

  const root = document.createElement("div");
  root.className = "jchm jchm--heatmap";
  applyHeatColor(root, color);

  const visibleWeekdayLabels = weekdayLabels.filter((_, index) => isSparseWeekday(index, weekStart));
  root.style.setProperty("--jchm-weekday-col", `${measureWeekdayColumnWidth(visibleWeekdayLabels)}px`);
  // 月份标签盒只有一格宽，末月文案会向右溢出；预留这段宽度，避免被裁或撑出横向条
  root.style.setProperty("--jchm-month-reserve", `${measureMonthLabelReserve(i18n.months)}px`);

  // 外层竖滚、内层横滚拆开，避免双轴 overflow:auto 互相挤出无效滚动条
  const scrollY = document.createElement("div");
  scrollY.className = "jchm__scroll";

  const scrollX = document.createElement("div");
  scrollX.className = "jchm__scroll-x";

  const track = document.createElement("div");
  track.className = "jchm__track";

  let maxWeeks = 0;
  for (const period of periods) {
    maxWeeks = Math.max(maxWeeks, period.weeks.length);
    track.appendChild(renderPeriod(period, i18n, weekdayLabels, weekStart, levelOf, onDayClick));
  }
  // 供 CSS clamp 计算格子边长（最宽年份的周数）
  root.style.setProperty("--jchm-weeks", String(Math.max(maxWeeks, 1)));

  scrollX.appendChild(track);
  scrollY.appendChild(scrollX);
  root.appendChild(scrollY);
  root.appendChild(renderFooter(i18n, totalBlocks, totalDocs, thresholds));

  // 若已缩到下限仍溢出，滚到最右侧展示最近日期
  requestAnimationFrame(() => {
    scrollX.scrollLeft = scrollX.scrollWidth;
  });

  return root;
}

function renderPeriod(period: PeriodGrid, i18n: I18n, weekdayLabels: string[], weekStart: WeekStart, levels: (count: number) => number, onDayClick?: (dateKey: string, count: number) => void): HTMLElement {
  const section = document.createElement("div");
  section.className = "jchm__period";

  const monthsRow = document.createElement("div");
  monthsRow.className = "jchm__months";
  const spacer = document.createElement("div");
  spacer.className = "jchm__months-spacer";
  monthsRow.appendChild(spacer);
  for (const label of buildMonthLabels(period.weeks, i18n.months)) {
    const el = document.createElement("div");
    el.className = "jchm__month";
    el.textContent = label;
    monthsRow.appendChild(el);
  }
  section.appendChild(monthsRow);

  const body = document.createElement("div");
  body.className = "jchm__body";

  const weekdays = document.createElement("div");
  weekdays.className = "jchm__weekdays";
  weekdayLabels.forEach((label, index) => {
    const el = document.createElement("div");
    el.className = "jchm__weekday";
    // 只显示一、三、五，避免拥挤
    if (isSparseWeekday(index, weekStart)) {
      el.textContent = label;
    }
    weekdays.appendChild(el);
  });
  body.appendChild(weekdays);

  const grid = document.createElement("div");
  grid.className = "jchm__grid";
  if (onDayClick) {
    grid.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const day = target.closest(".jchm__cell--clickable") as HTMLElement | null;
      if (!day || !grid.contains(day)) {
        return;
      }
      const dateKey = day.getAttribute("data-date");
      const count = Number(day.getAttribute("data-count"));
      if (!dateKey || !(count > 0)) {
        return;
      }
      // 不 stopPropagation，让思源 window click 能关掉设置菜单
      onDayClick(dateKey, count);
    });
  }
  for (const week of period.weeks) {
    const col = document.createElement("div");
    col.className = "jchm__week";
    for (const cell of week) {
      const day = document.createElement("div");
      if (cell.count < 0) {
        day.className = "jchm__cell jchm__cell--empty";
      } else {
        const level = cell.count <= 0 ? 0 : levels(cell.count);
        day.className = `jchm__cell jchm__cell--l${level} ariaLabel`;
        day.setAttribute("data-position", "north");
        day.setAttribute("data-date", cell.date);
        day.setAttribute("data-count", String(cell.count));
        day.setAttribute("aria-label", i18n.cellTooltip.replace("${date}", formatDisplayDate(cell.date)).replace("${docs}", String(cell.docs)).replace("${count}", String(cell.count)));
        if (cell.count > 0 && onDayClick) {
          day.classList.add("jchm__cell--clickable");
        }
      }
      col.appendChild(day);
    }
    grid.appendChild(col);
  }
  body.appendChild(grid);
  section.appendChild(body);
  return section;
}
