/**
 * `siyuan` 模块的最小运行时替身：该包只发布类型声明，测试通过 alias 指到这里。
 * 状态挂在 globalThis 上，便于用例之间替换 fetchSyncPost。
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
