import type { I18n } from "./i18n";
import { formatLegendTooltip, type LevelThresholds } from "./levels";

export function renderFooter(i18n: I18n, totalBlocks: number, totalDocs: number, thresholds: LevelThresholds): HTMLElement {
  const footer = document.createElement("div");
  footer.className = "jchm__footer";

  const summary = document.createElement("div");
  summary.className = "jchm__summary";
  summary.textContent = i18n.totalCount.replace("${docs}", String(totalDocs)).replace("${count}", String(totalBlocks));
  footer.appendChild(summary);

  const legend = document.createElement("div");
  legend.className = "jchm__legend";
  const less = document.createElement("span");
  less.textContent = i18n.less;
  legend.appendChild(less);
  for (let i = 0; i <= 4; i++) {
    const swatch = document.createElement("div");
    swatch.className = `jchm__cell jchm__cell--l${i} ariaLabel`;
    swatch.setAttribute("data-position", "north");
    swatch.setAttribute("aria-label", formatLegendTooltip(i, thresholds, i18n));
    legend.appendChild(swatch);
  }
  const more = document.createElement("span");
  more.textContent = i18n.more;
  legend.appendChild(more);
  footer.appendChild(legend);
  return footer;
}
