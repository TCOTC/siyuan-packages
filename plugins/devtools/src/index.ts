import { Constants, fetchPost, getFrontend, Menu, Plugin, Setting, showMessage } from "siyuan";
import VConsole from "vconsole";
import type zhCN from "./i18n/zh-CN.json";
import "./index.scss";

const STORAGE_NAME = "config.json";

const PLUGIN_DIR_API_PATH = "/data/plugins";
const PLUGIN_STORAGE_DIR_API_PATH = "/data/storage/petal";

/** 日志与网络记录默认上限为 1000，这里加倍 */
const VCONSOLE_MAX_ITEM_NUMBER = 2000;

const TOP_BAR_ID = {
  desktop: "desktop",
  reloadUI: "reloadUI",
  toggleDevTools: "toggleDevTools",
} as const;

type FeatureKey = "reloadUI" | "openPluginDir" | "openPluginStorageDir" | "toggleDevTools";

interface PluginConfig {
  reloadUI: boolean;
  openPluginDir: boolean;
  openPluginStorageDir: boolean;
  toggleDevTools: boolean;
}

const DEFAULT_CONFIG: PluginConfig = {
  reloadUI: true,
  openPluginDir: true,
  openPluginStorageDir: true,
  toggleDevTools: true,
};

const FEATURE_KEYS: FeatureKey[] = ["reloadUI", "openPluginDir", "openPluginStorageDir", "toggleDevTools"];

let vConsoleInstance: VConsole | undefined;
let vConsoleSwitchVisible = false;

const isMobileFrontend = () => {
  const frontend = getFrontend();
  return frontend === "mobile" || frontend === "browser-mobile";
};

const isDesktopClientFrontend = () => {
  const frontend = getFrontend();
  return frontend === "desktop" || frontend === "desktop-window";
};

const normalizeConfig = (data: unknown): PluginConfig => {
  const source = typeof data === "object" && data !== null ? (data as Partial<PluginConfig>) : {};
  return {
    reloadUI: typeof source.reloadUI === "boolean" ? source.reloadUI : DEFAULT_CONFIG.reloadUI,
    openPluginDir: typeof source.openPluginDir === "boolean" ? source.openPluginDir : DEFAULT_CONFIG.openPluginDir,
    openPluginStorageDir: typeof source.openPluginStorageDir === "boolean" ? source.openPluginStorageDir : DEFAULT_CONFIG.openPluginStorageDir,
    toggleDevTools: typeof source.toggleDevTools === "boolean" ? source.toggleDevTools : DEFAULT_CONFIG.toggleDevTools,
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

const joinDataPath = (...segments: string[]): string => {
  const dataDir = window.siyuan.config.system.dataDir ?? "";
  if (!dataDir) {
    return "";
  }
  const sep = dataDir.includes("\\") ? "\\" : "/";
  return [dataDir, ...segments].join(sep);
};

const getElectron = () => {
  try {
    return window.require?.("electron");
  } catch {
    return undefined;
  }
};

/**
 * siyuan@1.2.9 把 multipart 接口的 body 收紧成带 `apiRequest` 影子字段的 FormData，
 * 运行期仍然是普通 FormData。这里只做类型层放行，调用方式与旧版一致。
 */
type MultipartFormData = FormData & { readonly apiRequest: never };

const ensureWorkspaceDir = (apiPath: string): Promise<void> => {
  return new Promise((resolve) => {
    const formData = new FormData() as MultipartFormData;
    formData.append("path", apiPath);
    formData.append("isDir", "true");
    fetchPost(
      "/api/file/putFile",
      formData,
      () => resolve(),
      undefined,
      () => resolve(),
    );
  });
};

const openLocalPath = async (filePath: string, fallbackMessage: string): Promise<void> => {
  if (!filePath) {
    showMessage(fallbackMessage);
    return;
  }
  const electron = getElectron();
  if (electron?.ipcRenderer) {
    electron.ipcRenderer.send(Constants.SIYUAN_CMD, {
      cmd: "openPath",
      filePath,
    });
    return;
  }
  if (electron?.shell?.openPath) {
    const error = await electron.shell.openPath(filePath);
    if (!error) {
      return;
    }
  }
  showMessage(`${fallbackMessage}\n${filePath}`);
};

const toggleVConsoleSwitch = () => {
  if (!vConsoleInstance) {
    const theme = window.siyuan.config.appearance.mode === 1 ? "dark" : "light";
    vConsoleInstance = new VConsole({
      theme,
      pluginOrder: ["default", "element", "network", "storage", "system"],
      disableLogScrolling: true,
      log: { maxLogNumber: VCONSOLE_MAX_ITEM_NUMBER },
      network: { maxNetworkNumber: VCONSOLE_MAX_ITEM_NUMBER },
    });
    vConsoleSwitchVisible = true;
    return;
  }
  if (vConsoleSwitchVisible) {
    vConsoleInstance.hideSwitch();
    vConsoleInstance.hide();
    vConsoleSwitchVisible = false;
    return;
  }
  vConsoleInstance.showSwitch();
  vConsoleSwitchVisible = true;
};

const destroyVConsole = () => {
  vConsoleInstance?.destroy();
  vConsoleInstance = undefined;
  vConsoleSwitchVisible = false;
};

export default class DevToolsPlugin extends Plugin {
  declare i18n: typeof zhCN;

  private isMobile = false;
  private isDesktopClient = false;
  private config: PluginConfig = { ...DEFAULT_CONFIG };

  override async onload() {
    this.isMobile = isMobileFrontend();
    this.isDesktopClient = isDesktopClientFrontend();
    await this.loadConfig();
    this.initSetting();
    this.registerCommands();

    console.log(this.displayName, "plugin loaded");
  }

  override onLayoutReady() {
    this.syncTopBars();

    console.log(this.displayName, "plugin layout ready");
  }

  override onDataChanged() {
    void this.loadConfig().then(() => {
      this.syncTopBars();
    });
  }

  override onunload() {
    destroyVConsole();

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

  private async loadConfig() {
    try {
      this.config = normalizeConfig(await this.loadData(STORAGE_NAME));
      this.data[STORAGE_NAME] = this.config;
    } catch (e) {
      const errorMessage = `${this.displayName}: failed to load data [${STORAGE_NAME}]: ${getErrorMsg(e)}`;
      showMessage(errorMessage);
      console.error(errorMessage);
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  private isFeatureSupported(key: FeatureKey) {
    switch (key) {
      case "reloadUI":
        return true;
      case "openPluginDir":
      case "openPluginStorageDir":
        return this.isDesktopClient;
      case "toggleDevTools":
        return this.isDesktopClient || this.isMobile;
    }
  }

  private isFeatureActive(key: FeatureKey) {
    return this.config[key] && this.isFeatureSupported(key);
  }

  private hasActiveFeature() {
    return FEATURE_KEYS.some((key) => this.isFeatureActive(key));
  }

  private ensureFeatureActive(key: FeatureKey) {
    if (this.isFeatureActive(key)) {
      return true;
    }
    showMessage(`${this.displayName}: ${this.i18n.featureDisabled}`);
    return false;
  }

  private initSetting() {
    const switches = new Map<FeatureKey, HTMLInputElement>();

    this.setting = new Setting({
      height: "auto",
      width: "595px",
      confirmCallback: () => {
        this.config = {
          reloadUI: switches.get("reloadUI")?.checked ?? this.config.reloadUI,
          openPluginDir: switches.get("openPluginDir")?.checked ?? this.config.openPluginDir,
          openPluginStorageDir: switches.get("openPluginStorageDir")?.checked ?? this.config.openPluginStorageDir,
          toggleDevTools: switches.get("toggleDevTools")?.checked ?? this.config.toggleDevTools,
        };
        this.data[STORAGE_NAME] = this.config;
        this.syncTopBars();
        this.saveData(STORAGE_NAME, this.config).catch((e) => {
          const errorMessage = `${this.displayName}: failed to save data [${STORAGE_NAME}]: ${getErrorMsg(e)}`;
          showMessage(errorMessage);
          console.error(errorMessage);
        });
      },
    });

    const addSwitchItem = (key: FeatureKey, title: string, description: string) => {
      if (!this.isFeatureSupported(key)) {
        return;
      }
      this.setting.addItem({
        title,
        description,
        createActionElement: () => {
          const input = createSwitch(this.config[key]);
          switches.set(key, input);
          return input;
        },
      });
    };

    addSwitchItem("reloadUI", this.i18n.reloadUI, this.i18n.reloadUIDesc);
    addSwitchItem("openPluginDir", this.i18n.openPluginDir, this.i18n.openPluginDirDesc);
    addSwitchItem("openPluginStorageDir", this.i18n.openPluginStorageDir, this.i18n.openPluginStorageDirDesc);
    addSwitchItem("toggleDevTools", this.i18n.toggleDevTools, this.isMobile ? this.i18n.toggleDevToolsDescMobile : this.i18n.toggleDevToolsDescDesktop);
  }

  private registerCommands() {
    if (this.isFeatureSupported("reloadUI")) {
      this.addCommand({
        langKey: "reloadUI",
        hotkey: "",
        callback: () => {
          this.reloadUI();
        },
      });
    }
    if (this.isFeatureSupported("openPluginDir")) {
      this.addCommand({
        langKey: "openPluginDir",
        hotkey: "",
        callback: () => {
          void this.openPluginDir();
        },
      });
    }
    if (this.isFeatureSupported("openPluginStorageDir")) {
      this.addCommand({
        langKey: "openPluginStorageDir",
        hotkey: "",
        callback: () => {
          void this.openPluginStorageDir();
        },
      });
    }
    if (this.isFeatureSupported("toggleDevTools")) {
      this.addCommand({
        langKey: "toggleDevTools",
        hotkey: "",
        callback: () => {
          this.toggleDevTools();
        },
      });
    }
  }

  private syncTopBar(id: string, visible: boolean, create: () => void) {
    if (visible) {
      create();
      return;
    }
    this.removeTopBar(id);
  }

  private syncTopBars() {
    if (!this.isFeatureActive("toggleDevTools")) {
      destroyVConsole();
    }

    if (this.isMobile) {
      this.syncTopBar(TOP_BAR_ID.reloadUI, this.isFeatureActive("reloadUI"), () =>
        this.addTopBar({
          id: TOP_BAR_ID.reloadUI,
          icon: "iconRefresh",
          title: this.i18n.reloadUI,
          callback: () => {
            this.reloadUI();
          },
        }),
      );
      this.syncTopBar(TOP_BAR_ID.toggleDevTools, this.isFeatureActive("toggleDevTools"), () =>
        this.addTopBar({
          id: TOP_BAR_ID.toggleDevTools,
          icon: "iconBug",
          title: this.i18n.toggleDevTools,
          callback: () => {
            this.toggleDevTools();
          },
        }),
      );
      return;
    }

    this.syncTopBar(TOP_BAR_ID.desktop, this.hasActiveFeature(), () => {
      const topBarElement = this.addTopBar({
        id: TOP_BAR_ID.desktop,
        icon: "iconBug",
        title: this.displayName,
        position: "right",
        callback: () => {
          this.openMenu(this.getTopBarRect(topBarElement));
        },
      });
    });
  }

  private reloadUI() {
    if (!this.ensureFeatureActive("reloadUI")) {
      return;
    }
    fetchPost("/api/ui/reloadUI", {}, undefined, undefined, () => {
      showMessage(`${this.displayName}: ${this.i18n.reloadUIFailed}`);
    });
  }

  private async openPluginDir() {
    if (!this.ensureFeatureActive("openPluginDir")) {
      return;
    }
    await ensureWorkspaceDir(PLUGIN_DIR_API_PATH);
    await openLocalPath(joinDataPath("plugins"), this.i18n.openDirFailed);
  }

  private async openPluginStorageDir() {
    if (!this.ensureFeatureActive("openPluginStorageDir")) {
      return;
    }
    await ensureWorkspaceDir(PLUGIN_STORAGE_DIR_API_PATH);
    await openLocalPath(joinDataPath("storage", "petal"), this.i18n.openDirFailed);
  }

  private toggleDevTools() {
    if (!this.ensureFeatureActive("toggleDevTools")) {
      return;
    }
    if (this.isMobile) {
      toggleVConsoleSwitch();
      return;
    }
    const electron = getElectron();
    if (!electron?.ipcRenderer) {
      showMessage(`${this.displayName}: ${this.i18n.toggleDevToolsFailed}`);
      return;
    }
    electron.ipcRenderer.send(Constants.SIYUAN_CMD, "toggleDevTools");
  }

  private getCommandHotkey(langKey: string) {
    return this.commands.find((item) => item.langKey === langKey)?.customHotkey;
  }

  private getTopBarRect(topBarElement: Element) {
    let rect = topBarElement.getBoundingClientRect();
    if (rect.width === 0) {
      rect = document.querySelector("#barMore")?.getBoundingClientRect() ?? rect;
    }
    if (rect.width === 0) {
      rect = document.querySelector("#barPlugins")?.getBoundingClientRect() ?? rect;
    }
    return rect;
  }

  private openMenu(rect: DOMRect) {
    const menu = new Menu(`${this.name}TopBar`);
    if (this.isFeatureActive("reloadUI")) {
      menu.addItem({
        icon: "iconRefresh",
        label: this.i18n.reloadUI,
        accelerator: this.getCommandHotkey("reloadUI"),
        click: () => {
          this.reloadUI();
        },
      });
    }
    if (this.isFeatureActive("openPluginDir")) {
      menu.addItem({
        icon: "iconFolder",
        label: this.i18n.openPluginDir,
        accelerator: this.getCommandHotkey("openPluginDir"),
        click: () => {
          void this.openPluginDir();
        },
      });
    }
    if (this.isFeatureActive("openPluginStorageDir")) {
      menu.addItem({
        icon: "iconDatabase",
        label: this.i18n.openPluginStorageDir,
        accelerator: this.getCommandHotkey("openPluginStorageDir"),
        click: () => {
          void this.openPluginStorageDir();
        },
      });
    }
    if (this.isFeatureActive("toggleDevTools")) {
      menu.addItem({
        icon: "iconBug",
        label: this.i18n.toggleDevTools,
        accelerator: this.getCommandHotkey("toggleDevTools"),
        click: () => {
          this.toggleDevTools();
        },
      });
    }
    if (!this.hasActiveFeature()) {
      return;
    }
    menu.open({
      x: rect.right,
      y: rect.bottom,
      isLeft: true,
    });
  }
}
