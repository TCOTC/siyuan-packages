import { Plugin, Setting, getFrontend } from "siyuan";
import "./index.scss";

const STORAGE_NAME = "top-bar-text-config.json";
type TElementType = "topbarRight" | "topbarLeft" | "mobileRight";
const ELEMENT_TYPE: TElementType[] = ["topbarRight", "topbarLeft", "mobileRight"];
const DRAG_HIDDEN_ATTR = "data-top-bar-text-drag-hidden";

// 原始代码片段：https://ld246.com/article/1728048965009
export default class TopBarTextPlugin extends Plugin {
  private isMobile = false;
  private topbarDragElement: HTMLElement | undefined;
  private toolbarElement: HTMLElement | undefined;
  private mobileMenuAnchorElement: HTMLElement | undefined;
  private dragHiddenObserver: MutationObserver | undefined;
  private lastDragHidden: boolean | undefined;
  private topbarElements: Partial<Record<"topbarLeft" | "topbarRight", HTMLElement>> = {};
  private updateTimers: Map<string, number> = new Map();
  private hourlyUpdateTimer: number = 0;

  override async onload() {
    const frontEnd = getFrontend();
    this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";
    await this.loadData(STORAGE_NAME);
    // loadData 在配置文件不存在时返回空字符串，需归一化为对象
    if (typeof this.data[STORAGE_NAME] !== "object" || this.data[STORAGE_NAME] === null) {
      this.data[STORAGE_NAME] = {};
    }
    ELEMENT_TYPE.forEach((type) => {
      this.data[STORAGE_NAME][`${type}Countdown`] ??= {};
    });
    this.data[STORAGE_NAME].topbarRightCountdown.template ??= this.i18n.topbarRightCountdownTemplateDefault;
    this.data[STORAGE_NAME].topbarRightCountdown.text ??= this.i18n.topbarRightCountdownTextDefault;
    this.data[STORAGE_NAME].topbarRightCountdown.targetTime ??= this.i18n.topbarRightCountdownTargetTimeDefault;

    this.setting = new Setting({
      confirmCallback: () => {
        applySetting();
      },
    });

    const createCountdownSettingItem = (type: string, field: string, titleKey: string, placeholderKey: string) => {
      const element = document.createElement("textarea");
      element.id = `${type}${field}`;
      element.className = "b3-text-field fn__block";
      element.placeholder = this.i18n[placeholderKey];
      element.style.resize = "vertical";
      element.value = this.data[STORAGE_NAME][`${type}Countdown`][field] ?? "";

      this.setting.addItem({
        title: this.i18n[titleKey],
        direction: "row",
        createActionElement: () => element,
      });

      return element;
    };

    const createAllCountdownSettings = (type: string) => {
      const fields = [
        { field: "template", titleKey: `${type}CountdownTemplate`, placeholderKey: "placeholderCountdownTemplate" },
        { field: "text", titleKey: `${type}CountdownText`, placeholderKey: "placeholderCountdownText" },
        { field: "targetTime", titleKey: `${type}CountdownTargetTime`, placeholderKey: "placeholderCountdownTargetTime" },
      ];

      return fields.map(({ field, titleKey, placeholderKey }) => createCountdownSettingItem(type, field, titleKey, placeholderKey));
    };

    const [topbarRightCountdownTemplateElement, topbarRightCountdownTextElement, topbarRightCountdownTargetTimeElement] = createAllCountdownSettings("topbarRight");
    const [topbarLeftCountdownTemplateElement, topbarLeftCountdownTextElement, topbarLeftCountdownTargetTimeElement] = createAllCountdownSettings("topbarLeft");
    const [mobileRightCountdownTemplateElement, mobileRightCountdownTextElement, mobileRightCountdownTargetTimeElement] = createAllCountdownSettings("mobileRight");

    const applySetting = async () => {
      const topbarRightCountdown = {
        template: topbarRightCountdownTemplateElement.value,
        text: topbarRightCountdownTextElement.value,
        targetTime: topbarRightCountdownTargetTimeElement.value,
      };
      const topbarLeftCountdown = {
        template: topbarLeftCountdownTemplateElement.value,
        text: topbarLeftCountdownTextElement.value,
        targetTime: topbarLeftCountdownTargetTimeElement.value,
      };
      const mobileRightCountdown = {
        template: mobileRightCountdownTemplateElement.value,
        text: mobileRightCountdownTextElement.value,
        targetTime: mobileRightCountdownTargetTimeElement.value,
      };
      // 需要 await 等待配置更新完成之后再使用 this.data[STORAGE_NAME]，否则会使用旧的配置
      await this.saveData(STORAGE_NAME, {
        topbarRightCountdown,
        topbarLeftCountdown,
        mobileRightCountdown,
      });

      // 检查每个倒计时模板：模板为空时 insertElement 内部会移除对应元素
      ELEMENT_TYPE.forEach((type) => {
        this.insertElement(type);
      });

      ELEMENT_TYPE.forEach((type) => {
        this.startUpdateTimer(type);
      });

      this.startHourlyUpdateTimer();
    };
  }

  override onLayoutReady() {
    if (!this.isMobile) {
      // 使用 #toolbar 限定顶栏，避免匹配到其他 .toolbar 容器
      this.topbarDragElement = document.querySelector("#toolbar > #drag") as HTMLElement;
      if (!this.topbarDragElement) {
        // 独立窗口没有顶栏
        return;
      }
      this.startDragHiddenObserver();
    } else {
      this.mobileMenuAnchorElement = document.querySelector("#menu .b3-menu__items > .b3-menu__group") as HTMLElement;
      if (!this.mobileMenuAnchorElement) {
        console.error(this.displayName, this.i18n.onloadFailed);
        return;
      }
    }

    ELEMENT_TYPE.forEach((type) => {
      this.insertElement(type, true);
    });

    ELEMENT_TYPE.forEach((type) => {
      this.startUpdateTimer(type);
    });

    this.startHourlyUpdateTimer();

    console.log(this.displayName, this.i18n.onload);
  }

  override onunload() {
    this.stopDragHiddenObserver();

    this.removeAllElements();

    this.stopAllUpdateTimers();

    this.stopHourlyUpdateTimer();

    console.log(this.displayName, this.i18n.onunload);
  }

  override async uninstall() {
    this.stopDragHiddenObserver();

    this.removeAllElements();

    this.stopAllUpdateTimers();

    this.stopHourlyUpdateTimer();

    await this.removeData(STORAGE_NAME);

    console.log(this.displayName, this.i18n.uninstall);
  }

  private removeAllElements = () => {
    ELEMENT_TYPE.forEach((type) => {
      if (type === "mobileRight") {
        document.getElementById(`top-bar-text-${type}`)?.remove();
        return;
      }
      if (this.topbarElements[type]) {
        this.removeTopBar(type);
        delete this.topbarElements[type];
      }
    });
  };

  /** 跟随 #drag.fn__hidden，在编辑器全屏时同步隐藏顶栏文本 */
  private syncTopbarDragHidden = () => {
    const hidden = !!this.topbarDragElement?.classList.contains("fn__hidden");
    if (hidden === this.lastDragHidden) {
      return;
    }
    this.lastDragHidden = hidden;
    this.toolbarElement?.toggleAttribute(DRAG_HIDDEN_ATTR, hidden);
  };

  private startDragHiddenObserver = () => {
    this.stopDragHiddenObserver();
    if (!this.topbarDragElement) {
      return;
    }
    this.toolbarElement = this.topbarDragElement.parentElement ?? undefined;
    this.dragHiddenObserver = new MutationObserver(() => {
      this.syncTopbarDragHidden();
    });
    this.dragHiddenObserver.observe(this.topbarDragElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    this.syncTopbarDragHidden();
  };

  private stopDragHiddenObserver = () => {
    this.dragHiddenObserver?.disconnect();
    this.dragHiddenObserver = undefined;
    this.lastDragHidden = undefined;
    this.toolbarElement?.removeAttribute(DRAG_HIDDEN_ATTR);
  };

  private getUpdateInterval = (template: string): number => {
    if (template.includes("${second}")) {
      return 1000;
    } else if (template.includes("${minute}")) {
      return 60 * 1000;
    } else if (template.includes("${hour}") || template.includes("${day}") || template.includes("${month}") || template.includes("${year}")) {
      return 60 * 60 * 1000;
    }
    return 0;
  };

  private startUpdateTimer = (type: (typeof ELEMENT_TYPE)[number]) => {
    this.stopUpdateTimer(type);

    const template = this.data[STORAGE_NAME][`${type}Countdown`]?.template;
    if (!template) return;

    const interval = this.getUpdateInterval(template);
    if (interval <= 0) return;

    const timerId = window.setInterval(() => {
      this.updateCountdownElement(type);
    }, interval);

    this.updateTimers.set(type, timerId);
  };

  private stopUpdateTimer = (type: (typeof ELEMENT_TYPE)[number]) => {
    const timerId = this.updateTimers.get(type);
    if (timerId) {
      window.clearInterval(timerId);
      this.updateTimers.delete(type);
    }
  };

  private stopAllUpdateTimers = () => {
    this.updateTimers.forEach((timerId) => {
      window.clearInterval(timerId);
    });
    this.updateTimers.clear();
  };

  private startHourlyUpdateTimer = () => {
    this.stopHourlyUpdateTimer();

    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 30, 0);
    const delayToNextUpdate = nextHour.getTime() - now.getTime();

    this.hourlyUpdateTimer = window.setInterval(() => {
      ELEMENT_TYPE.forEach((type) => {
        this.updateCountdownElement(type);
      });

      // setInterval 不能重算延时，每次触发后重新挂一次
      this.stopHourlyUpdateTimer();
      this.startHourlyUpdateTimer();
    }, delayToNextUpdate);
  };

  private stopHourlyUpdateTimer = () => {
    if (this.hourlyUpdateTimer) {
      window.clearInterval(this.hourlyUpdateTimer);
      this.hourlyUpdateTimer = 0;
    }
  };

  private calculateDaysLeft = (template: string, type: string) => {
    const targetDateTimestamp = new Date(this.data[STORAGE_NAME][`${type}Countdown`].targetTime).getTime();
    if (isNaN(targetDateTimestamp)) return template; // targetTime 可能不存在，也可能格式不正确

    let timeDifference = targetDateTimestamp - new Date().getTime();
    const hasYear = template.includes("${year}");
    const hasMonth = template.includes("${month}");
    const hasDay = template.includes("${day}");
    const hasHour = template.includes("${hour}");
    const hasMinute = template.includes("${minute}");
    const hasSecond = template.includes("${second}");

    let countdownHTML = template;
    const currentDate = new Date();

    if (hasYear) {
      const targetDate = new Date(targetDateTimestamp);
      let yearDiff = targetDate.getFullYear() - currentDate.getFullYear();

      if (yearDiff > 0 && (targetDate.getMonth() < currentDate.getMonth() || (targetDate.getMonth() === currentDate.getMonth() && targetDate.getDate() < currentDate.getDate()))) {
        yearDiff--;
      }

      if (yearDiff < 0) {
        yearDiff = 0;
      }

      if (yearDiff > 0) {
        const tempDate = new Date(currentDate);
        tempDate.setFullYear(tempDate.getFullYear() + yearDiff);
        timeDifference = targetDateTimestamp - tempDate.getTime();
      }

      countdownHTML = countdownHTML.replaceAll("${year}", yearDiff.toString());
    }
    if (hasMonth) {
      let monthDiff = 0;
      const targetDateTimestamp2 = new Date(currentDate.getTime() + timeDifference).getTime();

      if (timeDifference > 0) {
        let tempDate = new Date(currentDate);

        while (tempDate.getTime() < targetDateTimestamp2) {
          tempDate.setMonth(tempDate.getMonth() + 1);
          monthDiff++;
        }

        if (tempDate.getTime() > targetDateTimestamp2) {
          monthDiff--;
        }
      }

      if (monthDiff > 0) {
        const tempDate = new Date();
        tempDate.setMonth(tempDate.getMonth() + monthDiff);
        timeDifference = new Date(currentDate.getTime() + timeDifference).getTime() - tempDate.getTime();
      }

      countdownHTML = countdownHTML.replaceAll("${month}", monthDiff.toString());
    }
    if (hasDay) {
      const day = Math.floor(timeDifference / (1000 * 3600 * 24));
      timeDifference = timeDifference % (1000 * 3600 * 24);
      countdownHTML = countdownHTML.replaceAll("${day}", day.toString());
    }
    if (hasHour) {
      const hour = Math.floor(timeDifference / (1000 * 3600));
      timeDifference = timeDifference % (1000 * 3600);
      countdownHTML = countdownHTML.replaceAll("${hour}", hour.toString());
    }
    if (hasMinute) {
      const minute = Math.floor(timeDifference / (1000 * 60));
      timeDifference = timeDifference % (1000 * 60);
      countdownHTML = countdownHTML.replaceAll("${minute}", minute.toString());
    }
    if (hasSecond) {
      const second = Math.floor(timeDifference / 1000);
      countdownHTML = countdownHTML.replaceAll("${second}", second.toString());
    }
    return countdownHTML;
  };

  private insertElement = (type: (typeof ELEMENT_TYPE)[number], isFirstInsert: boolean = false) => {
    const countdownConfig = this.data[STORAGE_NAME][`${type}Countdown`];
    let countdownHTML = "";
    if (countdownConfig?.template) {
      countdownHTML = this.calculateDaysLeft(countdownConfig.template, type);
      countdownHTML = countdownHTML.replaceAll("${text}", countdownConfig.text ?? "${text}");
    }

    if (this.isMobile) {
      if (type !== "mobileRight" || !this.mobileMenuAnchorElement) {
        return;
      }
      const countdownElement = document.getElementById(`top-bar-text-${type}`);
      if (!countdownHTML) {
        countdownElement?.remove();
        return;
      }
      if (countdownElement) {
        const labelElement = countdownElement.querySelector(".b3-menu__label");
        if (labelElement) {
          labelElement.innerHTML = countdownHTML;
        }
      } else {
        const element = document.createElement("div");
        element.id = `top-bar-text-${type}`;
        element.className = "b3-menu__group";
        element.innerHTML = `<div class="b3-menu__group-items">
    <div class="b3-menu__item b3-menu__item--readonly">
        <span class="b3-menu__label">${countdownHTML}</span>
    </div>
</div>`;
        this.mobileMenuAnchorElement.insertAdjacentElement("beforebegin", element);
      }
      return;
    }

    if (type === "mobileRight") {
      return;
    }
    // 桌面端顶栏元素通过插件 API 注册，位置与显隐交给思源管理
    const topbarElement = this.topbarElements[type];
    if (!countdownHTML) {
      if (topbarElement) {
        this.removeTopBar(type);
        delete this.topbarElements[type];
      }
      return;
    }
    if (topbarElement) {
      topbarElement.innerHTML = countdownHTML;
      return;
    }
    const topbarDragElement = this.topbarDragElement;
    if (!topbarDragElement) {
      return;
    }
    const element = document.createElement("div");
    element.className = "top-bar-text";
    element.innerHTML = countdownHTML;
    element.style.fontSize = getComputedStyle(topbarDragElement).fontSize;
    const registeredElement = this.addTopBar({
      id: type,
      title: this.i18n[type === "topbarRight" ? "topbarRightTitle" : "topbarLeftTitle"],
      element,
      position: type === "topbarRight" ? "right" : "left",
    });
    if (!registeredElement) {
      return;
    }
    this.topbarElements[type] = registeredElement;
    if (isFirstInsert) {
      setTimeout(() => {
        // 可能有的主题会修改 #drag 元素的字号，所以这里重新获取一次
        registeredElement.style.fontSize = getComputedStyle(topbarDragElement).fontSize;
      }, 700);
    }
  };

  private updateCountdownElement = (type: (typeof ELEMENT_TYPE)[number]) => {
    this.insertElement(type);
  };
}
