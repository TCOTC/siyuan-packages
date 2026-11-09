import "./index.scss";
import { Snippet, SnippetType } from "./types";
import { SnippetStore } from "./domain/snippet-store";
import { SnippetsConfig } from "./config/config";
import { ConfigService } from "./config/config-service";
import { settleWriteResponse } from "./utils";
import { BroadcastService } from "./services/sync";
import { FileWatchService } from "./services/file-watch";
import { ImportExportService } from "./services/import-export";
import { FeedbackService } from "./services/feedback";
import { ListenerRegistry } from "./services/listener-registry";
import { SnippetManager } from "./services/snippet-manager";
import { GistTokenService } from "./services/gist-token";
import { GistSyncService } from "./services/gist-sync";
import { WsMainSnippetSync } from "./services/ws-main";
import { SnippetGroupStore } from "./services/snippet-groups";
import { SnippetUiStorage } from "./services/ui-storage";
import { SnippetsMenu } from "./ui/menu";

import { fetchPost, getFrontend, Plugin } from "siyuan";

// CodeMirror 编辑器工厂与生命周期管理见 src/ui/editor-manager.ts，编辑对话框见 src/ui/snippets-dialog.ts
import { EditorManager } from "./ui/editor-manager";
import { SettingDialog } from "./ui/setting-dialog";
import { SnippetsDialog } from "./ui/snippets-dialog";
import { GistDialog } from "./ui/gist-dialog";

export default class PluginSnippets extends Plugin {
  isMobile = false;

  snippetStore!: SnippetStore;
  menuView!: SnippetsMenu;
  snippetManager!: SnippetManager;
  editorManager!: EditorManager;
  settingDialog!: SettingDialog;
  snippetsDialog!: SnippetsDialog;
  configService!: ConfigService;
  /** UI 模块统一经本字段读取配置，写入走 ConfigService。 */
  config!: SnippetsConfig;
  fileWatchService!: FileWatchService;
  importExportService!: ImportExportService;
  private feedbackService!: FeedbackService;
  private listenerRegistry!: ListenerRegistry;
  /** 跨窗口广播服务；发布会话不加载本插件，普通会话恒可用。 */
  syncService: BroadcastService | null = null;
  gistTokenService!: GistTokenService;
  gistSyncService!: GistSyncService;
  gistDialog!: GistDialog;
  wsMainSync!: WsMainSnippetSync;
  snippetGroupStore!: SnippetGroupStore;
  uiStorage!: SnippetUiStorage;

  // ================================ 运行态 ================================

  isReloadUIRequired = false;

  /** 以内核 /api/snippet/getSnippet 为权威，仅作同页会话缓存。 */
  snippetsList: Snippet[] = [];

  private snippetsTypeCache: SnippetType | undefined;

  /** 当前代码片段类型（用户切换过则用缓存值，否则用配置默认值） */
  get snippetsType(): SnippetType {
    const type = this.snippetsTypeCache ?? this.config.defaultSnippetsType;
    if (type !== "css" && type !== "js") {
      return "css";
    }
    return type;
  }
  set snippetsType(value: SnippetType) {
    this.snippetsTypeCache = value;
  }

  /** 仅在开启「开发者工具调试输出」配置时打印 log。 */
  console = {
    log: (...args: any[]) => {
      if (this.config.consoleDebug) {
        console.log(...args);
      }
    },
    warn: (...args: any[]) => console.warn(...args),
    error: (...args: any[]) => console.error(...args),
  };

  public async onload() {
    this.config = new SnippetsConfig();

    this.snippetStore = new SnippetStore(this);

    this.snippetManager = new SnippetManager(this);

    this.menuView = new SnippetsMenu(this);

    this.editorManager = new EditorManager(this);

    this.configService = new ConfigService(this);

    this.settingDialog = new SettingDialog(this);

    this.fileWatchService = new FileWatchService(this);

    this.importExportService = new ImportExportService(this);

    this.gistTokenService = new GistTokenService(this);

    this.gistSyncService = new GistSyncService(this);

    this.gistDialog = new GistDialog(this);

    this.feedbackService = new FeedbackService(this);

    this.listenerRegistry = new ListenerRegistry(this);

    this.snippetsDialog = new SnippetsDialog(this);

    this.wsMainSync = new WsMainSnippetSync(this);

    this.snippetGroupStore = new SnippetGroupStore(this);

    this.uiStorage = new SnippetUiStorage(this);

    // 以下初始化只依赖 onload 时已就绪的静态骨架，不依赖布局就绪后的 DOM，
    // 前置让配置与跨窗口服务尽早可用。
    this.isMobile = ["mobile", "browser-mobile"].includes(getFrontend());

    // addIcons 仅向 body 注入隐藏 svg defs，须先于 initTopBar。
    this.menuView.initIcons();

    // 注册快捷键（都默认置空；addCommand 只写 window.siyuan.config.keymap，无布局依赖）
    this.addCommand({
      langKey: "openSnippetsManager",
      hotkey: "",
      callback: () => {
        this.menuView.openSnippetsManager();
      },
    });
    this.addCommand({
      langKey: "reloadUI",
      hotkey: "",
      callback: () => {
        this.snippetsDialog.reloadUI();
      },
    });

    await this.configService.init();

    // onload 阶段列表为空，这里只校验文件形状；菜单打开时再以权威列表对账。
    await this.snippetGroupStore.load(this.snippetsList);
    if (this.config.fileWatchEnabled && this.config.fileWatchEnabled !== "disabled") {
      this.fileWatchService.start();
    }

    this.syncService = new BroadcastService({
      logger: this.console,
      // 业务分发注册表见 SnippetManager.buildSyncHandlers；接收窗口按 snippetId 自拉权威数据。
      handlers: this.snippetManager.buildSyncHandlers(),
    });
    await this.syncService.start();

    this.wsMainSync.start();

    // 预热 Token 到会话缓存；磁盘无密文时静默。
    void this.gistTokenService.loadToken();

    console.log(this.displayName, "plugin onloaded");
  }

  public async onLayoutReady() {
    // addTopBar 依赖布局就绪后的 #barPlugins。
    void this.menuView.initTopBar();
  }

  /** 思源 v3.8.3 之后也会因同内核其他前端实例改配置而触发。 */
  public async onDataChanged() {
    await this.configService.reloadFromStorage();

    await this.snippetGroupStore.load(this.snippetsList);

    // 统一由 SnippetsMenu 内部处理重建门槛，不能以 isGroupedView() 为门槛，
    // 否则删掉最后一个分组后不会重建。
    this.menuView.refreshSnippetsContainerAfterExternalChange();
  }

  /**
   * 运行时清理都收敛在这里，禁用与卸载路径都必须覆盖。
   */
  public onunload() {
    this.syncService?.stop();

    // 防止插件实例重载后旧监听器残留。
    this.wsMainSync?.stop();

    this.snippetsDialog.closeAllDialogs();

    this.editorManager.cleanupEditorStyles();

    this.editorManager.stopThemeModeWatch();

    this.menuView.close();

    this.fileWatchService.stop();

    this.listenerRegistry.destroy();

    // 只清内存，不删磁盘密文。
    this.gistTokenService.clear();

    console.log(this.displayName, "plugin unloaded");
  }

  /**
   * 卸载只做专属逻辑：删除插件数据目录。
   * removeData("") 归一到 data/storage/petal/snippets/，内核递归删除整棵目录。
   */
  public async uninstall() {
    const removeResponse = await settleWriteResponse(this.removeData(""));
    if (removeResponse.code !== 0) {
      this.showErrorMessage(this.i18n.removeConfigFailed + " [" + removeResponse.code + ": " + removeResponse.msg + "]", 20000, "error");
      return;
    }

    // 视图偏好存在内核 localStorage，不随数据目录删除。
    await this.uiStorage.clear();

    console.log(this.displayName, "plugin uninstalled");
  }

  /** 方法名固定为 openSetting，思源按该名字调用。 */
  public openSetting() {
    this.settingDialog.open();
  }

  // ================================ 消息处理 ================================

  showNotification(messageI18nKey: string, timeout: number | undefined = undefined) {
    this.feedbackService.showNotification(messageI18nKey, timeout);
  }

  showErrorMessage(message: string, timeout: number | undefined = undefined, id?: string) {
    this.feedbackService.showErrorMessage(message, timeout, id);
  }

  // ================================ 工具方法 ================================

  postReloadUI() {
    // 旧代码把回调放在第二个参数（data 位）：内核不读它，回调实际不会执行。
    // 思源 1.2.9 把该位置收紧成 EmptyRequestInput，这里只补类型断言，不改运行期行为。
    fetchPost("/api/ui/reloadUI", ((response: { status: number }) => {
      if (response.status !== 200) {
        this.showErrorMessage(this.i18n.reloadUIFailed);
      }
    }) as unknown as Record<string, never>);
  }

  // ================================ 事件监听管理 ================================

  addListener(element: HTMLElement, event: string, fn: (event?: Event) => void, options?: AddEventListenerOptions) {
    this.listenerRegistry.add(element, event, fn, options);
  }

  removeListener(element: HTMLElement, event?: string, fn?: (event?: Event) => void, options?: AddEventListenerOptions) {
    this.listenerRegistry.remove(element, event, fn, options);
  }
}
