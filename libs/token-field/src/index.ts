/**
 * 令牌输入框的遮蔽策略
 *
 * 遮蔽是默认状态，由基础类 `.siyuan-token-field` 承载；「眼睛」按钮只加上「显示明文」这
 * 一个修饰类，不把默认状态做成需要 JS 额外添加的修饰类。
 *
 * 遮蔽有两种做法，按运行环境择一：
 * - CSS：输入框始终是 `type="text"`，靠 `-webkit-text-security: disc` 显示圆点。Chromium 只对
 *   `type="password"`、以及「曾经是密码框」（带 `HAS_BEEN_PASSWORD_FIELD`）的输入框上报密码类的
 *   `EditorInfo.inputType`，移动端第三方输入法据此弹出安全键盘，而安全键盘不提供剪贴板、无法粘贴；
 *   `type="text"` 不会进入这条路径，因此显示与隐藏两种状态下都能正常粘贴
 * - 密码框：不支持 `-webkit-text-security` 时（如 Firefox）退回 `type="password"` 与 `type="text"` 互切。
 *   该环境下输入法不会把文本字段当成密码（只在 Chromium 内核上遇到安全键盘），因此仍然可用
 *
 * 两个类名要与各包 `index.scss` 里的同名选择器一致，CSS 不能 import TS，改名会静默让令牌以明文显示。
 */

/** 令牌输入框的基础类名（默认以圆点遮蔽） */
export const TOKEN_FIELD_CLASS = "siyuan-token-field";
/** 「眼睛」按钮切换后的明文状态 */
export const TOKEN_REVEAL_CLASS = "siyuan-token-field--revealed";

/** 只要 `CSS.supports` 这一个成员，便于单测直接传替身 */
export interface CssSupportsLike {
  supports?: (property: string, value: string) => boolean;
}

/**
 * 判断能否用 CSS 遮蔽文本
 *
 * 传入 `CSS` 对象而不是直接读全局，便于单元测试；缺少 `CSS.supports`、调用抛错或返回值不是 `true` 时
 * 一律按不支持处理，让调用方退回密码框（宁可回到有安全键盘的老行为，也不要让令牌明文显示）
 */
export function supportsTextSecurity(css: CssSupportsLike | undefined | null): boolean {
  if (!css || typeof css.supports !== "function") {
    return false;
  }
  try {
    return css.supports("-webkit-text-security", "disc") === true;
  } catch {
    return false;
  }
}

/** 令牌输入框的遮蔽行为 */
export interface TokenMask {
  /** true 表示始终是 `type="text"`，靠 CSS 遮蔽圆点 */
  cssMask: boolean;
  /** 按环境决定输入框的 `type` */
  type: "text" | "password";
  /** 把遮蔽类追加到既有 class 之后（不支持 CSS 时原样返回） */
  className(base: string): string;
  /** 「眼睛」按钮：切换明文显示 */
  toggle(input: HTMLInputElement): void;
}

/** 按运行环境建立遮蔽策略；同一环境下可以只建一次 */
export function createTokenMask(css?: CssSupportsLike | undefined | null): TokenMask {
  const cssMask = supportsTextSecurity(css);
  return {
    cssMask,
    type: cssMask ? "text" : "password",
    className: (base) => (cssMask ? `${base} ${TOKEN_FIELD_CLASS}` : base),
    toggle: (input) => {
      if (cssMask) {
        input.classList.toggle(TOKEN_REVEAL_CLASS);
        return;
      }
      input.type = input.type === "password" ? "text" : "password";
    },
  };
}
