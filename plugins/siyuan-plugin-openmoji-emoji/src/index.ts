import { EMOJI_UNICODE_RANGE } from "siyuan-emoji-font";
import { Plugin } from "siyuan";

// SiYuan 3.8.3 起字体栈由 --b3-font-family-emoji-reset 等变量拼成，只改写 emoji 前缀即可让
// OpenMoji 优先渲染表情符号，同时保留「设置 - 外观」中的全局默认字体与编辑器字体
// https://github.com/siyuan-note/siyuan/issues/16923
// https://github.com/siyuan-note/siyuan/issues/19148
const EMOJI_PREFIX = '"OpenMoji", "Emojis Additional", "Emojis Reset"';
// "Emojis Icon" 由主题在 Windows 11 上声明，图标位依赖其字形墨迹对齐，覆盖 emoji 栈时需要保留
const EMOJI_ICON_STACK = '"OpenMoji", "Emojis Additional", "Emojis Icon", emojis';

/**
 * 生成 `@font-face`。放在运行时而不是 `index.scss` 里，是为了让 `unicode-range` 与
 * `libs/emoji-font` 共用同一个常量（CSS 无法 import TS，两处各写一份必然会漂移）。
 *
 * 范围必须排除 U+200B / U+200C / U+2060 / U+FEFF：思源把它们当作行内语义元素
 * （code / kbd / tag / sup / sub）的占位符写进正文，被 emoji 字体抢走后行级代码内的光标矩形
 * 就会错位（siyuan-note/siyuan#21661）。详见 {@link EMOJI_UNICODE_RANGE}。
 */
const getFontFace = (pluginName: string) => `@font-face {
  font-family: "OpenMoji";
  /* 字体文件由 build.config.ts 的 copy 复制到插件根目录，绝对路径避免依赖插件 CSS 的注入位置 */
  src: url("/plugins/${pluginName}/OpenMoji/OpenMoji-color-glyf_colr_0-17.0.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  /* 该字体为 U+0020、U+0023、U+002A、U+0030-0039 定义了零宽占位字形（供 keycap 序列使用），
     未加限制时空格宽度变为 1.245em，数字与 #、* 不可见 */
  unicode-range: ${EMOJI_UNICODE_RANGE};
}`;

export default class OpenMojiPlugin extends Plugin {
  private readonly overrideStyle = document.createElement("style");

  override onload() {
    this.applyFontOverrides();
    this.preloadFonts();
    console.log(this.displayName, "loaded");
  }

  override onunload() {
    this.overrideStyle.remove();
    console.log(this.displayName, "unloaded");
  }

  private applyFontOverrides() {
    const rules = [getFontFace(this.name), `:root { --b3-font-family-emoji-reset: ${EMOJI_PREFIX} !important; }`, `:root { --b3-font-family-emoji: ${EMOJI_ICON_STACK} !important; }`];

    // id 以 snippetCSS 开头的 style 元素会被添加到导出 PDF 中
    // https://github.com/siyuan-note/siyuan/commit/4318aa446369eaf4ea85982ba4919b5d47340552
    // https://github.com/siyuan-note/siyuan/commit/0361599aba79a200c410aa9de5873da4a52b2667
    this.overrideStyle.id = "snippetCSS-" + this.name + "-override";
    this.overrideStyle.textContent = rules.join("\n");
    if (!this.overrideStyle.isConnected) {
      document.head.appendChild(this.overrideStyle);
    }
  }

  private preloadFonts() {
    if (!document.fonts || typeof document.fonts.load !== "function") {
      return;
    }
    setTimeout(() => {
      try {
        document.fonts.load('400 16px "OpenMoji"', "😀");
      } catch {
        // 预加载失败不影响插件功能
      }
    }, 0);
  }
}
