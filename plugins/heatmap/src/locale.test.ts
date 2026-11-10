import * as assert from "node:assert/strict";
import { describe, it } from "vitest";
import en from "./i18n/en.json";
import ja from "./i18n/ja.json";
import zhCN from "./i18n/zh-CN.json";
import zhTW from "./i18n/zh-TW.json";
import { getDefaultWeekStart } from "./locale";

function withLang(lang: string | undefined, run: () => void): void {
  const scope = globalThis as { window?: unknown };
  const prev = scope.window;
  scope.window = { siyuan: { config: lang === undefined ? {} : { lang } } };
  try {
    run();
  } finally {
    if (prev === undefined) {
      delete scope.window;
    } else {
      scope.window = prev;
    }
  }
}

describe("getDefaultWeekStart", () => {
  it("仅简体中文默认周一", () => {
    withLang("zh-CN", () => {
      assert.equal(getDefaultWeekStart(), "monday");
    });
  });

  it("繁体中文、日文、英文默认周日", () => {
    for (const lang of ["zh-TW", "ja", "en", "ar"]) {
      withLang(lang, () => {
        assert.equal(getDefaultWeekStart(), "sunday", lang);
      });
    }
  });

  it("缺失语言配置时默认周日", () => {
    withLang(undefined, () => {
      assert.equal(getDefaultWeekStart(), "sunday");
    });
  });
});

describe("文案数据", () => {
  const locales = { "zh-CN": zhCN, "zh-TW": zhTW, ja, en } as const;

  it("四份译文的键集合完全一致（类型层已在 locale.ts 断言，这里补运行期证据）", () => {
    const expected = Object.keys(en).sort();
    for (const [locale, messages] of Object.entries(locales)) {
      assert.deepEqual(Object.keys(messages).sort(), expected, locale);
    }
  });

  it("每个语种都有 7 个星期名与 12 个月名，渲染层按下标取值不会越界", () => {
    for (const [locale, messages] of Object.entries(locales)) {
      assert.equal(messages.weekdays.length, 7, locale);
      assert.equal(messages.months.length, 12, locale);
      assert.equal(messages.levelsCutLabels.length, 3, locale);
    }
  });

  it("带占位符的文案四种语种都保留了同一批占位符", () => {
    // 占位符写错不会报错，只会把 ${count} 原样显示给用户
    const placeholders = (text: string): string[] => [...text.matchAll(/\$\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();
    const keys = ["totalCount", "cellTooltip", "daySummary", "docBlockCount"] as const;
    for (const key of keys) {
      const expected = placeholders(en[key]);
      for (const [locale, messages] of Object.entries(locales)) {
        assert.deepEqual(placeholders(messages[key]), expected, `${locale}.${key}`);
      }
    }
  });
});
