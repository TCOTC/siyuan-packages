/** 规范化为小写 #rrggbb；非法返回 null */
function normalizeHex(value: string): string | null {
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

/** OKLCH：L ∈ [0,1]，C ≥ 0，h ∈ [0,360) */
export type Oklch = { l: number; c: number; h: number };

/** 热力色与字色 OKLCH L 的最小间距 */
export const HEAT_L_DELTA = 0.28;

/** 彩度上限，避免过艳且利于落入 sRGB */
export const HEAT_C_MAX = 0.2;

/** 与表面色 L 的最小间距，避免格子「融进」背景 */
export const HEAT_SURFACE_L_DELTA = 0.1;

type Rgb01 = { r: number; g: number; b: number };

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function rgb01ToOklab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToRgb01(L: number, a: number, b: number): Rgb01 {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function normalizeHue(h: number): number {
  if (!Number.isFinite(h)) {
    return 0;
  }
  const wrapped = h % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function oklabToOklch(L: number, a: number, b: number): Oklch {
  const c = Math.hypot(a, b);
  const h = c < 1e-8 ? 0 : normalizeHue((Math.atan2(b, a) * 180) / Math.PI);
  return { l: L, c, h };
}

function oklchToOklab(oklch: Oklch): { L: number; a: number; b: number } {
  const hRad = (normalizeHue(oklch.h) * Math.PI) / 180;
  return {
    L: oklch.l,
    a: oklch.c * Math.cos(hRad),
    b: oklch.c * Math.sin(hRad),
  };
}

function channelToHex(n: number): string {
  const clamped = Math.min(255, Math.max(0, Math.round(n)));
  return clamped.toString(16).padStart(2, "0");
}

function rgb01InGamut({ r, g, b }: Rgb01): boolean {
  const eps = 1e-4;
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps;
}

/** 将 OKLCH 压入 sRGB：优先降低 C，再夹通道 */
export function oklchToHex(oklch: Oklch): string {
  let c = Math.max(0, oklch.c);
  const l = Math.min(1, Math.max(0, oklch.l));
  const h = normalizeHue(oklch.h);

  let lab = oklchToOklab({ l, c, h });
  let rgb = oklabToRgb01(lab.L, lab.a, lab.b);

  if (!rgb01InGamut(rgb)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      lab = oklchToOklab({ l, c: mid, h });
      const trial = oklabToRgb01(lab.L, lab.a, lab.b);
      if (rgb01InGamut(trial)) {
        lo = mid;
        rgb = trial;
      } else {
        hi = mid;
      }
    }
    c = lo;
    lab = oklchToOklab({ l, c, h });
    rgb = oklabToRgb01(lab.L, lab.a, lab.b);
  }

  const r = linearToSrgb(Math.min(1, Math.max(0, rgb.r)));
  const g = linearToSrgb(Math.min(1, Math.max(0, rgb.g)));
  const b = linearToSrgb(Math.min(1, Math.max(0, rgb.b)));
  return `#${channelToHex(r * 255)}${channelToHex(g * 255)}${channelToHex(b * 255)}`;
}

/** #rrggbb → OKLCH；非法返回 null */
export function hexToOklch(hex: string): Oklch | null {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return null;
  }
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;
  const lab = rgb01ToOklab(r, g, b);
  return oklabToOklch(lab.L, lab.a, lab.b);
}

/**
 * 钳制热力色 L：远离字色，并尽量离开表面色。
 * C 限制在 HEAT_C_MAX；h 规范化。
 */
export function clampHeatOklch(oklch: Oklch, textL: number, surfaceL: number, delta = HEAT_L_DELTA, surfaceDelta = HEAT_SURFACE_L_DELTA): Oklch {
  const text = Math.min(1, Math.max(0, textL));
  const surface = Math.min(1, Math.max(0, surfaceL));
  let l = Math.min(1, Math.max(0, oklch.l));

  if (Math.abs(l - text) < delta) {
    const up = text + delta;
    const down = text - delta;
    const candidates: number[] = [];
    if (up <= 1) {
      candidates.push(up);
    }
    if (down >= 0) {
      candidates.push(down);
    }
    if (candidates.length === 0) {
      l = text > 0.5 ? Math.max(0, text - delta) : Math.min(1, text + delta);
    } else {
      // 优先选离字色更远、且更靠近原 L 的一侧
      candidates.sort((a, b) => {
        const da = Math.abs(a - l);
        const db = Math.abs(b - l);
        if (da !== db) {
          return da - db;
        }
        return Math.abs(b - text) - Math.abs(a - text);
      });
      l = candidates[0];
    }
  }

  if (Math.abs(l - surface) < surfaceDelta) {
    const awayFromText = l >= text ? 1 : -1;
    const nudged = l + awayFromText * surfaceDelta;
    if (nudged >= 0 && nudged <= 1 && Math.abs(nudged - text) >= delta * 0.9) {
      l = nudged;
    } else {
      const opposite = l - awayFromText * surfaceDelta;
      if (opposite >= 0 && opposite <= 1 && Math.abs(opposite - text) >= delta * 0.9) {
        l = opposite;
      }
    }
  }

  return {
    l,
    c: Math.min(HEAT_C_MAX, Math.max(0, oklch.c)),
    h: normalizeHue(oklch.h),
  };
}

/**
 * 以色相生成安全热力 hex：L/C 取自钳制后的主题色，h 为滑条值。
 */
export function heatHexFromHue(hue: number, themeOklch: Oklch, textL: number, surfaceL: number): string {
  const safe = clampHeatOklch(themeOklch, textL, surfaceL);
  return oklchToHex({
    l: safe.l,
    c: safe.c,
    h: normalizeHue(hue),
  });
}

/** 将已存 hex 投影为安全热力色（保留色相倾向） */
export function projectHeatHex(hex: string, textL: number, surfaceL: number): string | null {
  const oklch = hexToOklch(hex);
  if (!oklch) {
    return null;
  }
  return oklchToHex(clampHeatOklch(oklch, textL, surfaceL));
}
