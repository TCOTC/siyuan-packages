import type { Dialog } from "siyuan";

// 扩展 Setting 类型以包含 dialog 属性（npm 的 siyuan 1.2.9 未声明，运行时由 Setting.open() 创建）
declare module "siyuan" {
  interface Setting {
    dialog: Dialog;
  }
}
