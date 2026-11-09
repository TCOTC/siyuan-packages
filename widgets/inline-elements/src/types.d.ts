import type { ISiyuan } from "siyuan";

declare global {
  interface Window {
    parent: Window & {
      siyuan: ISiyuan;
    };
  }
}
