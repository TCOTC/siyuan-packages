/**
 * `siyuan` 模块的最小运行时替身。
 *
 * 该包只发布类型声明，没有可执行的 JS；测试通过 vitest 的 alias 指到这里。
 * 状态挂在 globalThis 上，是因为原仓库的单测就是靠 `__heatmapSiyuanStub`
 * 在各用例之间替换 `fetchSyncPost` 的实现，这里保持同一套约定。
 */

export type FetchSyncPost = (url: string, data: { stmt: string }) => Promise<{ code: number; msg: string; data: unknown }>;

interface StubState {
  fetchSyncPost: FetchSyncPost;
}

const globalScope = globalThis as typeof globalThis & {
  __heatmapSiyuanStub?: StubState;
};

const state: StubState = globalScope.__heatmapSiyuanStub ?? {
  fetchSyncPost: async () => ({ code: 0, msg: "", data: [] }),
};
globalScope.__heatmapSiyuanStub = state;

/** 每次调用都取当前 state，测试替换 state.fetchSyncPost 后立即生效 */
export function fetchSyncPost(...args: Parameters<FetchSyncPost>): ReturnType<FetchSyncPost> {
  return state.fetchSyncPost(...args);
}

/** 只声明测试会碰到的成员；其余 API 不在单测覆盖范围内 */
export class Dialog {
  element = {
    querySelector(): null {
      return null;
    },
    querySelectorAll(): [] {
      return [];
    },
  };

  destroy(): void {}
  bindInput(): void {}
}

export class Menu {
  addItem(): void {}
  open(): void {}
  fullscreen(): void {}
}
