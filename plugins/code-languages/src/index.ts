import { Constants, Plugin, Setting, type IProtyle } from "siyuan";
import "./index.scss";

const CONFIG_FILE = "code-languages-config.json";
const STATISTICS_FILE = "code-languages-statistics.json";
const MAX_DATE_RECORDS = 90;

interface Config {
  sortMode: "custom" | "frequency";
  /** 逗号分隔 */
  customOrderLanguages: string;
  /** 频率排序时置顶显示的语言数量 (1-15) */
  frequencyTopCount: number;
  /** 频率统计范围天数 (1-90) */
  frequencyDaysRange: number;
  /** 逗号分隔 */
  otherCustomLanguages: string;
  /** 逗号分隔 */
  excludedLanguages: string;
}

interface LanguageStats {
  totalCount: number;
  dates: {
    [date: string]: number;
  };
}

interface Statistics {
  frequencyOrder: string[];
  languages: {
    [language: string]: LanguageStats;
  };
}

export default class CodeLanguagesPlugin extends Plugin {
  // 三个字段都在 onload 里赋值（读盘 + 默认值），onload 之前不会被访问。
  private config!: Config;
  /** 设置面板里尚未确认的副本。 */
  private tempConfig!: Config;
  private statistics!: Statistics;

  private cachedCustomOrderLanguages: string[] = [];
  private cachedOtherCustomLanguages: string[] = [];
  private cachedExcludedLanguages: string[] = [];

  override async onload() {
    await this.loadData(CONFIG_FILE);
    await this.loadData(STATISTICS_FILE);
    this.config = this.data[CONFIG_FILE] ||= {} as Config;
    this.statistics = this.data[STATISTICS_FILE] || {
      frequencyOrder: [],
      languages: {},
    };

    this.config.sortMode ||= "frequency";
    this.config.customOrderLanguages ||= "";
    this.config.frequencyTopCount ||= 5;
    this.config.frequencyDaysRange ||= 30;
    this.config.otherCustomLanguages ||= "";
    this.config.excludedLanguages ||= "";

    this.tempConfig = { ...this.config };

    this.parseAndCacheLanguages();

    this.setting = new Setting({
      confirmCallback: () => {
        this.config = { ...this.tempConfig };
        this.saveData(CONFIG_FILE, this.config);

        this.parseAndCacheLanguages();
      },
      destroyCallback: () => {
        this.tempConfig = { ...this.config };
      },
    });

    this.buildSettingsUI();

    this.eventBus.on("code-language-update", this.languageUpdate);
    this.eventBus.on("code-language-change", this.languageChange);

    console.log(this.displayName, this.i18n.onload);
  }

  override onunload() {
    this.eventBus.off("code-language-update", this.languageUpdate);
    this.eventBus.off("code-language-change", this.languageChange);

    console.log(this.displayName, this.i18n.onunload);
  }

  override async uninstall() {
    this.eventBus.off("code-language-update", this.languageUpdate);
    this.eventBus.off("code-language-change", this.languageChange);

    await this.removeData(CONFIG_FILE);
    await this.removeData(STATISTICS_FILE);

    console.log(this.displayName, this.i18n.uninstall);
  }

  /**
   * 语言名净化：先按分隔符归一，再去掉会破坏 HTML 的 `&` / `<`
   *
   * 不换成 `siyuan-html-safety` 的 `escapeHtml`：这里的结果是语言标识，会回填给宿主的工具栏
   * 做筛选与匹配（不是直接拼 HTML），多转义引号会改变标识本身
   */
  private escapeHtml = (html: string) => {
    if (!html) {
      return html;
    }
    return html.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  };

  private parseLanguagesInput(input: string): string[] {
    if (!input || typeof input !== "string") {
      return [];
    }

    // 上限 300 条
    const parts = input.split(",").slice(0, 300);

    return parts
      .map((part) => {
        let trimmed = part.trim();

        trimmed = trimmed.replace(/[` ]/g, "_");

        trimmed = this.escapeHtml(trimmed);

        return trimmed;
      })
      .filter((lang) => lang.length > 0);
  }

  private parseAndCacheLanguages(): void {
    this.cachedCustomOrderLanguages = this.parseLanguagesInput(this.config.customOrderLanguages);
    this.cachedOtherCustomLanguages = this.parseLanguagesInput(this.config.otherCustomLanguages);
    this.cachedExcludedLanguages = this.parseLanguagesInput(this.config.excludedLanguages);
  }

  private languageUpdate = (event: CustomEvent<{ languages: string[]; value: string }>) => {
    const { languages, value } = event.detail;

    const customOrderLanguages = this.cachedCustomOrderLanguages;
    const otherCustomLanguages = this.cachedOtherCustomLanguages;
    const excludedLanguages = this.cachedExcludedLanguages;

    if (value) {
      const lowerCaseValue = value.toLowerCase();
      let matchLanguages =
        this.config.sortMode === "custom"
          ? [...customOrderLanguages, ...otherCustomLanguages.filter((lang) => !customOrderLanguages.includes(lang)), ...languages.filter((lang) => !customOrderLanguages.includes(lang) && !otherCustomLanguages.includes(lang) && !excludedLanguages.includes(lang))]
          : [...otherCustomLanguages, ...languages.filter((lang) => !otherCustomLanguages.includes(lang) && !excludedLanguages.includes(lang))];
      // 与思源工具栏的筛选算法保持一致 https://github.com/siyuan-note/siyuan/blob/a0593724a20ec42dc2b101b08d5ffa6492148d05/app/src/protyle/toolbar/index.ts#L1302-L1317
      matchLanguages = matchLanguages
        .filter((item) => item.toLowerCase().includes(lowerCaseValue))
        .sort((a, b) => {
          const aStartsWith = a.toLowerCase().startsWith(lowerCaseValue);
          const bStartsWith = b.toLowerCase().startsWith(lowerCaseValue);

          if (aStartsWith && bStartsWith) return a.length - b.length;
          if (aStartsWith) return -1;
          if (bStartsWith) return 1;

          return 0;
        });
      event.detail.languages = matchLanguages;
      return;
    }

    let sortedLanguages: string[] = [];

    if (this.config.sortMode === "custom") {
      sortedLanguages = [...customOrderLanguages, ...[...otherCustomLanguages.filter((lang) => !customOrderLanguages.includes(lang)), ...languages.filter((lang) => !customOrderLanguages.includes(lang) && !otherCustomLanguages.includes(lang) && !excludedLanguages.includes(lang))].sort()];
    } else {
      const topFrequencyLanguages = this.statistics.frequencyOrder.slice(0, this.config.frequencyTopCount);
      sortedLanguages = [...topFrequencyLanguages, ...[...otherCustomLanguages.filter((lang) => !topFrequencyLanguages.includes(lang)), ...languages.filter((lang) => !topFrequencyLanguages.includes(lang) && !otherCustomLanguages.includes(lang) && !excludedLanguages.includes(lang))].sort()];
    }

    event.detail.languages = sortedLanguages;
  };

  private languageChange = (event: CustomEvent<{ language: string; languageElements: HTMLElement[]; protyle: IProtyle }>) => {
    const { language } = event.detail;

    if (language && language.trim()) {
      const currentDate = this.getCurrentDateString();

      if (!this.statistics.languages[language]) {
        this.statistics.languages[language] = {
          totalCount: 0,
          dates: {},
        };
      }

      const languageStats = this.statistics.languages[language];

      const oldCount = languageStats.dates[currentDate] || 0;
      languageStats.dates[currentDate] = oldCount + 1;
      languageStats.totalCount += 1;

      // 超出上限时剔除最早的日期
      const dates = languageStats.dates;
      const dateKeys = Object.keys(dates);

      if (dateKeys.length > MAX_DATE_RECORDS) {
        const sortedDates = dateKeys.sort();
        const datesToRemove = sortedDates.slice(0, dateKeys.length - MAX_DATE_RECORDS);

        for (const dateToRemove of datesToRemove) {
          languageStats.totalCount -= dates[dateToRemove];
          delete dates[dateToRemove];
        }
      }

      this.updateFrequencyOrder(language);

      void this.saveData(STATISTICS_FILE, this.statistics);
    }
  };

  private getCurrentDateString(): string {
    const now = new Date();
    return now.toISOString().split("T")[0];
  }

  /** 只调整变更语言的相邻位置，避免每次全量排序。 */
  private updateFrequencyOrder(changedLanguage?: string): void {
    if (changedLanguage && !this.statistics.frequencyOrder.includes(changedLanguage)) {
      this.statistics.frequencyOrder.push(changedLanguage);
    }

    if (!changedLanguage) {
      this.statistics.frequencyOrder = Object.keys(this.statistics.languages).sort((a, b) => this.statistics.languages[b].totalCount - this.statistics.languages[a].totalCount);
      return;
    }

    const frequencyOrder = this.statistics.frequencyOrder;
    const changedIndex = frequencyOrder.indexOf(changedLanguage);

    if (changedIndex === -1) return;

    const changedCount = this.statistics.languages[changedLanguage].totalCount;

    // 使用次数只增不减，因此只需向前冒泡。
    for (let i = changedIndex; i > 0; i--) {
      const prevLanguage = frequencyOrder[i - 1];
      const prevCount = this.statistics.languages[prevLanguage].totalCount;

      if (changedCount > prevCount) {
        [frequencyOrder[i], frequencyOrder[i - 1]] = [frequencyOrder[i - 1], frequencyOrder[i]];
      } else {
        break;
      }
    }
  }

  private getBuiltinLanguages(): string[] {
    const hljsLanguages = (window as any).hljs?.listLanguages() ?? [];

    const siyuanAliasLanguages = Constants.ALIAS_CODE_LANGUAGES ?? [];

    return [...siyuanAliasLanguages, ...hljsLanguages].sort();
  }

  override openSetting() {
    this.setting.open(this.displayName || this.name);
    const contentElement = this.setting.dialog?.element?.querySelector(".b3-dialog__content");
    if (contentElement instanceof HTMLElement) {
      contentElement.style.scrollbarGutter = "stable";
    }
    this.updateSettingsVisibility();
  }

  private customOrderContainer?: HTMLElement;
  private frequencyTopCountContainer?: HTMLElement;
  private frequencyDaysRangeContainer?: HTMLElement;

  private buildSettingsUI(): void {
    this.setting.addItem({
      title: this.i18n.sortMode,
      createActionElement: () => {
        const selectElement = document.createElement("select");
        selectElement.className = "b3-select";

        const customOption = document.createElement("option");
        customOption.value = "custom";
        customOption.textContent = this.i18n.customOrder;

        const frequencyOption = document.createElement("option");
        frequencyOption.value = "frequency";
        frequencyOption.textContent = this.i18n.frequencySort;

        selectElement.appendChild(customOption);
        selectElement.appendChild(frequencyOption);
        selectElement.value = this.tempConfig.sortMode;

        selectElement.addEventListener("change", (e) => {
          this.tempConfig.sortMode = (e.target as HTMLSelectElement).value as "custom" | "frequency";
          this.updateSettingsVisibility();
        });

        return selectElement;
      },
    });

    this.setting.addItem({
      title: this.i18n.customOrderLanguages,
      description: this.i18n.customOrderTip,
      direction: "row",
      createActionElement: () => {
        const container = document.createElement("div");

        const textareaElement = document.createElement("textarea");
        textareaElement.className = "b3-text-field fn__block";
        textareaElement.spellcheck = false;
        textareaElement.rows = 4;
        textareaElement.placeholder = this.i18n.fillList;
        textareaElement.style.resize = "vertical";
        textareaElement.value = this.tempConfig.customOrderLanguages;

        const hrButton = document.createElement("div");
        hrButton.className = "fn__hr";

        const fillButton = document.createElement("button");
        fillButton.className = "b3-button b3-button--outline fn__size200 fn__flex-center";
        fillButton.style.display = "flex";
        fillButton.style.marginLeft = "auto";
        fillButton.textContent = this.i18n.fillAllBuiltinLanguages;
        fillButton.addEventListener("click", () => {
          const builtinLanguages = this.getBuiltinLanguages().join(", ");
          textareaElement.value = builtinLanguages;
          this.tempConfig.customOrderLanguages = builtinLanguages;
          textareaElement.focus();
        });

        textareaElement.addEventListener("input", (e) => {
          this.tempConfig.customOrderLanguages = (e.target as HTMLInputElement).value;
        });

        container.appendChild(textareaElement);
        container.appendChild(hrButton);
        container.appendChild(fillButton);

        this.customOrderContainer = container;
        return container;
      },
    });

    this.setting.addItem({
      title: this.i18n.frequencyTopCount,
      description: this.i18n.frequencyTopCountTip,
      createActionElement: () => {
        const inputElement = document.createElement("input");
        inputElement.className = "b3-text-field";
        inputElement.type = "number";
        inputElement.min = "1";
        inputElement.max = "15";
        inputElement.value = this.tempConfig.frequencyTopCount.toString();

        inputElement.addEventListener("input", (e) => {
          const value = parseInt((e.target as HTMLInputElement).value);
          if (value >= 1 && value <= 15) {
            this.tempConfig.frequencyTopCount = value;
          }
        });

        this.frequencyTopCountContainer = inputElement;
        return inputElement;
      },
    });

    this.setting.addItem({
      title: this.i18n.frequencyDaysRange,
      description: this.i18n.frequencyDaysRangeTip,
      createActionElement: () => {
        const inputElement = document.createElement("input");
        inputElement.className = "b3-text-field";
        inputElement.type = "number";
        inputElement.min = "1";
        inputElement.max = `${MAX_DATE_RECORDS}`;
        inputElement.value = this.tempConfig.frequencyDaysRange.toString();

        inputElement.addEventListener("input", (e) => {
          const value = parseInt((e.target as HTMLInputElement).value);
          if (value >= 1 && value <= MAX_DATE_RECORDS) {
            this.tempConfig.frequencyDaysRange = value;
          }
        });

        this.frequencyDaysRangeContainer = inputElement;
        return inputElement;
      },
    });

    this.setting.addItem({
      title: this.i18n.otherCustomLanguages,
      description: this.i18n.otherCustomLanguagesTip,
      createActionElement: () => {
        const textareaElement = document.createElement("textarea");
        textareaElement.className = "b3-text-field fn__block";
        textareaElement.spellcheck = false;
        textareaElement.rows = 4;
        textareaElement.placeholder = this.i18n.fillList;
        textareaElement.style.resize = "vertical";
        textareaElement.value = this.tempConfig.otherCustomLanguages;

        textareaElement.addEventListener("input", (e) => {
          this.tempConfig.otherCustomLanguages = (e.target as HTMLInputElement).value;
        });

        return textareaElement;
      },
    });

    this.setting.addItem({
      title: this.i18n.excludedLanguages,
      description: this.i18n.excludedLanguagesTip,
      direction: "row",
      createActionElement: () => {
        const container = document.createElement("div");

        const textareaElement = document.createElement("textarea");
        textareaElement.className = "b3-text-field fn__block";
        textareaElement.spellcheck = false;
        textareaElement.rows = 4;
        textareaElement.placeholder = this.i18n.fillList;
        textareaElement.style.resize = "vertical";
        textareaElement.value = this.tempConfig.excludedLanguages;

        const hrButton = document.createElement("div");
        hrButton.className = "fn__hr";

        const fillButton = document.createElement("button");
        fillButton.className = "b3-button b3-button--outline fn__size200 fn__flex-center";
        fillButton.style.display = "flex";
        fillButton.style.marginLeft = "auto";
        fillButton.textContent = this.i18n.fillAllBuiltinLanguages;
        fillButton.addEventListener("click", () => {
          const builtinLanguages = this.getBuiltinLanguages().join(", ");
          textareaElement.value = builtinLanguages;
          this.tempConfig.excludedLanguages = builtinLanguages;
          textareaElement.focus();
        });

        textareaElement.addEventListener("input", (e) => {
          this.tempConfig.excludedLanguages = (e.target as HTMLInputElement).value;
        });

        container.appendChild(textareaElement);
        container.appendChild(hrButton);
        container.appendChild(fillButton);

        return container;
      },
    });
  }

  private updateSettingsVisibility(): void {
    const isCustomMode = this.tempConfig.sortMode === "custom";

    const customOrderContainerLabel = this.customOrderContainer?.closest(".b3-label") as HTMLElement;
    if (customOrderContainerLabel) {
      customOrderContainerLabel.style.display = isCustomMode ? "" : "none";
    }

    const frequencyTopCountContainerLabel = this.frequencyTopCountContainer?.closest(".b3-label") as HTMLElement;
    if (frequencyTopCountContainerLabel) {
      frequencyTopCountContainerLabel.style.display = isCustomMode ? "none" : "";
    }

    const frequencyDaysRangeContainerLabel = this.frequencyDaysRangeContainer?.closest(".b3-label") as HTMLElement;
    if (frequencyDaysRangeContainerLabel) {
      frequencyDaysRangeContainerLabel.style.display = isCustomMode ? "none" : "";
    }
  }
}
