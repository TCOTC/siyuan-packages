import { formatDisplayDate } from "./date";
import { setDocIconContent } from "./icons";
import type { I18n } from "./i18n";
import type { DayDoc } from "./types";

export interface RenderDayDocListOptions {
  dateKey: string;
  docs: DayDoc[];
  /** 实际文档数超过展示上限时，在列表末尾提示 */
  truncated?: boolean;
  /** 当日实际文档总数；缺省则回退为列表长度 */
  totalDocs?: number;
  /** 当日实际块总数；缺省则回退为列表块数之和 */
  totalBlocks?: number;
  i18n: I18n;
  onBack: () => void;
  onOpenDoc: (id: string) => void;
}

export interface RenderDayLoadingOptions {
  dateKey: string;
  i18n: I18n;
  loadingEl: HTMLElement;
  onBack: () => void;
}

/** 日详情 Loading 占位（保留返回与日期标题，避免高度塌缩） */
export function renderDayLoading(options: RenderDayLoadingOptions): HTMLElement {
  const { dateKey, i18n, loadingEl, onBack } = options;
  const root = document.createElement("div");
  root.className = "jchm-day";

  const header = document.createElement("div");
  header.className = "jchm-day__header";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "jchm-day__back block__icon block__icon--show ariaLabel";
  backBtn.setAttribute("data-position", "north");
  backBtn.setAttribute("aria-label", i18n.back);
  backBtn.innerHTML = '<svg><use xlink:href="#iconLeft"></use></svg>';
  backBtn.addEventListener("click", (event) => {
    event.preventDefault();
    onBack();
  });
  header.appendChild(backBtn);

  const title = document.createElement("div");
  title.className = "jchm-day__title";
  title.textContent = formatDisplayDate(dateKey);
  header.appendChild(title);
  root.appendChild(header);

  const body = document.createElement("div");
  body.className = "jchm-day__body jchm-day__body--loading";
  body.appendChild(loadingEl);
  root.appendChild(body);
  return root;
}

/** 渲染某日文档扁平列表（块数降序） */
export function renderDayDocList(options: RenderDayDocListOptions): HTMLElement {
  const { dateKey, docs, truncated = false, totalDocs = docs.length, totalBlocks = docs.reduce((sum, doc) => sum + doc.count, 0), i18n, onBack, onOpenDoc } = options;
  const root = document.createElement("div");
  root.className = "jchm-day";

  const header = document.createElement("div");
  header.className = "jchm-day__header";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "jchm-day__back block__icon block__icon--show ariaLabel";
  backBtn.setAttribute("data-position", "north");
  backBtn.setAttribute("aria-label", i18n.back);
  backBtn.innerHTML = '<svg><use xlink:href="#iconLeft"></use></svg>';
  backBtn.addEventListener("click", (event) => {
    event.preventDefault();
    onBack();
  });
  header.appendChild(backBtn);

  const title = document.createElement("div");
  title.className = "jchm-day__title";
  title.textContent = formatDisplayDate(dateKey);
  header.appendChild(title);

  const summary = document.createElement("div");
  summary.className = "jchm-day__summary";
  summary.textContent = i18n.daySummary.replace("${docs}", String(totalDocs)).replace("${blocks}", String(totalBlocks));
  header.appendChild(summary);
  root.appendChild(header);

  const body = document.createElement("div");
  body.className = "jchm-day__body";

  if (docs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "jchm-day__empty";
    empty.textContent = i18n.dayEmpty;
    body.appendChild(empty);
  } else {
    const list = document.createElement("ul");
    list.className = "b3-list b3-list--background jchm-day__list";
    for (const doc of docs) {
      list.appendChild(renderDayDocItem(doc, i18n, onOpenDoc));
    }
    body.appendChild(list);
    if (truncated) {
      const tip = document.createElement("div");
      tip.className = "jchm-day__truncated";
      tip.textContent = i18n.dayDocsTruncated.replace("${count}", String(docs.length));
      body.appendChild(tip);
    }
  }
  root.appendChild(body);
  return root;
}

function renderDayDocItem(doc: DayDoc, i18n: I18n, onOpenDoc: (id: string) => void): HTMLElement {
  const li = document.createElement("li");
  li.className = "b3-list-item b3-list-item--narrow jchm-day__item";
  li.setAttribute("data-node-id", doc.id);

  const icon = document.createElement("span");
  icon.className = "b3-list-item__icon popover__block";
  icon.setAttribute("data-position", "8east");
  icon.setAttribute("data-id", doc.id);
  setDocIconContent(icon, doc.icon, doc.id);
  li.appendChild(icon);

  const text = document.createElement("span");
  text.className = "b3-list-item__text";
  text.textContent = doc.title;
  text.addEventListener("click", (event) => {
    event.preventDefault();
    onOpenDoc(doc.id);
  });
  li.appendChild(text);

  const counter = document.createElement("span");
  counter.className = "counter ariaLabel";
  counter.setAttribute("data-position", "8west");
  counter.setAttribute("aria-label", i18n.docBlockCount.replace("${count}", String(doc.count)));
  counter.textContent = String(doc.count);
  li.appendChild(counter);

  return li;
}
