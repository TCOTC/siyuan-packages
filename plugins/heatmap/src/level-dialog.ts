import { Dialog } from "siyuan";
import { escapeHtml } from "siyuan-html-safety";
import { isLevelMode, normalizeLevelCuts } from "./config";
import { DEFAULT_COUNT_THRESHOLDS, DEFAULT_PERCENTILE_THRESHOLDS } from "./levels";
import type { I18n } from "./locale";
import type { LevelCuts, LevelMode } from "./types";

export interface OpenLevelsDialogOptions {
  i18n: I18n;
  isMobile: boolean;
  levelMode: LevelMode;
  percentileThresholds: LevelCuts;
  countThresholds: LevelCuts;
  onConfirm: (result: { levelMode: LevelMode; percentileThresholds: LevelCuts; countThresholds: LevelCuts }) => void;
}

let openDialog: Dialog | undefined;

/** 打开「格子档位」配置 Dialog：模式 + 三档阈值；取消不保存，确定后回调 */
export function openLevelsDialog(options: OpenLevelsDialogOptions): void {
  if (openDialog) {
    return;
  }

  const { i18n, isMobile, onConfirm } = options;
  let mode: LevelMode = options.levelMode;
  let percentileThresholds = options.percentileThresholds;
  let countThresholds = options.countThresholds;
  let handled = false;

  const dialog = new Dialog({
    title: i18n.levels,
    content: `<div class="b3-dialog__content jchm-levels"></div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-action="cancel">${escapeHtml(i18n.cancel)}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" data-action="confirm">${escapeHtml(i18n.confirm)}</button>
</div>`,
    width: isMobile ? "92vw" : "420px",
    destroyCallback: () => {
      if (openDialog === dialog) {
        openDialog = undefined;
      }
    },
  });
  openDialog = dialog;

  const body = dialog.element.querySelector(".jchm-levels") as HTMLElement | null;
  const cancelBtn = dialog.element.querySelector('[data-action="cancel"]') as HTMLButtonElement | null;
  const confirmBtn = dialog.element.querySelector('[data-action="confirm"]') as HTMLButtonElement | null;
  if (!body || !cancelBtn || !confirmBtn) {
    dialog.destroy();
    return;
  }

  const modeRow = document.createElement("div");
  modeRow.className = "jchm-levels__mode";

  const modeLabel = document.createElement("div");
  modeLabel.className = "jchm-levels__label";
  modeLabel.textContent = i18n.levelsMode;

  const modeSelect = document.createElement("select");
  modeSelect.className = "b3-select jchm-levels__select";
  modeSelect.setAttribute("aria-label", i18n.levelsMode);
  for (const [value, label] of [
    ["percentile", i18n.levelsModePercentile],
    ["count", i18n.levelsModeCount],
  ] as const) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    modeSelect.appendChild(opt);
  }
  modeSelect.value = mode;

  modeRow.append(modeLabel, modeSelect);

  const hint = document.createElement("div");
  hint.className = "jchm-levels__hint";

  const cutsLabel = document.createElement("div");
  cutsLabel.className = "jchm-levels__label";
  cutsLabel.textContent = i18n.levelsThresholds;

  const cutsRow = document.createElement("div");
  cutsRow.className = "jchm-levels__cuts";

  const inputs: HTMLInputElement[] = [];
  for (let i = 0; i < 3; i++) {
    const wrap = document.createElement("label");
    wrap.className = "jchm-levels__cut";
    const caption = document.createElement("span");
    caption.className = "jchm-levels__cut-label";
    caption.textContent = i18n.levelsCutLabels[i];
    const input = document.createElement("input");
    input.type = "number";
    input.className = "b3-text-field jchm-levels__input";
    input.min = "1";
    input.step = "1";
    input.setAttribute("aria-label", i18n.levelsCutLabels[i]);
    wrap.append(caption, input);
    cutsRow.appendChild(wrap);
    inputs.push(input);
  }

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "b3-button b3-button--outline jchm-levels__reset";
  resetBtn.textContent = i18n.levelsReset;

  body.append(modeRow, hint, cutsLabel, cutsRow, resetBtn);

  const currentCuts = (): LevelCuts => (mode === "percentile" ? percentileThresholds : countThresholds);

  const syncInputs = () => {
    const cuts = currentCuts();
    const max = mode === "percentile" ? "100" : undefined;
    hint.textContent = mode === "percentile" ? i18n.levelsHintPercentile : i18n.levelsHintCount;
    for (let i = 0; i < 3; i++) {
      inputs[i].value = String(cuts[i]);
      inputs[i].max = max ?? "";
    }
  };

  const readInputs = (): LevelCuts => {
    return normalizeLevelCuts(
      mode,
      inputs.map((el) => el.value),
    );
  };

  const commitInputs = () => {
    const next = readInputs();
    if (mode === "percentile") {
      percentileThresholds = next;
    } else {
      countThresholds = next;
    }
    syncInputs();
  };

  modeSelect.addEventListener("change", () => {
    commitInputs();
    const next = modeSelect.value;
    if (isLevelMode(next)) {
      mode = next;
      syncInputs();
    }
  });

  for (const input of inputs) {
    input.addEventListener("change", () => {
      commitInputs();
    });
  }

  resetBtn.addEventListener("click", (event) => {
    event.preventDefault();
    if (mode === "percentile") {
      percentileThresholds = DEFAULT_PERCENTILE_THRESHOLDS;
    } else {
      countThresholds = DEFAULT_COUNT_THRESHOLDS;
    }
    syncInputs();
  });

  syncInputs();

  const finishCancel = () => {
    if (handled) {
      return;
    }
    handled = true;
    dialog.destroy();
  };

  cancelBtn.addEventListener("click", (event) => {
    event.preventDefault();
    finishCancel();
  });

  confirmBtn.addEventListener("click", (event) => {
    event.preventDefault();
    if (handled) {
      return;
    }
    handled = true;
    commitInputs();
    onConfirm({
      levelMode: mode,
      percentileThresholds,
      countThresholds,
    });
    dialog.destroy();
  });
}
