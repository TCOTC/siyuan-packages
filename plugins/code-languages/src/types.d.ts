import type { Dialog } from "siyuan";

// 上游把 dialog 声明为可选（`dialog?: Dialog`，首次 open 前为 undefined）；
// 本包在 Setting.open() 之后才访问它，这里收窄成必选以省掉断言。仅本包成立，不往上提。
declare module "siyuan" {
  interface Setting {
    dialog: Dialog;
  }
}
