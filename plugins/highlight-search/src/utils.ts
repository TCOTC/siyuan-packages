import { isMobileFrontend } from "siyuan-plugin-env";

export const CLASS_NAME = "jchs-container";

/** 判断是否为移动端（走宿主的 getFrontend()，与思源自适应布局同一口径） */
export const isMobile = () => isMobileFrontend();

/** 判断当前环境是否支持 CSS Custom Highlight API */
export const isHighlightApiSupported = () => {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";
};
