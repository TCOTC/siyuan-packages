import type { Plugin } from "siyuan";
import { confirm, getFrontend, showMessage } from "siyuan";
import { post } from "../api";
import { logging } from "../logger";
import { isVersionInRange, type VersionRange } from "siyuan-version-compare";
import { WHISPER_THEME_NAME } from "./theme-switch";

/**
 * 本插件要求的浅吟主题版本区间（左闭右开）
 *
 * 区间比较走 `isVersionInRange`，它按**核心数字**归类预发布：
 * - `3.0.0-beta.1` 归入 3.0.0 → 在区间内（作者声明支持 3.0.x，预发布同属这一代）；
 * - `3.1.0-beta.1` 归入 3.1.0 → 在区间外（`max` 的含义是「3.1 这一代还没验证过」，
 *   未验证版本的预发布不该放行）。
 *
 * 所以边界常量写成纯 `主.次.修订`，别带预发布后缀：带也能算对，但会让读代码的人
 * 以为预发布有特殊待遇。
 */
const THEME_VERSION: VersionRange = { min: "3.0.0", max: "3.1.0" };
/** 展示给用户的区间文案，与 `THEME_VERSION` 保持同一来源 */
const THEME_VERSION_TEXT = `${THEME_VERSION.min}~${THEME_VERSION.max}`;

/** 集市包结构（/api/bazaar/getBazaarTheme、getInstalledTheme、getBazaarPlugin 返回） */
type BazaarPackage = {
  name: string;
  version: string;
  outdated?: boolean;
};

function format(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

/** 启用主题前校验版本，不满足时尝试自动升级。 */
export class ThemeVersionManager {
  constructor(private readonly plugin: Plugin) {}

  /** 主题可正常启用返回 true。 */
  async ensureReady(): Promise<boolean> {
    const installedVersion = await this.getInstalledVersion();
    if (installedVersion === null) {
      logging.error(`Failed to read installed version of theme [${WHISPER_THEME_NAME}]`);
      showMessage(this.text("theme_version_check_failed"), 7000, "error");
      return false;
    }

    if (isVersionInRange(installedVersion, THEME_VERSION)) {
      return true;
    }

    const latest = await this.getBazaarTheme();
    if (latest === null) {
      showMessage(this.text("theme_version_bazaar_unavailable"), 7000, "error");
      return false;
    }

    if (isVersionInRange(latest.version, THEME_VERSION)) {
      return await this.confirmAndUpgrade(installedVersion, latest.version);
    }

    if (await this.isPluginOutdated()) {
      confirm(
        this.text("theme_version_upgrade_title"),
        format(this.text("theme_version_update_plugin_first"), {
          target: latest.version,
          range: THEME_VERSION_TEXT,
        }),
      );
      return false;
    }

    // 插件已是最新但仍无法满足：提示联系主题作者
    confirm(
      this.text("theme_version_upgrade_title"),
      format(this.text("theme_version_latest_incompatible"), {
        target: latest.version,
        range: THEME_VERSION_TEXT,
      }),
    );
    return false;
  }

  private async getInstalledVersion(): Promise<string | null> {
    const result = await post<{ packages?: BazaarPackage[] }>("/api/bazaar/getInstalledTheme", {});
    if (result.code !== 0) {
      logging.error(`Failed to get installed themes: ${result.msg}`);
      return null;
    }
    return result.data?.packages?.find((pkg) => pkg.name === WHISPER_THEME_NAME)?.version ?? null;
  }

  private async getBazaarTheme(): Promise<BazaarPackage | null> {
    const result = await post<{ packages?: BazaarPackage[] }>("/api/bazaar/getBazaarTheme", {
      frontend: getFrontend(),
    });
    if (result.code !== 0) {
      logging.error(`Failed to get bazaar themes: ${result.msg}`);
      return null;
    }
    return result.data?.packages?.find((pkg) => pkg.name === WHISPER_THEME_NAME) ?? null;
  }

  private async confirmAndUpgrade(current: string, target: string): Promise<boolean> {
    const confirmed = await new Promise<boolean>((resolve) => {
      confirm(
        this.text("theme_version_upgrade_title"),
        format(this.text("theme_version_upgrade_message"), {
          current,
          target,
          range: THEME_VERSION_TEXT,
        }),
        () => resolve(true),
        () => resolve(false),
      );
    });
    if (!confirmed) {
      return false;
    }

    const result = await post("/api/bazaar/updateBazaarPackage", {
      packageType: "themes",
      packageName: WHISPER_THEME_NAME,
      frontend: getFrontend(),
    });
    if (result.code !== 0) {
      logging.error(`Failed to update theme [${WHISPER_THEME_NAME}]: ${result.msg}`);
      showMessage(this.text("theme_version_upgrade_failed"), 7000, "error");
      return false;
    }
    showMessage(format(this.text("theme_version_upgraded"), { target }));
    return true;
  }

  private async isPluginOutdated(): Promise<boolean> {
    const result = await post<{ packages?: BazaarPackage[] }>("/api/bazaar/getBazaarPlugin", {
      frontend: getFrontend(),
    });
    if (result.code !== 0) {
      logging.error(`Failed to get bazaar plugins: ${result.msg}`);
      return false;
    }
    return !!result.data?.packages?.find((pkg) => pkg.name === this.plugin.name)?.outdated;
  }

  private text(key: string): string {
    return (this.plugin.i18n[key] as string | undefined) ?? key;
  }
}
