/**
 * 全仓共享的环境声明。
 *
 * 样式文件由打包器当作副作用导入处理（产物里会被抽成 index.css），TypeScript 只需要知道
 * 这个模块存在。原先每个包各放一份 `src/declarations.d.ts`（还出现了 global.d.ts /
 * ambient.d.ts / env.d.ts 三种名字），改名与漏写都不易发现，所以统一收到这里。
 *
 * 接入方式是 `tsconfig.base.json` 的 `typeRoots` + `types`：`types/<包名>/index.d.ts`
 * 会被每个继承基线的 tsconfig 自动纳入，包内不用再写任何 `include`。
 *
 * 这里**不放思源的全局对象**：`window.siyuan` / `window.Lute` 由 `siyuan` 包自己的
 * `declare global { interface Window extends Global {} }` 提供，包内 import 过它就生效。
 * 挂件访问宿主窗口用 `window.parent.siyuan`（类型相同）。
 *
 * 包内 `src/types.d.ts` 只放真正属于该包的类型（模块补充、上游漏声明的成员等）。
 */
declare module "*.scss";
declare module "*.css";
