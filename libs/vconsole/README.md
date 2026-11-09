# vconsole（vendored）

`devtools` 插件在移动端用的 [vConsole](https://github.com/Tencent/vConsole)。这里放的是
**官方仓库的构建产物**，不是源码，也不从 npm 安装。

## 为什么不用 npm 上的 `vconsole`

npm 上的最新版是 3.15.1（2023-06），插件依赖的 3.16.0 尚未发布，其中若干修复直接关系到
「销毁后重建实例」「PC 浏览器里拖拽开关」「`destroy()` 在初始化完成前调用」这些真实使用路径。

## 内容与来源

| 文件                     | 来源                                                       |
| ------------------------ | ---------------------------------------------------------- |
| `dist/vconsole.min.js`   | `pnpm build`（webpack，target web）                        |
| `dist/vconsole.min.d.ts` | `pnpm build:typings`                                       |
| `build/vendor.d.ts`      | 仓库内同名文件，`vconsole.min.d.ts` 顶部的三斜线引用需要它 |
| `LICENSE`                | 仓库根目录同名文件                                         |

- 上游提交：`de7026df97148799c3efcd29577e3eda0788362f`（`dev` 分支）
- 版本：`3.16.0-alpha`
- 构建方式沿用上游 `package.json` 的脚本；webpack 5.109 起不再随包安装
  `terser-webpack-plugin`，构建时需经 `NODE_PATH` 临时提供一份（原 devtools 仓库的
  `scripts/build-vconsole.mjs` 就是这么做的）。

## 更新

不在本仓重编。在上游仓库检出目标提交后构建，把上表四个文件覆盖过来，并同步修改
`package.json` 的 `version` 与本文件的提交哈希。`dist/vconsole.min.js` 是压缩产物，diff 不可读，
以提交哈希为准。
