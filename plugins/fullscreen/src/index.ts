import { getActiveEditor, Plugin, Setting, showMessage } from "siyuan";
import { toggleConfiguredFullscreen, type FullscreenConfig } from "./fullscreen";
import type zhCN from "./i18n/zh-CN.json";
import "./index.scss";

const STORAGE_NAME = "config.json";
const BUTTON_ID = "fullscreen";
const ATTR_EDITOR = "data-jcfs-editor"; // :root 上标记「编辑器全屏」开关已开
const ATTR_WINDOW = "data-jcfs-window"; // :root 上标记「窗口全屏」开关已开
const BUTTON_ICON = '<svg class="jcfs-enter"><use xlink:href="#iconFullscreen"></use></svg><svg class="jcfs-exit"><use xlink:href="#iconFullscreenExit"></use></svg>';

const DEFAULT_CONFIG: FullscreenConfig = {
  editorFullscreen: true,
  windowFullscreen: true,
};

const normalizeConfig = (data: unknown): FullscreenConfig => {
  const source = typeof data === "object" && data !== null ? (data as Partial<FullscreenConfig>) : {};
  return {
    editorFullscreen: typeof source.editorFullscreen === "boolean" ? source.editorFullscreen : DEFAULT_CONFIG.editorFullscreen,
    windowFullscreen: typeof source.windowFullscreen === "boolean" ? source.windowFullscreen : DEFAULT_CONFIG.windowFullscreen,
  };
};

const getErrorMsg = (e: unknown) => {
  if (typeof e === "object" && e !== null && "msg" in e) {
    return String((e as { msg: unknown }).msg);
  }
  return e instanceof Error ? e.message : String(e);
};

const createSwitch = (checked: boolean) => {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "b3-switch fn__flex-center";
  input.checked = checked;
  return input;
};

export default class FullscreenPlugin extends Plugin {
  declare i18n: typeof zhCN;

  private config: FullscreenConfig = { ...DEFAULT_CONFIG };

  override async onload() {
    try {
      this.config = normalizeConfig(await this.loadData(STORAGE_NAME));
      this.data[STORAGE_NAME] = this.config;
    } catch (e) {
      const errorMessage = `${this.displayName}: failed to load data [${STORAGE_NAME}]: ${getErrorMsg(e)}`;
      showMessage(errorMessage);
      console.error(errorMessage);
      this.config = { ...DEFAULT_CONFIG };
    }

    this.initSetting();
    this.addCommand({
      langKey: "toggleCurrentEditorFullscreen",
      hotkey: "",
      callback: () => {
        this.toggleActiveEditorFullscreen();
      },
    });
    this.syncBreadcrumbButton();

    console.log(this.displayName, "plugin loaded");
  }

  override onunload() {
    this.clearConfigAttrs();
    this.removeBreadcrumbButton(BUTTON_ID);
    console.log(this.displayName, "plugin unloaded");
  }

  override uninstall() {
    this.removeData(STORAGE_NAME).catch((e) => {
      const errorMessage = `${this.displayName}: failed to uninstall remove data [${STORAGE_NAME}]: ${getErrorMsg(e)}`;
      showMessage(errorMessage);
      console.error(errorMessage);
    });

    console.log(this.displayName, "plugin uninstalled");
  }

  private initSetting() {
    let editorSwitch: HTMLInputElement;
    let windowSwitch: HTMLInputElement;

    this.setting = new Setting({
      height: "auto",
      width: "595px",
      confirmCallback: () => {
        this.config = {
          editorFullscreen: editorSwitch.checked,
          windowFullscreen: windowSwitch.checked,
        };
        this.data[STORAGE_NAME] = this.config;
        this.syncBreadcrumbButton();
        this.saveData(STORAGE_NAME, this.config).catch((e) => {
          const errorMessage = `${this.displayName}: failed to save data [${STORAGE_NAME}]: ${getErrorMsg(e)}`;
          showMessage(errorMessage);
          console.error(errorMessage);
        });
      },
    });

    this.setting.addItem({
      title: this.i18n.editorFullscreen,
      description: this.i18n.editorFullscreenDesc,
      createActionElement: () => {
        editorSwitch = createSwitch(this.config.editorFullscreen);
        return editorSwitch;
      },
    });

    this.setting.addItem({
      title: this.i18n.windowFullscreen,
      description: this.i18n.windowFullscreenDesc,
      createActionElement: () => {
        windowSwitch = createSwitch(this.config.windowFullscreen);
        return windowSwitch;
      },
    });
  }

  private toggleActiveEditorFullscreen() {
    const editor = getActiveEditor(false);
    if (!editor) {
      return;
    }
    toggleConfiguredFullscreen(editor.protyle, this.config);
  }

  private hasEnabledAction() {
    return this.config.editorFullscreen || this.config.windowFullscreen;
  }

  private applyConfigAttrs() {
    document.documentElement.toggleAttribute(ATTR_EDITOR, this.config.editorFullscreen);
    document.documentElement.toggleAttribute(ATTR_WINDOW, this.config.windowFullscreen);
  }

  private clearConfigAttrs() {
    document.documentElement.removeAttribute(ATTR_EDITOR);
    document.documentElement.removeAttribute(ATTR_WINDOW);
  }

  private syncBreadcrumbButton() {
    if (!this.hasEnabledAction()) {
      this.clearConfigAttrs();
      this.removeBreadcrumbButton(BUTTON_ID);
      return;
    }

    this.applyConfigAttrs();
    this.addBreadcrumbButton({
      id: BUTTON_ID,
      icon: BUTTON_ICON,
      title: this.i18n.buttonTitle,
      callback: (_event, protyle) => {
        toggleConfiguredFullscreen(protyle, this.config);
      },
    });
  }
}
