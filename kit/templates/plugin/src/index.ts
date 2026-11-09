import { Plugin, showMessage } from "siyuan";
import "./index.scss";

const STORAGE_NAME = "config.json";

/**
 * 插件入口。思源按清单里的 name 加载产物里的 index.js，
 * 默认导出的类必须是 Plugin 的子类。
 */
export default class SamplePlugin extends Plugin {
  /** 思源按当前界面语言把 src/i18n/<locale>.json 注入到这里。 */
  declare i18n: Record<string, string>;

  /** 插件启用时调用。 */
  override onload(): void {
    void this.loadData(STORAGE_NAME).catch((error: unknown) => {
      this.reportError("load", error);
    });

    console.log(this.displayName, "plugin loaded");
  }

  /** 界面布局就绪，始终在 onload 执行完之后调用。 */
  override onLayoutReady(): void {
    console.log(this.displayName, "plugin layout ready");
  }

  /** this.saveData 写入的数据发生变化时调用，包括跨设备同步与其他前端实例的写入。 */
  override onDataChanged(): void {
    void this.loadData(STORAGE_NAME).catch((error: unknown) => {
      this.reportError("reload", error);
    });
  }

  /** 插件禁用时调用。 */
  override onunload(): void {
    console.log(this.displayName, "plugin unloaded");
  }

  /** 插件从工作空间移除时调用，会先执行完 onunload。 */
  override uninstall(): void {
    void this.removeData(STORAGE_NAME).catch((error: unknown) => {
      this.reportError("remove", error);
    });

    console.log(this.displayName, "plugin uninstalled");
  }

  /** loadData / removeData 拒绝的值不一定是 Error，统一收在这里转成可读文案。 */
  private reportError(action: string, error: unknown): void {
    const message = `${this.displayName}: failed to ${action} data [${STORAGE_NAME}]: ${error instanceof Error ? error.message : String(error)}`;
    showMessage(message);
    console.error(message);
  }
}
