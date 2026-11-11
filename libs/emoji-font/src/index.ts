/**
 * Twemoji 的整套接管：字体声明 + 字体栈变量 + 图标槽位度量校准。
 *
 * 为什么集中在这里：思源把 emoji 字体拆成两组变量，两组都要改写才完整，而其中
 * `"Twemoji"` / `"Twemoji Icon"` 与 `--b3-font-family-emoji-reset` 必须相互匹配——
 * 变量指向的字族不存在、或图标槽位还在用思源自己的 face，都会**静默**退回内置 Noto，
 * 只看代码看不出来（这个坑已经踩过三次）。所以声明与规则由同一个函数一起产出。
 *
 * 依赖的注入方式：调用方把 {@link getEmojiFontStyle} 的返回值放进 id 以 `snippetCSS`
 * 开头的 `<style>`。这样它在主界面生效，同时被 PDF / HTML 导出收集
 * （siyuan 仓库 `app/src/protyle/export/index.ts` 的 `getSnippetCSS`）。
 */

/**
 * 字体文件名。字体本体在 `libs/emoji-font/fonts/`，由各包的 `build.config.ts` 用
 * `{ from: "@repo/libs/emoji-font/fonts/...", to: "Twemoji" }` 复制进产物，
 * 所以运行期路径仍是 `/plugins/<包名>/Twemoji/<文件名>`。换版本时改这里，
 * 连同 `scripts/shift-twemoji-glyphs.py` 与两处的 `size-adjust` / `ascent-override` 注释一起核对。
 */
export const TWEMOJI_FILE = "twemoji-colr0-17.0.3.woff2";

/**
 * 图标槽位。siyuan 仓库 `app/src/assets/scss/component/_list.scss`
 * 把 `"Emojis File Tree"` 硬写在字体栈首位，必须整条替换。
 */
export const ICON_SLOT_SELECTORS = ".b3-list-item__icon, .b3-menu__avemoji, .b3-list-item__switch";

/** 思源 emojiFont.ts 声明的两个字族，用作改写后的回退 */
const SIYUAN_EMOJI_FALLBACK = '"Emojis Additional", "Emojis Reset"';

/**
 * 生成两个 `@font-face`。
 *
 * `pluginName` 只用于拼 `/plugins/<name>/Twemoji/...` 的绝对路径：字体文件由各包的
 * `build.config.ts` 的 `copy` 从 `libs/emoji-font/fonts/` 复制进产物根目录，不走 vite 模块图。
 *
 * ## size-adjust: 76%
 * Twemoji 的字形墨迹约占 1.19em，而思源内置 emoji 经 `emojiFont.ts` 缩放后只有约
 * 0.9em（Windows 11：Noto 1.07em × 85%，其余平台：1.07em × 92%），不缩放时明显大一圈。
 *
 * 76% 必须与字体文件里的字形上移量配套：Twemoji 的墨迹为 -0.254…+0.938em，重心在基线
 * 上方 0.342em，缩到 76% 后只剩 0.260em，而中文「中」的重心在 0.384em，字形会明显偏下；
 * 因此使用方仓库里的 Twemoji 副本已把全部字形上移 167/1024 em
 * （见 `scripts/shift-twemoji-glyphs.py`），换算到 76% 即 +0.124em，重心变为 0.384em，
 * 与中文一致。改 `size-adjust` 会同时改变正文对齐与图标位置。
 *
 * ## 两个 face 的分工（不要合并）
 * - `Twemoji`：正文行内表情、代码块。要的是「与中文墨迹重心对齐」，故**不能**带
 *   `U+0020`——它一旦成为 first available font，Twemoji 那个 1.245em 宽的空格字形
 *   （乘 76% 后 0.95em）就会把行盒度量带偏。
 * - `Twemoji Icon`：文档树 / 菜单 / 开关图标，22px 定高盒 + `align-items: center`。
 *   它需要成为 first available font，`ascent/descent-override` 才生效，所以**必须**含
 *   `U+0020`（见下）。
 *
 * ## unicode-range 的两个作用
 * 1. 避开 Twemoji 为 U+0023 / U+002A / U+0030-0039 准备的**零宽占位字形**（供 keycap
 *    序列使用）。不加限制时正文里所有数字都会渲染成空白。
 * 2. 按 CSS 字体规范，first available font（strut 度量的来源）要求字体能匹配 U+0020。
 *    范围里没有空格时，带 override 的 face 当不了 strut 来源，行盒基线改由后备字体
 *    决定，`ascent/descent-override` 就等于没写。实测（16px / 22px 盒，负值 = 比盒中心高）：
 *
 *    | unicode-range          | 图标偏移 | 数字墨迹 |
 *    | ---------------------- | -------- | -------- |
 *    | `U+00A9-10FFFF`        | −1.25px  | 正常     |
 *    | 无 `unicode-range`     | −0.75px  | **消失** |
 *    | `U+0020, U+00A9-…`     | −0.75px  | 正常     |
 *
 * ## 图标位置的取值
 * 盒内基线位置为 `11px + (A - D) / 2`，墨迹中心相对基线固定，因此
 * `offset = 字号 × ((A - D) / 2 - 墨迹重心)`，与字号成线性、与平台无关。实测（22px 盒）：
 *
 * | 配置                                        | 16px    | 14px    | 19px    |
 * | ------------------------------------------- | ------- | ------- | ------- |
 * | 思源默认 `Emojis File Tree`（Noto 86/31）   | −1.5px  |         |         |
 * | `asc 120 / desc 8`（严格居中）              | 0px     | +0.25px | +0.5px  |
 * | **`asc 100 / desc 8`（采用）**              | −0.75px | −0.5px  | −0.88px |
 *
 * 取中间值：严格居中显得偏低，思源默认又偏高。微调只改 ascent，每 +2% 约下移
 * 0.12px（@16px）。字体文件里的字形上移已计入这组实测值，改 `--dy` 后必须重新标定。
 */
export const getEmojiFontFaceCSS = (pluginName: string): string => {
  const src = `url("/plugins/${pluginName}/Twemoji/${TWEMOJI_FILE}") format("woff2")`;
  return `@font-face {
  font-family: "Twemoji";
  src: ${src};
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  unicode-range: U+00A9-10FFFF;
  size-adjust: 76%;
}
@font-face {
  font-family: "Twemoji Icon";
  src: ${src};
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0020, U+00A9-10FFFF;
  size-adjust: 76%;
  ascent-override: 100%;
  descent-override: 8%;
  line-gap-override: 0%;
}`;
};

/**
 * 生成字体栈与图标槽位的覆盖规则。
 *
 * - `--b3-font-family-emoji-reset`：正文与代码字体栈里的 emoji 前缀。`emojiFont.ts` 与
 *   `setInlineStyle` 都把它排在字体栈最前，覆盖它 Twemoji 才能进正文。
 * - `--b3-font-family-emoji`：图标槽位专用变量。
 * - 图标槽位的 `font-family`：SiYuan 的 `base.css` 把 `"Emojis File Tree"` 硬写在首位，
 *   只改变量没用——那个 face 只在 `emojiPlatform === "windows"`（非 Windows 11）时声明，
 *   而 `isWin11()` 依赖 `navigator.userAgentData`，取不到时会静默退成 `windows`，
 *   于是图标位一直用内置 Noto 渲染，插件字体完全没参与。
 */
export const getEmojiFontRules = (): string[] => [
  `:root { --b3-font-family-emoji-reset: "Twemoji", ${SIYUAN_EMOJI_FALLBACK} !important; }`,
  ':root { --b3-font-family-emoji: "Twemoji Icon", "Emojis Additional", "Emojis Icon", emojis !important; }',
  `${ICON_SLOT_SELECTORS} { font-family: var(--b3-font-family-emoji) !important; }`,
];

/**
 * 一次性拿到 `@font-face` 与规则，供写进 `<style id="snippetCSS-…">`。
 * 两者必须同进同出：只放规则会让变量指向不存在的字族（静默退回 Noto）。
 */
export const getEmojiFontStyle = (pluginName: string): string => [getEmojiFontFaceCSS(pluginName), ...getEmojiFontRules()].join("\n");

/** 预加载两个字族的常用表情，避免首次渲染时闪回内置 Noto。 */
export const preloadEmojiFont = (): void => {
  if (!document.fonts || typeof document.fonts.load !== "function") {
    return;
  }
  for (const family of ['400 16px "Twemoji"', '400 16px "Twemoji Icon"']) {
    // 失败不影响使用，实际渲染时仍会按需拉取
    document.fonts.load(family, "\u{1F600}").catch(() => undefined);
  }
};
