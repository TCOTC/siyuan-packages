import * as assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";
import { buildBoxFilter, getActivityCacheKey, queryActivity, queryDayDocs, queryEarliestYear } from "./query";

type FetchFn = (
  url: string,
  data: { stmt: string },
) => Promise<{
  code: number;
  msg: string;
  data: unknown;
}>;

function stub(): { fetchSyncPost: FetchFn } {
  return (globalThis as typeof globalThis & { __heatmapSiyuanStub: { fetchSyncPost: FetchFn } }).__heatmapSiyuanStub;
}

describe("queryDayDocs", () => {
  beforeEach(() => {
    stub().fetchSyncPost = async () => ({ code: 0, msg: "", data: [] });
  });

  it("非法日期键直接返回空列表，不发请求", async () => {
    let calls = 0;
    stub().fetchSyncPost = async () => {
      calls += 1;
      return { code: 0, msg: "", data: [] };
    };

    assert.deepEqual(await queryDayDocs(""), { docs: [], truncated: false, totalDocs: 0, totalBlocks: 0 });
    assert.deepEqual(await queryDayDocs("2024-01-01"), { docs: [], truncated: false, totalDocs: 0, totalBlocks: 0 });
    assert.deepEqual(await queryDayDocs("2024010"), { docs: [], truncated: false, totalDocs: 0, totalBlocks: 0 });
    assert.deepEqual(await queryDayDocs("abcdefgh"), { docs: [], truncated: false, totalDocs: 0, totalBlocks: 0 });
    assert.equal(calls, 0);
  });

  it("合法日期键会查询并映射文档列表", async () => {
    let listStmt = "";
    let totalsStmt = "";
    stub().fetchSyncPost = async (_url, data) => {
      if (data.stmt.includes("COALESCE(SUM(count)")) {
        totalsStmt = data.stmt;
        return { code: 0, msg: "", data: [{ docs: 2, blocks: 4 }] };
      }
      listStmt = data.stmt;
      return {
        code: 0,
        msg: "",
        data: [
          { id: "doc-a", count: 3, content: "Alpha", ial: 'icon="1f4c4"' },
          { id: "doc-b", count: 1, content: "", ial: "" },
          { id: "", count: 9, content: "ghost", ial: "" },
        ],
      };
    };

    const result = await queryDayDocs("20240115", "created");
    assert.ok(listStmt.includes("20240115000000"));
    assert.ok(listStmt.includes("20240116000000"));
    assert.ok(listStmt.includes("LIMIT 101"));
    assert.ok(totalsStmt.includes("COALESCE(SUM(count)"));
    assert.deepEqual(result, {
      truncated: false,
      totalDocs: 2,
      totalBlocks: 4,
      docs: [
        { id: "doc-a", title: "Alpha", icon: "1f4c4", count: 3 },
        { id: "doc-b", title: "doc-b", icon: "", count: 1 },
      ],
    });
  });

  it("超过 100 篇时截断并标记 truncated，汇总仍用真实总数", async () => {
    stub().fetchSyncPost = async (_url, data) => {
      if (data.stmt.includes("COALESCE(SUM(count)")) {
        return { code: 0, msg: "", data: [{ docs: 101, blocks: 121 }] };
      }
      return {
        code: 0,
        msg: "",
        data: Array.from({ length: 101 }, (_, i) => ({
          id: `doc-${i}`,
          count: 101 - i,
          content: `Doc ${i}`,
          ial: "",
        })),
      };
    };

    const result = await queryDayDocs("20240115", "created");
    assert.equal(result.truncated, true);
    assert.equal(result.docs.length, 100);
    assert.equal(result.docs[0].id, "doc-0");
    assert.equal(result.docs[99].id, "doc-99");
    assert.equal(result.totalDocs, 101);
    assert.equal(result.totalBlocks, 121);
  });
});

describe("queryEarliestYear", () => {
  it("无数据返回 null", async () => {
    stub().fetchSyncPost = async () => ({ code: 0, msg: "", data: [] });
    assert.equal(await queryEarliestYear("created"), null);
  });

  it("解析年份字符串", async () => {
    stub().fetchSyncPost = async () => ({
      code: 0,
      msg: "",
      data: [{ year: "2021" }],
    });
    assert.equal(await queryEarliestYear("updated"), 2021);
  });

  it("无效年份视为 null", async () => {
    stub().fetchSyncPost = async () => ({
      code: 0,
      msg: "",
      data: [{ year: "0" }],
    });
    assert.equal(await queryEarliestYear("mixed"), null);
  });

  it("接口失败抛错", async () => {
    stub().fetchSyncPost = async () => ({
      code: 1,
      msg: "boom",
      data: null,
    });
    await assert.rejects(() => queryEarliestYear(), /boom/);
  });
});

describe("queryActivity", () => {
  it("映射按日计数，缺省 count / docs 当 0", async () => {
    let calls = 0;
    stub().fetchSyncPost = async (_url, data) => {
      calls += 1;
      if (data.stmt.includes("GROUP BY")) {
        return {
          code: 0,
          msg: "",
          data: [
            { date: "20240101", count: "12", docs: "3" },
            { date: "20240102", count: null, docs: null },
          ],
        };
      }
      return { code: 0, msg: "", data: [{ docs: "5" }] };
    };

    const result = await queryActivity("created", {
      displayMode: "recent",
      fromYear: null,
      weekStart: "monday",
      viewMode: "heatmap",
      includedBoxIds: null,
    });
    assert.deepEqual(result, {
      days: [
        { date: "20240101", count: 12, docs: 3 },
        { date: "20240102", count: 0, docs: 0 },
      ],
      totalDocs: 5,
    });
    assert.equal(calls, 2);
  });

  it("按年模式查询起点落在 fromYear 元旦", async () => {
    let dayStmt = "";
    stub().fetchSyncPost = async (_url, data) => {
      if (data.stmt.includes("GROUP BY") || data.stmt.includes("AS date")) {
        dayStmt = data.stmt;
      }
      return { code: 0, msg: "", data: data.stmt.includes("GROUP BY") || data.stmt.includes("AS date") ? [] : [{ docs: 0 }] };
    };

    await queryActivity("created", {
      displayMode: "years",
      fromYear: 2024,
      weekStart: "monday",
      viewMode: "heatmap",
      includedBoxIds: null,
    });

    assert.ok(dayStmt.includes("20240101000000"));
    assert.ok(dayStmt.includes("COUNT(DISTINCT root_id)"));
    // 结束边界为明天 0 点，不扫到次年元旦
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const endKey = `${tomorrow.getFullYear()}${String(tomorrow.getMonth() + 1).padStart(2, "0")}${String(tomorrow.getDate()).padStart(2, "0")}000000`;
    assert.ok(dayStmt.includes(endKey));
    assert.ok(!dayStmt.includes(`${new Date().getFullYear() + 1}0101000000`));
    const start = new Date(2024, 0, 1);
    const end = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    assert.ok(dayStmt.includes(`LIMIT ${days}`));
  });

  it("getActivityCacheKey：布局切换（展示形式 / 周起始）不改变键", () => {
    const recent = {
      displayMode: "recent" as const,
      fromYear: null as number | null,
      weekStart: "monday" as const,
      viewMode: "heatmap" as const,
      includedBoxIds: null as string[] | null,
    };
    const recentKey = getActivityCacheKey("created", recent);
    assert.equal(recentKey, getActivityCacheKey("created", { ...recent, viewMode: "calendar" }));
    assert.equal(recentKey, getActivityCacheKey("created", { ...recent, weekStart: "sunday" }));
    assert.notEqual(recentKey, getActivityCacheKey("updated", recent));

    const years = {
      displayMode: "years" as const,
      fromYear: 2024,
      weekStart: "monday" as const,
      viewMode: "heatmap" as const,
      includedBoxIds: null as string[] | null,
    };
    const yearsKey = getActivityCacheKey("created", years);
    assert.equal(yearsKey, getActivityCacheKey("created", { ...years, weekStart: "sunday", viewMode: "calendar" }));
    assert.notEqual(yearsKey, getActivityCacheKey("updated", years));
  });

  it("白名单笔记本时 SQL 含 box IN", async () => {
    let dayStmt = "";
    stub().fetchSyncPost = async (_url, data) => {
      if (data.stmt.includes("GROUP BY") || data.stmt.includes("AS date")) {
        dayStmt = data.stmt;
      }
      return { code: 0, msg: "", data: [] };
    };

    await queryActivity("created", {
      displayMode: "recent",
      fromYear: null,
      weekStart: "monday",
      viewMode: "heatmap",
      includedBoxIds: ["box-a", "box-b"],
    });

    assert.ok(dayStmt.includes("box IN ('box-a', 'box-b')"));
  });
});

describe("buildBoxFilter", () => {
  it("null 不限制", () => {
    assert.equal(buildBoxFilter(null), "");
    assert.equal(buildBoxFilter(undefined), "");
  });

  it("空列表禁止命中", () => {
    assert.equal(buildBoxFilter([]), " AND 0");
  });

  it("转义单引号并去重", () => {
    assert.equal(buildBoxFilter(["a'b", "a'b", " c "]), " AND box IN ('a''b', 'c')");
  });
});
