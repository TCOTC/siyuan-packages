import { Plugin, Dialog, exitSiYuan, getBackend } from "siyuan";
import type zhCN from "./i18n/zh-CN.json";
import "./index.scss";

export default class ExitConfirm extends Plugin {
  declare i18n: typeof zhCN;

  private exitDialog: Dialog | null = null;
  private backend: string;
  private boundKeyDownHandler: (event: KeyboardEvent) => void;

  override onload() {
    this.backend = getBackend();
    if (this.backend === "windows") {
      this.boundKeyDownHandler = this.handleKeyDownWindows.bind(this);
    } else if (this.backend === "darwin") {
      this.boundKeyDownHandler = this.handleKeyDownMac.bind(this);
    }
    document.addEventListener("keydown", this.boundKeyDownHandler, true);
    console.log(this.displayName, "plugin loaded");
  }

  override onunload() {
    document.removeEventListener("keydown", this.boundKeyDownHandler, true);
    if (this.exitDialog) {
      this.exitDialog.destroy();
    }
    console.log(this.displayName, "plugin unloaded");
  }

  private handleKeyDownWindows(event: KeyboardEvent) {
    // Windows 退出：Alt + F4 / Alt + Shift + F4；Ctrl + Alt + F4 不退出
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
    // 用 code 判断物理按键：Option 会改变 key 的值（如 Option+Q 变成 "œ"）
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
    if (this.exitDialog) {
      return;
    }

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

    const contentText = this.i18n.exitConfirmContent.replace("{shortcut}", shortcutText);

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
        if (handleDialogKeyDown) {
          dialog.element.removeEventListener("keydown", handleDialogKeyDown, true);
        }
        this.exitDialog = null;
      },
    });

    this.exitDialog = dialog;

    const cancelBtn = dialog.element.querySelector("#exit-cancel-btn") as HTMLButtonElement;
    const confirmBtn = dialog.element.querySelector("#exit-confirm-btn") as HTMLButtonElement;

    cancelBtn.addEventListener("click", () => {
      dialog.destroy();
    });

    confirmBtn.addEventListener("click", () => {
      this.confirmExit();
    });

    handleDialogKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        dialog.destroy();
      }
      // Enter：按当前焦点决定确认还是取消
      else if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const activeElement = document.activeElement;
        if (activeElement === cancelBtn) {
          dialog.destroy();
        } else {
          this.confirmExit();
        }
      }
    };

    dialog.element.addEventListener("keydown", handleDialogKeyDown, true);

    confirmBtn.focus();
  }

  private confirmExit() {
    document.removeEventListener("keydown", this.boundKeyDownHandler, true);
    if (this.exitDialog) {
      this.exitDialog.destroy();
    }
    exitSiYuan();
  }
}
