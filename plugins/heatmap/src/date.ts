import type { WeekStart } from "./types";

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}${m}${d}`;
}

export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function formatDisplayDate(dateKey: string): string {
  if (!dateKey || dateKey.length !== 8) {
    return dateKey;
  }
  return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}

/** 相对周起始日的偏移：周一制下周一为 0，周日制下周日为 0 */
export function getWeekOffset(date: Date, weekStart: WeekStart): number {
  const day = date.getDay(); // 0 = 周日
  if (weekStart === "monday") {
    return (day + 6) % 7;
  }
  return day;
}

export function alignToWeekStart(date: Date, weekStart: WeekStart): void {
  date.setDate(date.getDate() - getWeekOffset(date, weekStart));
}

export function orderWeekdays(weekdays: string[], weekStart: WeekStart): string[] {
  if (weekStart === "monday") {
    return [...weekdays.slice(1), weekdays[0]];
  }
  return weekdays;
}

/** 稀疏显示周一、周三、周五 */
export function isSparseWeekday(index: number, weekStart: WeekStart): boolean {
  const dayOfWeek = weekStart === "monday" ? (index + 1) % 7 : index;
  return dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5;
}
