/**
 * 版本号比较
 *
 * 两种口径刻意并存，不要合并：
 * - `compareCoreVersions` / `isVersionInRange`：只比**核心数字**（`主.次.修订`），`-预发布` 与
 *   `+构建` 后缀整体丢弃，缺失段当 0，永不返回 null。用于「主题与本插件是否兼容」这类区间判断。
 * - `compareSemver`：严格语义化版本 2.0.0。核心三段缺一不可、数字标识符不许前导零，
 *   预发布版本低于同号正式版，无法解析返回 null。用于判断「谁更新」。
 *
 * 为什么不合成一个：两者的失败姿势不同。集市里真实存在两段版本（`1.2`、`0.90` 这类），
 * 严格版对它们返回 null，而区间判断必须给出结论；反过来，严格版的「预发布低于同号正式版」
 * 在区间判断上是反效果（见 `isVersionInRange` 的注释）。
 */

/**
 * 比较两个版本的核心数字，忽略预发布与构建后缀
 *
 * 这是低层比较：`3.0.0-beta.1` 与 `3.0.0` 在这里相等。判断「谁更新」不要用它，
 * 那种场景要的是 {@link compareSemver}。
 *
 * @returns a > b 返回 1，a < b 返回 -1，相等返回 0
 */
export function compareCoreVersions(a: string, b: string): number {
  const parse = (version: string): number[] =>
    version
      .trim()
      .replace(/^v/i, "")
      // 先砍掉 `-预发布` / `+构建` 再按点切段：否则 `3.0.0-beta.1` 会被切成 4 段，
      // 那个多出来的 `1` 会让它比同号正式版「大」——MIN/MAX 常量自己带预发布时就会翻车
      // （MIN=3.1.0-beta.1 时正式的 3.1.0 反而被判成低于最小值）
      .split(/[-+]/, 1)[0]!
      .split(".")
      .map((part) => {
        const match = /^\d+/.exec(part);
        return match ? Number(match[0]) : 0;
      });

  const va = parse(a);
  const vb = parse(b);
  const length = Math.max(va.length, vb.length);
  for (let i = 0; i < length; i++) {
    const na = va[i] ?? 0;
    const nb = vb[i] ?? 0;
    if (na !== nb) {
      return na > nb ? 1 : -1;
    }
  }
  return 0;
}

/** 兼容区间：`min` 含、`max` 不含（左闭右开） */
export interface VersionRange {
  min: string;
  max: string;
}

/**
 * 版本是否落在兼容区间 `[min, max)` 内
 *
 * **预发布按核心数字归类**是这个函数的刻意设计，不是疏漏：
 *
 * - `3.0.0-beta.1` 归入 3.0.0，因此 `min = 3.0.0` 时算「在范围内」。作者说「支持 3.0.x」，
 *   那么 3.0.0 的预发布同属这一代，放行是合理的；
 * - `3.1.0-beta.1` 归入 3.1.0，因此 `max = 3.1.0` 时算「不在范围内」。**这是关键**：`max`
 *   的语义是「这一代我还没验证过」，把未验证版本的预发布放进来比拦在外面更危险 ——
 *   严格语义化版本恰好会放行它（`3.1.0-beta.1 < 3.1.0`），那种「更标准」的判定在这里更糟。
 *
 * 也就是说区间回答的是「属于哪一代」，不是「谁更新」。要问后者请用 {@link compareSemver}。
 *
 * 两个边界常量应当写成纯 `主.次.修订`：虽然本函数能正确处理带预发布的边界，但读代码的人
 * 容易误以为预发布有特殊待遇。写纯数字，语义才和实现一样直白。
 */
export function isVersionInRange(version: string, range: VersionRange): boolean {
  return compareCoreVersions(version, range.min) >= 0 && compareCoreVersions(version, range.max) < 0;
}

/** 预发布标识符：`0`、无前导零的数字，或至少含一个字母或连字符的字母数字串 */
const PRERELEASE_IDENTIFIER = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";

/** 语义化版本 2.0.0 的完整形态，另允许开头的 `v` 前缀（集市 tag 的常见写法） */
const SEMVER_PATTERN = new RegExp(`^[vV]?(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-(${PRERELEASE_IDENTIFIER}(?:\\.${PRERELEASE_IDENTIFIER})*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$`);

interface ParsedVersion {
  /** 核心三段：主版本、次版本、修订号 */
  numbers: [number, number, number];
  /** 预发布标识（如 `1.0.0-beta.1` 的 `beta.1`）；正式版为空数组 */
  prerelease: (number | string)[];
}

/** 解析 `[v]主.次.修订[-预发布][+构建]`；不符合语义化版本时返回 null */
function parseVersion(raw: string): ParsedVersion | null {
  const match = raw.trim().match(SEMVER_PATTERN);
  if (!match) {
    return null;
  }
  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: (match[4] ?? "")
      .split(".")
      .filter((part) => part !== "")
      .map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
  };
}

/**
 * 严格比较两个语义化版本：`a > b` 返回 1，`a < b` 返回 -1，相等返回 0，无法解析返回 null
 *
 * 预发布版本低于同号正式版（`1.0.0-beta` < `1.0.0`），构建元数据（`+` 之后）不参与比较
 */
export function compareSemver(a: string, b: string): number | null {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) {
    return null;
  }
  for (let i = 0; i < va.numbers.length; i++) {
    // 三段定长元组，下标必然存在；用 `!` 抵掉 noUncheckedIndexedAccess 的保守推断
    const left = va.numbers[i]!;
    const right = vb.numbers[i]!;
    if (left !== right) {
      return left > right ? 1 : -1;
    }
  }
  const pa = va.prerelease;
  const pb = vb.prerelease;
  if (pa.length === 0 && pb.length === 0) {
    return 0;
  }
  if (pa.length === 0) {
    return 1;
  }
  if (pb.length === 0) {
    return -1;
  }
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) {
      return -1;
    }
    if (y === undefined) {
      return 1;
    }
    if (x === y) {
      continue;
    }
    if (typeof x === "number" && typeof y === "number") {
      return x > y ? 1 : -1;
    }
    // 数字标识符低于字母标识符
    if (typeof x === "number") {
      return -1;
    }
    if (typeof y === "number") {
      return 1;
    }
    // 字母标识符按 ASCII 顺序比较（大小写敏感，故不先归一化为小写）
    return x > y ? 1 : -1;
  }
  return 0;
}

/**
 * `version` 是否达到 `minimum`
 *
 * 两者都按语义化版本解析，任一方无法解析（如 `1.0`、`nightly`）或低于最低版本时返回 false，
 * 与调用方「拿不准就不放行」的口径一致
 */
export function isVersionAtLeast(version: string, minimum: string): boolean {
  const compared = compareSemver(version, minimum);
  return compared !== null && compared >= 0;
}
