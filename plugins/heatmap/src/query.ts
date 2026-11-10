import { fetchSyncPost } from "siyuan";
import { alignToWeekStart, formatDateKey } from "./date";
import { getDefaultWeekStart } from "./locale";
import type { DayCount, DayDoc, DayDocsResult, HeatMapConfigOptions, StatMode } from "./types";

/** 容器块：文档 / 列表 / 列表项 / 引述 / 超级块 / 标注 */
const CONTAINER_TYPES = "('d', 'l', 'i', 'b', 's', 'callout')";

/** 单日文档列表展示上限 */
export const DAY_DOCS_LIMIT = 100;
/** 多查 1 条用于判断是否截断；显式 LIMIT 避免被思源默认搜索 Limit（常为 64）截断 */
const DAY_DOCS_SQL_LIMIT = DAY_DOCS_LIMIT + 1;

type BoxScope = Pick<HeatMapConfigOptions, "includedBoxIds">;

/** 查询笔记中最早有叶子块活动的年份（过滤条件与热力统计一致） */
export async function queryEarliestYear(mode: StatMode = "created", scope: BoxScope = { includedBoxIds: null }, signal?: AbortSignal): Promise<number | null> {
  const leafFilter = `type NOT IN ${CONTAINER_TYPES}`;
  const boxFilter = buildBoxFilter(scope.includedBoxIds);
  let sql: string;
  if (mode === "updated") {
    sql = `SELECT SUBSTR(MIN(updated), 1, 4) AS year
FROM blocks
WHERE ${leafFilter}${boxFilter} AND updated != ''
LIMIT 1`;
  } else if (mode === "mixed") {
    sql = `SELECT SUBSTR(MIN(t), 1, 4) AS year FROM (
  SELECT MIN(created) AS t FROM blocks WHERE ${leafFilter}${boxFilter} AND created != ''
  UNION ALL
  SELECT MIN(updated) AS t FROM blocks WHERE ${leafFilter}${boxFilter} AND updated != ''
) LIMIT 1`;
  } else {
    sql = `SELECT SUBSTR(MIN(created), 1, 4) AS year
FROM blocks
WHERE ${leafFilter}${boxFilter} AND created != ''
LIMIT 1`;
  }

  const rows = await execSql(sql, signal);
  if (rows.length === 0) {
    return null;
  }
  const year = Number(rows[0].year);
  return Number.isFinite(year) && year > 0 ? year : null;
}

/** 热力活动查询结果：按日明细 + 区间内去重文档数 */
export interface ActivityResult {
  days: DayCount[];
  /** 查询区间内有活动的文档数（root_id 去重） */
  totalDocs: number;
}

/** 查询热力图按日叶子块 / 文档数量（无 created/updated 索引，多年并发会重复全表扫描） */
export async function queryActivity(
  mode: StatMode = "created",
  config: Pick<HeatMapConfigOptions, "displayMode" | "fromYear" | "weekStart" | "viewMode" | "includedBoxIds"> = {
    displayMode: "recent",
    fromYear: null,
    weekStart: getDefaultWeekStart(),
    viewMode: "heatmap",
    includedBoxIds: null,
  },
  signal?: AbortSignal,
): Promise<ActivityResult> {
  const { startKey, endKeyExclusive } = getQueryBounds(config);
  const sqlLimit = sqlLimitForDateRange(startKey, endKeyExclusive);
  const leafFilter = `type NOT IN ${CONTAINER_TYPES}`;
  const boxFilter = buildBoxFilter(config.includedBoxIds);
  let daySql: string;
  let docsSql: string;

  if (mode === "updated") {
    daySql = `SELECT SUBSTR(updated, 1, 8) AS date, COUNT(*) AS count, COUNT(DISTINCT root_id) AS docs
FROM blocks
WHERE ${leafFilter}${boxFilter}
  AND updated != ''
  AND updated >= '${startKey}'
  AND updated < '${endKeyExclusive}'
GROUP BY SUBSTR(updated, 1, 8)
ORDER BY date ASC
LIMIT ${sqlLimit}`;
    docsSql = `SELECT COUNT(DISTINCT root_id) AS docs
FROM blocks
WHERE ${leafFilter}${boxFilter}
  AND updated != ''
  AND updated >= '${startKey}'
  AND updated < '${endKeyExclusive}'
LIMIT 1`;
  } else if (mode === "mixed") {
    daySql = `SELECT date, COUNT(*) AS count, COUNT(DISTINCT root_id) AS docs FROM (
  SELECT SUBSTR(created, 1, 8) AS date, id, root_id FROM blocks
  WHERE ${leafFilter}${boxFilter}
    AND created >= '${startKey}'
    AND created < '${endKeyExclusive}'
  UNION
  SELECT SUBSTR(updated, 1, 8) AS date, id, root_id FROM blocks
  WHERE ${leafFilter}${boxFilter}
    AND updated != ''
    AND updated >= '${startKey}'
    AND updated < '${endKeyExclusive}'
)
GROUP BY date
ORDER BY date ASC
LIMIT ${sqlLimit}`;
    docsSql = `SELECT COUNT(*) AS docs FROM (
  SELECT root_id FROM blocks
  WHERE ${leafFilter}${boxFilter}
    AND created >= '${startKey}'
    AND created < '${endKeyExclusive}'
  UNION
  SELECT root_id FROM blocks
  WHERE ${leafFilter}${boxFilter}
    AND updated != ''
    AND updated >= '${startKey}'
    AND updated < '${endKeyExclusive}'
) LIMIT 1`;
  } else {
    daySql = `SELECT SUBSTR(created, 1, 8) AS date, COUNT(*) AS count, COUNT(DISTINCT root_id) AS docs
FROM blocks
WHERE ${leafFilter}${boxFilter}
  AND created >= '${startKey}'
  AND created < '${endKeyExclusive}'
GROUP BY SUBSTR(created, 1, 8)
ORDER BY date ASC
LIMIT ${sqlLimit}`;
    docsSql = `SELECT COUNT(DISTINCT root_id) AS docs
FROM blocks
WHERE ${leafFilter}${boxFilter}
  AND created >= '${startKey}'
  AND created < '${endKeyExclusive}'
LIMIT 1`;
  }

  const [rows, docsRows] = await Promise.all([execSql(daySql, signal), execSql(docsSql, signal)]);
  return {
    days: rows.map((row) => ({
      date: String(row.date),
      count: Number(row.count) || 0,
      docs: Number(row.docs) || 0,
    })),
    totalDocs: Number(docsRows[0]?.docs) || 0,
  };
}

/** 查询某日按统计规则命中的文档（叶子块按 root_id 聚合，块数降序；单条 SQL 带出标题/图标） */
export async function queryDayDocs(dateKey: string, mode: StatMode = "created", scope: BoxScope = { includedBoxIds: null }, signal?: AbortSignal): Promise<DayDocsResult> {
  if (!/^\d{8}$/.test(dateKey)) {
    return { docs: [], truncated: false, totalDocs: 0, totalBlocks: 0 };
  }
  const startKey = `${dateKey}000000`;
  const endKeyExclusive = `${nextDateKey(dateKey)}000000`;
  const leafFilter = `type NOT IN ${CONTAINER_TYPES}`;
  const boxFilter = buildBoxFilter(scope.includedBoxIds);
  let aggSql: string;

  if (mode === "updated") {
    aggSql = `SELECT root_id AS id, COUNT(*) AS count
FROM blocks
WHERE ${leafFilter}${boxFilter}
  AND updated != ''
  AND updated >= '${startKey}'
  AND updated < '${endKeyExclusive}'
GROUP BY root_id`;
  } else if (mode === "mixed") {
    aggSql = `SELECT root_id AS id, COUNT(*) AS count FROM (
  SELECT id, root_id FROM blocks
  WHERE ${leafFilter}${boxFilter}
    AND created >= '${startKey}'
    AND created < '${endKeyExclusive}'
  UNION
  SELECT id, root_id FROM blocks
  WHERE ${leafFilter}${boxFilter}
    AND updated != ''
    AND updated >= '${startKey}'
    AND updated < '${endKeyExclusive}'
)
GROUP BY root_id`;
  } else {
    aggSql = `SELECT root_id AS id, COUNT(*) AS count
FROM blocks
WHERE ${leafFilter}${boxFilter}
  AND created >= '${startKey}'
  AND created < '${endKeyExclusive}'
GROUP BY root_id`;
  }

  const listSql = `SELECT agg.id AS id, agg.count AS count, d.content AS content, d.ial AS ial
FROM (${aggSql}) AS agg
LEFT JOIN blocks d ON d.id = agg.id AND d.type = 'd'
ORDER BY agg.count DESC, d.content ASC, agg.id ASC
LIMIT ${DAY_DOCS_SQL_LIMIT}`;
  // 汇总不受 LIMIT 影响，与热力格子提示保持一致
  const totalsSql = `SELECT COUNT(*) AS docs, COALESCE(SUM(count), 0) AS blocks
FROM (${aggSql})
LIMIT 1`;

  const [rows, totalsRows] = await Promise.all([execSql(listSql, signal), execSql(totalsSql, signal)]);
  const docs: DayDoc[] = [];
  for (const row of rows) {
    const id = String(row.id || "");
    if (!id) {
      continue;
    }
    docs.push({
      id,
      title: String(row.content || id),
      icon: parseIalIcon(String(row.ial || "")),
      count: Number(row.count) || 0,
    });
  }
  const truncated = docs.length > DAY_DOCS_LIMIT;
  if (truncated) {
    docs.length = DAY_DOCS_LIMIT;
  }
  return {
    docs,
    truncated,
    totalDocs: Number(totalsRows[0]?.docs) || 0,
    totalBlocks: Number(totalsRows[0]?.blocks) || 0,
  };
}

/**
 * 生成 SQL 笔记本过滤片段：
 * - null → 不限制
 * - [] → AND 0（无结果）
 * - [id…] → AND box IN (...)
 */
export function buildBoxFilter(includedBoxIds: string[] | null | undefined): string {
  if (includedBoxIds == null) {
    return "";
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of includedBoxIds) {
    if (typeof item !== "string") {
      continue;
    }
    const id = item.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id.replace(/'/g, "''"));
  }
  if (ids.length === 0) {
    return " AND 0";
  }
  return ` AND box IN (${ids.map((id) => `'${id}'`).join(", ")})`;
}

function parseIalIcon(ial: string): string {
  const match = /(?:^|\s)icon="([^"]*)"/.exec(ial);
  return match?.[1] || "";
}

function nextDateKey(dateKey: string): string {
  const y = Number(dateKey.slice(0, 4));
  const m = Number(dateKey.slice(4, 6)) - 1;
  const d = Number(dateKey.slice(6, 8));
  const date = new Date(y, m, d);
  date.setDate(date.getDate() + 1);
  return formatDateKey(date);
}

async function execSql(stmt: string, signal?: AbortSignal): Promise<Array<Record<string, unknown>>> {
  let response: { code: number; msg: string; data?: unknown };
  if (signal) {
    // fetchSyncPost 不支持 AbortSignal；可取消场景走原生 fetch
    const res = await fetch("/api/query/sql", {
      method: "POST",
      body: JSON.stringify({ stmt }),
      signal,
    });
    response = (await res.json()) as { code: number; msg: string; data?: unknown };
  } else {
    response = await fetchSyncPost("/api/query/sql", { stmt });
  }
  if (response.code !== 0 || !Array.isArray(response.data)) {
    throw new Error(response.msg || "sql query failed");
  }
  return response.data as Array<Record<string, unknown>>;
}

/** 按区间日历天数设 LIMIT：盖住「每天都有活动」的最坏情况，并避开思源默认截断 */
function sqlLimitForDateRange(startKey: string, endKeyExclusive: string): number {
  const start = parseLocalDateKey(startKey.slice(0, 8));
  const end = parseLocalDateKey(endKeyExclusive.slice(0, 8));
  if (!start || !end) {
    throw new Error(`invalid date range for sql limit: ${startKey}..${endKeyExclusive}`);
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, days);
}

function parseLocalDateKey(dateKey: string): Date | null {
  if (!/^\d{8}$/.test(dateKey)) {
    return null;
  }
  const y = Number(dateKey.slice(0, 4));
  const m = Number(dateKey.slice(4, 6)) - 1;
  const d = Number(dateKey.slice(6, 8));
  const date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) {
    return null;
  }
  return date;
}

/**
 * 活动查询缓存键：与 queryActivity 实际 SQL 边界 / 过滤条件一致。
 * 展示形式 / 周起始 / 年份排序等纯布局配置不进键，弹窗内切换可复用结果。
 */
export function getActivityCacheKey(mode: StatMode, config: Pick<HeatMapConfigOptions, "displayMode" | "fromYear" | "weekStart" | "viewMode" | "includedBoxIds">): string {
  const { startKey, endKeyExclusive } = getQueryBounds(config);
  const box = config.includedBoxIds == null ? "*" : config.includedBoxIds.join("\0");
  return `${mode}|${startKey}|${endKeyExclusive}|${box}`;
}

function getQueryBounds(config: Pick<HeatMapConfigOptions, "displayMode" | "fromYear" | "weekStart" | "viewMode">): { startKey: string; endKeyExclusive: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const endKeyExclusive = `${formatDateKey(tomorrow)}000000`;

  if (config.displayMode !== "years" || config.fromYear == null) {
    // 取日历整月起点与两种周起始对齐中的最早者，使热力/日历、周一/周日切换共用一次查询
    const anchor = new Date(today);
    anchor.setDate(anchor.getDate() - 364);

    const calendarStart = new Date(anchor);
    calendarStart.setDate(1);

    const mondayStart = new Date(anchor);
    alignToWeekStart(mondayStart, "monday");

    const sundayStart = new Date(anchor);
    alignToWeekStart(sundayStart, "sunday");

    const startMs = Math.min(calendarStart.getTime(), mondayStart.getTime(), sundayStart.getTime());
    return {
      startKey: `${formatDateKey(new Date(startMs))}000000`,
      endKeyExclusive,
    };
  }

  const currentYear = today.getFullYear();
  const fromYear = Math.min(config.fromYear, currentYear);
  // 结束边界与「最近一年」一致：只查到今天（明天 0 点），不扫当年剩余空档
  return {
    startKey: `${fromYear}0101000000`,
    endKeyExclusive,
  };
}
