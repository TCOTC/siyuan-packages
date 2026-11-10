import { platformUtils } from "siyuan";
import { isMobileFrontend } from "siyuan-plugin-env";

/** 同步元素属性：值相同时跳过；空字符串时移除属性 */
export function syncAttr(element: HTMLElement, name: string, value: string): void {
  const current = element.getAttribute(name) ?? "";
  if (current === value) {
    return;
  }
  if (value) {
    element.setAttribute(name, value);
  } else {
    element.removeAttribute(name);
  }
}

/**
 * 轮询等待元素出现；shouldAbort 返回 true 时中止并返回 null（不计为超时）。
 */
export function waitForElement(selector: string, shouldAbort?: () => boolean): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    let retryCount = 0;

    const tryFind = () => {
      if (shouldAbort?.()) {
        resolve(null);
        return;
      }

      const element = document.querySelector(selector);
      if (element instanceof HTMLElement) {
        resolve(element);
        return;
      }

      if (retryCount >= 50) {
        resolve(null);
        return;
      }

      retryCount++;
      setTimeout(tryFind, 100);
    };

    tryFind();
  });
}

export function isReadOnly(): boolean {
  return !!window.siyuan.config?.readonly || !!window.siyuan.isPublish;
}

export const isMobile = (): boolean => isMobileFrontend();

export const isIPad = () => platformUtils.isIPad();

/** 判断是否为触屏设备（安卓平板只能通过这个） */
export const isTouchDevice = () => {
  return "ontouchstart" in window && navigator.maxTouchPoints > 1;
};

/** 判断是否为 Windows 系统（判断前端环境，而非内核后端，例如 Docker 部署时前端可能是 Windows 浏览器） */
export const isWindows = (): boolean => {
  return navigator.platform.toUpperCase().indexOf("WIN") > -1;
};

export const isLocalPath = (link: string) => {
  if (!link) {
    return false;
  }

  link = link.trim();
  if (1 > link.length) {
    return false;
  }

  link = link.toLowerCase();
  if (link.startsWith("assets/") || link.startsWith("file://") || link.startsWith("\\\\") /* Windows 网络共享路径 */) {
    return true;
  }

  if (isWindows()) {
    const colonIdx = link.indexOf(":");
    return 1 === colonIdx; // 冒号前面只有一个字符认为是 Windows 盘符而不是网络协议
  }
  return link.startsWith("/");
};
