import * as assert from "node:assert/strict";
import { describe, it } from "vitest";
import { getDefaultWeekStart, getI18n, getSiYuanLang } from "./i18n";

function withLang(lang: string | undefined, run: () => void): void {
  const g = globalThis as any;
  const prev = g.window;
  g.window = { siyuan: { config: lang === undefined ? {} : { lang } } };
  try {
    run();
  } finally {
    if (prev === undefined) {
      delete g.window;
    } else {
      g.window = prev;
    }
  }
}

describe("getSiYuanLang", () => {
  it("返回思源配置中的语言代码", () => {
    withLang("zh-CN", () => assert.equal(getSiYuanLang(), "zh-CN"));
    withLang("zh-TW", () => assert.equal(getSiYuanLang(), "zh-TW"));
    withLang("ja", () => assert.equal(getSiYuanLang(), "ja"));
    withLang("en", () => assert.equal(getSiYuanLang(), "en"));
  });

  it("缺失配置时回退 en", () => {
    withLang(undefined, () => assert.equal(getSiYuanLang(), "en"));
  });
});

describe("getI18n", () => {
  it("简体中文返回简体文案", () => {
    withLang("zh-CN", () => {
      const i18n = getI18n();
      assert.equal(i18n.openHeatMap, "文档活跃统计");
      assert.equal(i18n.openHeatMapCommand, "打开文档活跃统计弹窗");
      assert.equal(i18n.weekdays.length, 7);
      assert.equal(i18n.months.length, 12);
      assert.equal(i18n.weekdays[0], "日");
      assert.ok(i18n.totalCount.includes("${count}"));
      assert.ok(i18n.totalCount.includes("${docs}"));
      assert.ok(i18n.cellTooltip.includes("${docs}"));
    });
  });

  it("繁体中文返回繁体文案", () => {
    withLang("zh-TW", () => {
      const i18n = getI18n();
      assert.equal(i18n.openHeatMap, "文檔活躍統計");
      assert.equal(i18n.settings, "設定");
      assert.equal(i18n.weekStartMonday, "週一");
    });
  });

  it("日文返回日文文案", () => {
    withLang("ja", () => {
      const i18n = getI18n();
      assert.equal(i18n.openHeatMap, "ドキュメント活動統計");
      assert.equal(i18n.weekdays[1], "月");
      assert.equal(i18n.cancel, "キャンセル");
    });
  });

  it("非覆盖语种回退英文", () => {
    withLang("en", () => {
      const i18n = getI18n();
      assert.equal(i18n.openHeatMap, "Document Activity Stats");
      assert.equal(i18n.weekdays[0], "Sun");
      assert.equal(i18n.months[0], "Jan");
    });
  });

  it("缺失语言配置时回退英文", () => {
    withLang(undefined, () => {
      assert.equal(getI18n().loading, "Loading…");
    });
  });
});

describe("getDefaultWeekStart", () => {
  it("仅简体中文默认周一", () => {
    withLang("zh-CN", () => {
      assert.equal(getDefaultWeekStart(), "monday");
    });
  });

  it("繁体中文默认周日", () => {
    withLang("zh-TW", () => {
      assert.equal(getDefaultWeekStart(), "sunday");
    });
  });

  it("日文默认周日", () => {
    withLang("ja", () => {
      assert.equal(getDefaultWeekStart(), "sunday");
    });
  });

  it("英文默认周日", () => {
    withLang("en", () => {
      assert.equal(getDefaultWeekStart(), "sunday");
    });
  });

  it("缺失语言配置时默认周日", () => {
    withLang(undefined, () => {
      assert.equal(getDefaultWeekStart(), "sunday");
    });
  });
});
