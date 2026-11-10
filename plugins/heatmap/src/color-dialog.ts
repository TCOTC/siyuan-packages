import { Dialog } from "siyuan";
import { heatHexFromHue, hexToOklch, type Oklch } from "./color-oklch";
import type { I18n } from "./locale";

export interface OpenColorDialogOptions {
  i18n: I18n;
  /** 当前热力主色；null 表示跟随主题 */
  color: string | null;
  /** 拖动滑条 / 点「使用主题色」时实时预览（不落盘） */
  onPreview: (color: string | null) => void;
  /** 关闭弹窗时落盘当前颜色 */
  onSave: (color: string | null) => void;
}

let openDialog: Dialog | undefined;

/** 打开「颜色」配置 Dialog：色相滑条（OKLCH 算安全色，输出 hex）+ 使用主题色 */
export function openColorDialog(options: OpenColorDialogOptions): void {
  if (openDialog) {
    return;
  }

  const { i18n, color, onPreview, onSave } = options;
  let current: string | null = color;

  const dialog = new Dialog({
    title: i18n.color,
    content: '<div class="b3-dialog__content jchm-color"></div>',
    transparent: true,
    destroyCallback: () => {
      if (openDialog === dialog) {
        openDialog = undefined;
      }
      onSave(current);
    },
  });
  openDialog = dialog;

  const body = dialog.element.querySelector(".jchm-color") as HTMLElement | null;
  if (!body) {
    dialog.destroy();
    return;
  }

  const themeHex = resolveCssHex(dialog.element, "var(--b3-theme-primary)", "#3575f0");
  const textL = resolveCssOklch(dialog.element, "var(--b3-theme-on-surface)")?.l ?? 0.25;
  const surfaceL = resolveCssOklch(dialog.element, "var(--b3-theme-surface)")?.l ?? 0.95;
  const themeOklch = hexToOklch(themeHex) ?? { l: 0.55, c: 0.14, h: 250 };

  const row = document.createElement("div");
  row.className = "jchm-color__row";

  const swatch = document.createElement("div");
  swatch.className = "jchm-color__swatch";
  swatch.setAttribute("aria-hidden", "true");

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "jchm-color__slider b3-slider";
  slider.min = "0";
  slider.max = "360";
  slider.step = "1";
  slider.setAttribute("aria-label", i18n.color);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "b3-button b3-button--outline jchm-color__reset";
  resetBtn.textContent = i18n.colorUseTheme;

  row.append(swatch, slider, resetBtn);
  body.appendChild(row);

  const hint = document.createElement("div");
  hint.className = "jchm-color__hint";
  hint.textContent = i18n.colorHint;
  body.appendChild(hint);

  const setPreview = (next: string | null, hexForSwatch: string) => {
    current = next;
    swatch.style.backgroundColor = hexForSwatch;
    onPreview(next);
  };

  const applyHue = (hue: number, followTheme: boolean) => {
    slider.value = String(Math.round(hue));
    if (followTheme) {
      setPreview(null, themeHex);
      return;
    }
    const hex = heatHexFromHue(hue, themeOklch, textL, surfaceL);
    setPreview(hex, hex);
  };

  // 已存 hex：只取色相，按当前主题重算安全色；主题色：滑条跟主题色相，current 仍为 null
  if (color) {
    const hue = hexToOklch(color)?.h ?? themeOklch.h;
    applyHue(hue, false);
  } else {
    applyHue(themeOklch.h, true);
  }

  slider.addEventListener("input", () => {
    applyHue(Number(slider.value), false);
  });

  resetBtn.addEventListener("click", (event) => {
    event.preventDefault();
    applyHue(themeOklch.h, true);
  });
}

/** 解析 CSS 颜色为 #rrggbb */
function resolveCssHex(context: Element, cssColor: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.color = cssColor;
  context.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const match = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) {
    return fallback;
  }
  const toHex = (n: string) => Number(n).toString(16).padStart(2, "0");
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}

function resolveCssOklch(context: Element, cssColor: string): Oklch | null {
  return hexToOklch(resolveCssHex(context, cssColor, ""));
}
