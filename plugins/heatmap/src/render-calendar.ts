import { formatDisplayDate, orderWeekdays } from "./date";
import { applyHeatColor } from "./config";
import { buildMonthGrid, buildMonthSpecs, groupMonthsByYear, type MonthGrid } from "./grid";
import type { I18n } from "./i18n";
import { calcLevels } from "./levels";
import { renderFooter } from "./render-shared";
import type { DayCount, HeatMapConfigOptions } from "./types";

/** 渲染传统日历：每个月一个方块 */
export function renderCalendarView(days: DayCount[], i18n: I18n, config: Pick<HeatMapConfigOptions, "weekStart" | "displayMode" | "fromYear" | "yearOrder" | "color" | "levelMode" | "percentileThresholds" | "countThresholds">, onDayClick?: (dateKey: string, count: number) => void, totalDocs = 0): HTMLElement {
  const { weekStart, displayMode, fromYear, yearOrder, color, levelMode, percentileThresholds, countThresholds } = config;
  const countMap = new Map(days.map((d) => [d.date, { count: d.count, docs: d.docs }]));
  const monthSpecs = buildMonthSpecs(displayMode, fromYear, yearOrder);
  const months = monthSpecs.map((spec) => buildMonthGrid(countMap, spec.year, spec.month, weekStart));

  const allCounts: number[] = [];
  let totalBlocks = 0;
  for (const month of months) {
    for (const cell of month.cells) {
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
  root.className = "jchm jchm--calendar";
  applyHeatColor(root, color);

  const scrollY = document.createElement("div");
  scrollY.className = "jchm__scroll";

  const track = document.createElement("div");
  track.className = "jchm__cal-track";

  // 按年分组，便于多年份模式下识别
  const groups = groupMonthsByYear(months, yearOrder);
  for (const group of groups) {
    const yearSection = document.createElement("div");
    yearSection.className = "jchm__cal-year";

    // 仅多年份或跨年时显示年份标题
    if (groups.length > 1 || displayMode === "years") {
      const yearLabel = document.createElement("div");
      yearLabel.className = "jchm__cal-year-label";
      yearLabel.textContent = String(group.year);
      yearSection.appendChild(yearLabel);
    }

    const monthsGrid = document.createElement("div");
    monthsGrid.className = "jchm__cal-months";
    for (const month of group.months) {
      monthsGrid.appendChild(renderMonthBlock(month, i18n, weekdayLabels, levelOf, onDayClick));
    }
    yearSection.appendChild(monthsGrid);
    track.appendChild(yearSection);
  }

  scrollY.appendChild(track);
  root.appendChild(scrollY);
  root.appendChild(renderFooter(i18n, totalBlocks, totalDocs, thresholds));
  return root;
}

function renderMonthBlock(month: MonthGrid, i18n: I18n, weekdayLabels: string[], levels: (count: number) => number, onDayClick?: (dateKey: string, count: number) => void): HTMLElement {
  const block = document.createElement("div");
  block.className = "jchm__cal-month";

  const title = document.createElement("div");
  title.className = "jchm__cal-month-title";
  title.textContent = i18n.months[month.month] || "";
  block.appendChild(title);

  const weekdays = document.createElement("div");
  weekdays.className = "jchm__cal-weekdays";
  for (const label of weekdayLabels) {
    const el = document.createElement("div");
    el.className = "jchm__cal-weekday";
    el.textContent = label;
    weekdays.appendChild(el);
  }
  block.appendChild(weekdays);

  const grid = document.createElement("div");
  grid.className = "jchm__cal-grid";
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
  for (const week of month.weeks) {
    const row = document.createElement("div");
    row.className = "jchm__cal-week";
    for (const cell of week) {
      const day = document.createElement("div");
      if (cell.count === -1) {
        day.className = "jchm__cal-day jchm__cal-day--empty";
      } else if (cell.count === -2) {
        day.className = "jchm__cal-day jchm__cal-day--future";
        day.textContent = String(cell.day);
      } else {
        const level = cell.count <= 0 ? 0 : levels(cell.count);
        day.className = `jchm__cal-day jchm__cell jchm__cell--l${level} ariaLabel`;
        day.textContent = String(cell.day);
        day.setAttribute("data-position", "north");
        day.setAttribute("data-date", cell.date);
        day.setAttribute("data-count", String(cell.count));
        day.setAttribute("aria-label", i18n.cellTooltip.replace("${date}", formatDisplayDate(cell.date)).replace("${docs}", String(cell.docs)).replace("${count}", String(cell.count)));
        if (cell.count > 0 && onDayClick) {
          day.classList.add("jchm__cell--clickable");
        }
      }
      row.appendChild(day);
    }
    grid.appendChild(row);
  }
  block.appendChild(grid);
  return block;
}
