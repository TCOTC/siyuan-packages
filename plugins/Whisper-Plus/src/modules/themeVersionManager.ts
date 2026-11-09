import type { Plugin } from "siyuan";
import { confirm, getFrontend, showMessage } from "siyuan";
import { post } from "../api";
import { logging } from "../logger";
import { compareVersions } from "../utils";
import { WHISPER_THEME_NAME } from "./themeSwitch";

/** 本插件要求的浅吟主题版本范围（左闭右开，含左端不含右端） */
const MIN_THEME_VERSION = "3.0.0";
const MAX_THEME_VERSION = "3.1.0";
const THEME_VERSION_RANGE = `${MIN_THEME_VERSION}~${MAX_THEME_VERSION}`;

/** 集市包结构（/api/bazaar/getBazaarTheme、getInstalledTheme、getBazaarPlugin 返回） */
type BazaarPackage = {
  name: string;
  version: string;
  outdated?: boolean;
};

function format(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

function isVersionInRange(version: string): boolean {
  return compareVersions(version, MIN_THEME_VERSION) >= 0 && compareVersions(version, MAX_THEME_VERSION) < 0;
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

    if (isVersionInRange(installedVersion)) {
      return true;
    }

    const latest = await this.getBazaarTheme();
    if (latest === null) {
      showMessage(this.text("theme_version_bazaar_unavailable"), 7000, "error");
      return false;
    }

    if (isVersionInRange(latest.version)) {
      return await this.confirmAndUpgrade(installedVersion, latest.version);
    }

    if (await this.isPluginOutdated()) {
      confirm(
        this.text("theme_version_upgrade_title"),
        format(this.text("theme_version_update_plugin_first"), {
          target: latest.version,
          range: THEME_VERSION_RANGE,
        }),
      );
      return false;
    }

    // 插件已是最新但仍无法满足：提示联系主题作者
    confirm(
      this.text("theme_version_upgrade_title"),
      format(this.text("theme_version_latest_incompatible"), {
        target: latest.version,
        range: THEME_VERSION_RANGE,
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
          range: THEME_VERSION_RANGE,
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
