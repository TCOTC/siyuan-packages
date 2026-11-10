// 分组元数据与内核片段记录解耦，另存于独立文件（见 services/snippet-groups.ts）。
// type 区分 css/js；snippetIds 有序；groups 数组顺序即分组顺序。
// 未分组用占位分组表达（id = UNGROUPED_GROUP_ID），不记录成员；
// 对账时剔除失效 id，真实存在但未引用的片段一定回到未分组。
import type { Snippet, SnippetType } from "../types";

export interface SnippetGroup {
  id: string;
  type: SnippetType;
  name: string;
  /** 有序，组内顺序的权威来源 */
  snippetIds: string[];
}

/** 仅表达「未分组」在组序中的位置，不记录成员 */
export const UNGROUPED_GROUP_ID = "default";

export function isUngroupedGroup(group: SnippetGroup): boolean {
  return group.id === UNGROUPED_GROUP_ID;
}

export function hasRealGroups(groups: SnippetGroup[]): boolean {
  return groups.some((group) => !isUngroupedGroup(group));
}

/**
 * 补齐/清理未分组占位：有真实分组但缺占位时追加到末尾；真实分组删光时移除占位；
 * 已被拖到中间的位置保持不动。
 */
export function withUngroupedAnchors(groups: SnippetGroup[]): SnippetGroup[] {
  if (!Array.isArray(groups)) return [];
  const result: SnippetGroup[] = [];
  (["css", "js"] as SnippetType[]).forEach((type) => {
    const seq = groups.filter((group) => group.type === type);
    const realGroups = seq.filter((group) => !isUngroupedGroup(group));
    if (realGroups.length === 0) {
      // 无真实分组：丢弃可能残留的占位（菜单据此回平铺）
      return;
    }
    const hasAnchor = seq.some((group) => isUngroupedGroup(group));
    if (hasAnchor) {
      // 保序：真实分组与占位维持现有相对顺序（占位可能被用户拖到中间）
      result.push(...seq);
    } else {
      // 缺占位：真实分组在前，占位追加到末尾（未分组默认排在各组之后）
      result.push(...realGroups, { id: UNGROUPED_GROUP_ID, type, name: "", snippetIds: [] });
    }
  });
  return result;
}

/** 同类型内移动分组（含未分组占位）的相对位置。 */
export function moveGroup(groups: SnippetGroup[], snippetType: SnippetType, groupId: string, targetGroupId: string, isTop: boolean): SnippetGroup[] {
  const others = groups.filter((group) => group.type !== snippetType);
  const seq = groups.filter((group) => group.type === snippetType);
  const from = seq.findIndex((group) => group.id === groupId);
  if (from < 0) return cloneGroups(groups);
  let to = seq.findIndex((group) => group.id === targetGroupId);
  if (to < 0 || from === to) return cloneGroups(groups);
  const [moved] = seq.splice(from, 1);
  // 移除被移动组后重算目标索引（被移动组在目标之前时目标位置前移一位）
  to = seq.findIndex((group) => group.id === targetGroupId);
  const insertIndex = isTop ? to : to + 1;
  seq.splice(insertIndex, 0, moved);
  return [...others, ...seq];
}

export function cloneGroups(groups: SnippetGroup[]): SnippetGroup[] {
  return groups.map((group) => ({ ...group, snippetIds: [...group.snippetIds] }));
}

export function isSnippetGroupArray(value: unknown): value is SnippetGroup[] {
  if (!Array.isArray(value)) return false;
  return value.every((group: unknown) => {
    if (typeof group !== "object" || group === null) return false;
    const g = group as Partial<SnippetGroup>;
    return typeof g.id === "string" && g.id.length > 0 && (g.type === "css" || g.type === "js") && typeof g.name === "string" && Array.isArray(g.snippetIds) && g.snippetIds.every((id: unknown) => typeof id === "string");
  });
}

/**
 * 对账分组集合与权威片段列表：剔除失效/重复 id 与非法分组，保留空组与未命名组。
 */
export function reconcileGroups(groups: SnippetGroup[], snippets: Snippet[]): SnippetGroup[] {
  if (!isSnippetGroupArray(groups)) return [];
  const validIds = new Set(snippets.map((snippet) => snippet.id));
  const result: SnippetGroup[] = [];
  for (const group of groups) {
    // 组内 id 去重（防御数据损坏导致同一片段重复引用）
    const seen = new Set<string>();
    const snippetIds: string[] = [];
    for (const id of group.snippetIds) {
      if (!validIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      snippetIds.push(id);
    }
    result.push({ id: group.id, type: group.type, name: group.name, snippetIds });
  }
  return result;
}

export function ungroupedSnippetIds(groups: SnippetGroup[], snippets: Snippet[], snippetType: SnippetType): string[] {
  const referenced = new Set<string>();
  groups.forEach((group) => {
    if (group.type !== snippetType) return;
    group.snippetIds.forEach((id) => referenced.add(id));
  });
  return snippets.filter((snippet) => snippet.type === snippetType && !referenced.has(snippet.id)).map((snippet) => snippet.id);
}

export function findGroupBySnippetId(groups: SnippetGroup[], snippetId: string): SnippetGroup | undefined {
  return groups.find((group) => group.snippetIds.includes(snippetId));
}

export function findGroup(groups: SnippetGroup[], snippetType: SnippetType, groupId: string): SnippetGroup | undefined {
  return groups.find((group) => group.id === groupId && group.type === snippetType);
}

/** 加入目标组（追加到组尾），并从原组移除。 */
export function assignSnippetToGroup(groups: SnippetGroup[], groupId: string, snippetId: string): SnippetGroup[] {
  const next = cloneGroups(groups);
  const target = next.find((group) => group.id === groupId);
  if (!target) return next;
  // 先从事分组移除该片段（含目标组自身，避免重复追加）
  next.forEach((group) => {
    const index = group.snippetIds.indexOf(snippetId);
    if (index >= 0) group.snippetIds.splice(index, 1);
  });
  target.snippetIds.push(snippetId);
  return next;
}

export function unassignSnippetFromGroup(groups: SnippetGroup[], snippetId: string): SnippetGroup[] {
  // cloneGroups 已拷贝 snippetIds，直接就地改克隆体，避免 map 里再造对象
  const next = cloneGroups(groups);
  for (const group of next) {
    if (!group.snippetIds.includes(snippetId)) continue;
    group.snippetIds = group.snippetIds.filter((id) => id !== snippetId);
  }
  return next;
}

/** 片段须已在目标组内；目标为组头时追加到组尾。 */
export function moveSnippetWithinGroup(groups: SnippetGroup[], groupId: string, snippetId: string, targetId: string, isTop: boolean): SnippetGroup[] {
  const target = groups.find((group) => group.id === groupId);
  if (!target || !target.snippetIds.includes(snippetId) || !target.snippetIds.includes(targetId)) {
    return cloneGroups(groups);
  }
  const next = cloneGroups(groups);
  const group = next.find((g) => g.id === groupId)!;
  const fromIndex = group.snippetIds.indexOf(snippetId);
  const toIndex = group.snippetIds.indexOf(targetId);
  const [moved] = group.snippetIds.splice(fromIndex, 1);
  let insertIndex: number;
  if (isTop) {
    insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
  } else {
    insertIndex = fromIndex < toIndex ? toIndex : toIndex + 1;
  }
  group.snippetIds.splice(insertIndex, 0, moved);
  return next;
}

export function addGroup(groups: SnippetGroup[], group: SnippetGroup): SnippetGroup[] {
  return [...cloneGroups(groups), { ...group, snippetIds: [...group.snippetIds] }];
}

export function renameGroup(groups: SnippetGroup[], groupId: string, newName: string): SnippetGroup[] {
  const next = cloneGroups(groups);
  const target = next.find((group) => group.id === groupId);
  if (target) target.name = newName;
  return next;
}

/** 删除分组，组内片段回到未分组；不删除片段本身。 */
export function removeGroup(groups: SnippetGroup[], groupId: string): SnippetGroup[] {
  return cloneGroups(groups).filter((group) => group.id !== groupId);
}

export function genNewGroupId(groups: SnippetGroup[], makeId: () => string): string {
  const taken = new Set<string>();
  groups.forEach((group) => taken.add(group.id));
  let id = makeId();
  while (taken.has(id)) {
    id = makeId();
  }
  return id;
}
