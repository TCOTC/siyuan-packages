// 挂件运行在 iframe 里，宿主窗口是 `window.parent`（DOM 里 `Window.parent: Window`）。
//
// 这里只做一件事：把 `siyuan` 包的类型拉进编译单元。该包在 `siyuan.d.ts` 里写了
// `declare global { interface Window extends Global {} }`，`Global` 已包含
// `siyuan: ISiyuan` 与 `Lute: typeof Lute`，所以在任意位置 `import "siyuan"`（哪怕只为类型）
// 之后，`window.parent.siyuan`、`window.Lute` 就都有类型，包内不必再手写 `interface Window`。
//
// 注意：挂件里 `window.siyuan` 本身不存在（那是宿主窗口的字段），请一律走 `window.parent`。
import "siyuan";
