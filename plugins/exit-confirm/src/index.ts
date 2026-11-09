import { Plugin, Dialog, exitSiYuan, getBackend } from "siyuan";
import type zhCN from "./i18n/zh-CN.json";
import "./index.scss";

export default class ExitConfirm extends Plugin {
  declare i18n: typeof zhCN;

  private exitDialog: Dialog | null = null;
  private backend: string;
  private boundKeyDownHandler: (event: KeyboardEvent) => void;

  override onload() {
    // 获取后端平台信息
    this.backend = getBackend();
    // 根据平台绑定不同的处理函数
    if (this.backend === "windows") {
      this.boundKeyDownHandler = this.handleKeyDownWindows.bind(this);
    } else if (this.backend === "darwin") {
      this.boundKeyDownHandler = this.handleKeyDownMac.bind(this);
    }
    // 监听键盘事件，拦截退出快捷键
    document.addEventListener("keydown", this.boundKeyDownHandler, true);
    console.log(this.displayName, "plugin loaded");
  }

  override onunload() {
    // 移除事件监听器
    document.removeEventListener("keydown", this.boundKeyDownHandler, true);
    // 清理对话框
    if (this.exitDialog) {
      this.exitDialog.destroy();
    }
    console.log(this.displayName, "plugin unloaded");
  }

  private handleKeyDownWindows(event: KeyboardEvent) {
    // Windows 退出: Alt + F4 / Alt + Shift + F4
    // 不会退出：Ctrl + Alt + F4
    if (event.key === "F4" && event.altKey && !event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      if (this.exitDialog) {
        this.confirmExit();
      } else {
        this.showExitConfirmDialog(event);
      }
    }
  }

  private handleKeyDownMac(event: KeyboardEvent) {
    // macOS 退出: Command + Q / Command + Option + Q
    // 使用 code 判断物理按键，因为 Option 键会改变 key 的值（如 Option+Q 变成 "œ"）
    if (event.code === "KeyQ" && event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      if (this.exitDialog) {
        this.confirmExit();
      } else {
        this.showExitConfirmDialog(event);
      }
    }
  }

  private showExitConfirmDialog(event: KeyboardEvent) {
    // 如果对话框已经打开，则不再重复打开
    if (this.exitDialog) {
      return;
    }

    // 根据实际按键组合生成快捷键文本
    let shortcutText = "";
    if (this.backend === "windows") {
      const parts: string[] = [];
      if (event.altKey) parts.push("Alt");
      if (event.shiftKey) parts.push("Shift");
      parts.push("F4");
      shortcutText = parts.join("+");
    } else {
      const parts: string[] = [];
      if (event.altKey) parts.push("Option");
      if (event.metaKey) parts.push("Command");
      parts.push("Q");
      shortcutText = parts.join("+");
    }

    // 替换提示文本中的快捷键占位符
    const contentText = this.i18n.exitConfirmContent.replace("{shortcut}", shortcutText);

    // 监听键盘事件的处理函数
    let handleDialogKeyDown: (e: KeyboardEvent) => void;

    const dialog = new Dialog({
      content: `<div class="b3-dialog__content">
    <div class="fn__flex-center" style="padding: 8px 0;">
        <div style="font-weight: 500; font-size: 16px; margin-bottom: 8px;">${this.i18n.exitConfirmTitle}</div>
        <div class="ft__smaller ft__on-surface">${contentText}</div>
    </div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" id="exit-cancel-btn">${this.i18n.cancel}</button>
    <div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="exit-confirm-btn">${this.i18n.exit}</button>
</div>`,
      hideCloseIcon: true,
      destroyCallback: () => {
        // 对话框销毁时清理事件监听器
        if (handleDialogKeyDown) {
          dialog.element.removeEventListener("keydown", handleDialogKeyDown, true);
        }
        this.exitDialog = null;
      },
    });

    this.exitDialog = dialog;

    const cancelBtn = dialog.element.querySelector("#exit-cancel-btn") as HTMLButtonElement;
    const confirmBtn = dialog.element.querySelector("#exit-confirm-btn") as HTMLButtonElement;

    // 取消按钮点击事件
    cancelBtn.addEventListener("click", () => {
      dialog.destroy();
    });

    // 确认按钮点击事件
    confirmBtn.addEventListener("click", () => {
      this.confirmExit();
    });

    // 监听键盘事件
    handleDialogKeyDown = (e: KeyboardEvent) => {
      // Esc 键取消退出
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        dialog.destroy();
      }
      // Enter 键：根据当前焦点决定行为
      else if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        // 检查当前焦点在哪个按钮上
        const activeElement = document.activeElement;
        if (activeElement === cancelBtn) {
          // 焦点在取消按钮上，执行取消
          dialog.destroy();
        } else {
          // 焦点在确认按钮上或其他位置，执行确认退出
          this.confirmExit();
        }
      }
    };

    dialog.element.addEventListener("keydown", handleDialogKeyDown, true);

    // 聚焦到确认按钮
    confirmBtn.focus();
  }

  private confirmExit() {
    // 移除事件监听器，防止重复处理
    document.removeEventListener("keydown", this.boundKeyDownHandler, true);
    if (this.exitDialog) {
      this.exitDialog.destroy();
    }
    exitSiYuan();
  }
}
