# siyuan-packages

把散在 27 个目录、25 个 GitHub 仓库里的思源集市包收进一个源码仓库：**统一构建，各自发布**。

> **当前状态：骨架，未迁移任何包。**
> 这个仓库里还没有真实的包代码，只有目录约定、构建契约、kit 内核和发布链路的草稿。
> 它的用途是先评审架构，确认后再按 README 末尾的迁移计划逐步搬。

---

## 1. 要解决的问题

现状（2026-11 实测）：

- **25 个集市包分散在 25 个独立仓库**，都是 `github.com/TCOTC/*`，各自有自己的 `release.yml`、`pnpm-lock.yaml` 和 `node_modules`
- **工具链已经分了三代**：ESLint 9.33 → 10.9，TypeScript 4.8.4 / 4.9.5 / 6.0.x / 7.0.2，webpack 5.76 → 5.111.1
- **`siyuan`（petal）依赖有 19 种不同 pin**，混用三种写法：semver、`github:...#短哈希`、`archive/....tar.gz`
- **`webpack.config.js` 有 20 个不同版本**，但差异基本无意义——`isPro` vs `production` 变量名、注释掉的 BannerPlugin、dprint 格式。不是功能分叉，是漂移

真实痛点是两件事：

1. **每次思源大版本适配**，要在 25 个仓库里重复「打开 → 让 AI 改 → 各自 install/build」
2. **依赖版本没有单一真相源**，同一类问题在不同包里可能已经被修了、也可能没有

顺带发现一个每次发版都在做的手工步骤：25 个 `release.yml` 都写 `prerelease: true`，但集市只认非 prerelease 的 release，所以 CI 建完还要手动改成正式版（所有仓库最新的 release 确实都是非 prerelease）。

合仓解决的是这两件事。它**不**解决：磁盘占用（`node_modules` 本来就硬链接到 `D:\pnpm\store`，25 份表观 3.49 GB，实际共享）、也不解决「抽公共代码」（25 个包里跨项目重复的自定义函数只有一个 `escapeHtml`）。

---

## 2. 集市约束（读 bazaar 源码确认）

这五条决定了架构长什么样，不能凭印象：

| 约束                                    | 依据                                                                                                 | 对架构的影响                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 一个仓库只能承载一个包                  | `util.FetchLatestReleaseZip` 走 `/releases/latest`；`plugins.txt` 是纯 `owner/repo` 行，不支持子目录 | 25 个收录仓库**必须保留**，不能合并成 1 个    |
| 集市只读最新 release 里的 `package.zip` | `actions/stage/index.go` 下载 zip 并解压，从 zip 内读清单、README、图标                              | 分发只需发 release 资产；仓库树内容不参与     |
| 资产名必须恰好是 `package.zip`          | `actions/util/release.go` 里 `asset.GetName() == "package.zip"`                                      | 产物命名不可自定义                            |
| prerelease 不参与索引                   | GitHub `/releases/latest` 忽略 prerelease                                                            | 自动发布必须直接建**正式** release            |
| `version` 单调递增且不带 `v` 前缀       | `rules/manifest.go`                                                                                  | 清单写 `1.0.2`，tag 写 `v1.0.2`，两者分工固定 |

**所以架构只能是：单源码仓 + 25 个发布端点 + 自动扇出。** 想让集市少收录几个仓库是没有路的。

---

## 3. 分层

```
┌─ 契约层 ─────────────────────────────────────────────┐
│ 每个包 = 清单 + 一个入口 + 静态资源                     │
│ 「构建」= 一条命令，产出 dist/<name>/ 与 dist/<name>.zip  │
└──────────────────────────────────────────────────────┘
                     ↓
┌─ preset 层（kit/src/presets/）───────────────────────┐
│ plugin → vite（CJS bundle）                          │
│ widget → vite（单文件 HTML）                          │
│ theme  → sass（一份 theme.css）                       │
└──────────────────────────────────────────────────────┘
                     ↓
┌─ 执行层 ─────────────────────────────────────────────┐
│ cli.ts：推断包类型 → 生成 step 列表 → 顺序执行          │
│ pack.ts：复制静态资源 → dist/<name>/ → dist/<name>.zip  │
│ verify.ts：与旧产物对拍（迁移安全网）                   │
└──────────────────────────────────────────────────────┘
                     ↓
┌─ 分发层（.github/workflows/publish.yml）─────────────┐
│ tag `move-doc/v1.0.2` → 构建该包 → 在 TCOTC/move-doc  │
│ 建正式 release v1.0.2 并上传（资产名 package.zip）       │
└──────────────────────────────────────────────────────┘
```

**统一的是契约和产物，不是「所有包共用一个打包器」。** 主题的产物就是一份 CSS，为它套一层 vite 只会多出一个没人用的 ESM 桩文件——那是假统一。

---

## 4. 目录结构

```
siyuan-packages/
├── plugins/              # 23 个插件，一个包一个目录
├── themes/               # 主题
├── widgets/              # 挂件
├── kit/                  # 构建内核 @tcotc/siyuan-kit
│   └── src/
│       ├── define.ts     # 公开契约：BuildOptions / PassOptions
│       ├── resolve.ts    # 约定推断：包类型、清单、静态资源
│       ├── plan.ts       # 按包类型生成 BuildStep[]
│       ├── presets/      # plugin / widget / theme
│       ├── pack.ts       # 复制静态资源、打 zip
│       ├── verify.ts     # 与基线产物对拍
│       └── cli.ts        # build / dev / verify
├── pnpm-workspace.yaml   # catalog：依赖版本唯一真相源
├── tsconfig.base.json
├── .oxfmtrc.json         # 格式化规则（oxfmt）
├── .oxlintrc.json        # lint 规则（oxlint）
├── siyuan.config.example.json   # 本机工作空间配置的模板（真实配置不入库）
└── dist/                 # 所有产物（生成，gitignore）
```

根目录的规则很简单：三个类型目录装「要发布的东西」，`kit/` 装「把前者变成 `package.zip` 的那个程序」。没有 `packages/`、也没有 `tooling/` 这类外层容器——每个都只有一个成员时，那层只增加路径长度，不承载任何语义。

包放在哪个类型目录下就决定它的类型：`plugins/*` → `plugin`，`themes/*` → `theme`，`widgets/*` → `widget`。类型决定清单文件名（`plugin.json` / `theme.json` / `widget.json`），与集市规则一一对应。

一个插件包的最小结构：

```
plugins/move-doc/
├── package.json
├── plugin.json           # 清单：name / version / icon / preview / readme
├── icon.png
├── preview.png
├── README.md             # 多语言：README.zh-CN.md、README.ja.md …
└── src/
    ├── index.ts          # 默认入口
    └── i18n/*.json       # 会被复制到产物的 i18n/
```

目录名同时也是发布时目标仓库的默认名（`TCOTC/<name>`）。

---

## 5. 产物契约

**源码目录里永远不出现产物。** 所有产物集中在仓库根的 `dist/`，包目录只有源码。

**`pnpm build`**

```
plugins/move-doc/           源   {plugin.json, README*.md, icon.png, preview.png, src/}
        │
        └─▶ dist/move-doc/  解包内容  {index.js, index.css, plugin.json, README*.md, i18n/}
            dist/move-doc.zip            上传到 release 的那个包
```

**`pnpm --filter <name> dev`**

```
plugins/move-doc/ ──watch──▶ dist/move-doc/ ──同步──▶ <工作空间>/data/plugins/move-doc/
```

dev 每次产物落盘后会把 `dist/<name>/` **镜像**进思源工作空间：新增的复制过去，变了的覆盖，产物里没有的删掉（否则改文件名后旧文件会一直留在插件目录里）。所以思源里看到的就是最新构建。

集中到 `dist/` 而不是各包自己的原因：

- 源码和产物彻底分离，包目录里不会冒出 `index.js` / `i18n/`，`.gitignore` 只需要一行 `/dist`
- 发布脚本按约定取 `dist/<name>.zip`，不用遍历包目录
- 换机器、换工作空间路径都不用动任何包

**三条硬规定：**

- zip 内**不能**多一层包装目录，清单必须在 zip 根（集市校验会拒）
- 清单里的 `version` 不带 `v` 前缀；release tag 带 `v`
- `dist/` 与 `siyuan.config.json` 都 gitignore

### 工作空间配置

dev 同步需要知道本机的思源工作空间在哪。在仓库根建 `siyuan.config.json`（已 gitignore，模板见 `siyuan.config.example.json`）：

```json
{ "workspace": "D:/SiYuan" }
```

指向**工作空间根目录**（包含 `data/` 的那一层），kit 自己拼 `<workspace>/data/plugins|themes|widgets/<name>`。没有这个文件时 `dev` 只构建、不同步，并给出提示。

填错时会在读取配置阶段就报错，不会等到写文件才发现：路径不存在、填成了 `data` 目录本身、或者目录下没有 `data/`，三种情况各有对应的提示。

**安全校验**：同步前会确认目标目录里有对应清单、且清单里的 `name` 与本包一致；不满足就拒绝写入。这是为了防止 workspace 配错时，把工作空间里别人的插件目录当成自己的产物目录镜像掉（镜像会删除多余文件）。两种情况都实测过，都会被拦住。

---

## 6. 约定优于配置

标准包**零构建配置**，`package.json` 只有一行脚本：

```json
{
  "name": "move-doc",
  "private": true,
  "type": "module",
  "scripts": { "build": "siyuan-kit build", "dev": "siyuan-kit dev" },
  "devDependencies": {
    "@tcotc/siyuan-kit": "workspace:*",
    "siyuan": "catalog:"
  }
}
```

kit 从同目录的清单读 `name` / `version` / `icon` / `preview` / `readme`，按约定找 `src/index.ts` 和 `src/i18n/`，用清单里的 name 算出 `/plugins/<name>/` 作为 `base`。

`@tcotc/siyuan-kit` 必须写进 `devDependencies`（`workspace:*`），否则 pnpm 不会把 `siyuan-kit` 这个 bin 链进该包的 `node_modules/.bin`。

偏离约定用**同一套 API** 声明，而不是退回 webpack。目前已知需要 `build.config.ts` 的包：

| 包                 | 需要什么                                              | 怎么表达                                                                |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `image-squeeze`    | 主入口 CJS + Worker 入口 IIFE；wasm 资源；自定义 base | `passes: [{format:"cjs"}, {format:"iife", name, inlineDynamicImports}]` |
| `plugin-sample`    | 插件 CJS + 内核侧 ESM                                 | `passes: [{format:"cjs"}, {format:"es", entry:"src/kernel.ts"}]`        |
| `devtools`         | 构建前先打包 vConsole                                 | 保留 prebuild 脚本，`scripts.build` 里串联                              |
| `highlight-search` | 现有 vite 配置（自定义 define 与资源改名）            | 大部分可被 preset 吸收，剩余走 `define` / `copy`                        |

这 4 个是**已知例外**，不是「以后再想」。迁移时逐个验证，不要强行套模板。

---

## 7. 依赖治理

- **一份 lockfile**：`pnpm-lock.yaml` 只有根目录一份
- **catalog 是唯一真相源**：升级思源 API 或构建工具只改 `pnpm-workspace.yaml` 里的 catalog，25 个包一起动
- **`siyuan` 用已发布版本，不用 git 短哈希**：19 种 pin 收敛成 1 行，lockfile 可复现、可缓存
- **关闭 `shamefully-hoist`**：原 Whisper 开了，其余 24 个没开。合仓后 `.npmrc` 只有根一份，开了等于把全部插件的依赖解析拍平，幽灵依赖会被静默解析成功。保持 pnpm 默认的隔离式 `node_modules`，让幽灵依赖在构建期就报错
- **machine 相关的配置不进仓库**：registry、`store-dir` 留在用户级 `~/.npmrc`；CI 跑在 ubuntu-latest，仓库里硬编码 Windows 路径会直接把 CI 弄坏
- **仓库里没有 `.npmrc`，这是刻意的**：pnpm 默认就是隔离式 `node_modules`，不需要任何配置。不要为了图快加 `shamefully-hoist=true`——那会把全部插件的依赖解析拍平，让幽灵依赖在构建期静默通过，最后表现为「本地能构建、换台机器解析不到」

---

## 7.1 格式化与 lint

两者都交给 oxc，一个工具链覆盖 TS / SCSS / Markdown / JSON：

- `pnpm format` / `pnpm format:check` → oxfmt（配置 `.oxfmtrc.json`）
- `pnpm lint` → oxlint（配置 `.oxlintrc.json`）

规则要点：

- `printWidth: 320`：**不是「不限制折行」**，而是 oxfmt 允许的最大值（超过 320 会报配置错误）。实际效果是 320 列以内不折
- `experimentalOperatorPosition: "start"`：表达式被迫折行时，运算符放行首
- `tabWidth: 2`、LF、双引号、分号、`trailingComma: "all"`（等价于「只有多行才加」）
- `objectWrap: "preserve"`：对象字面量按你写的单行/多行来
- YAML 不参与：`ignorePatterns` 里排掉 `**/*.{yml,yaml}`
- `src/i18n/` 参与格式化，只有包根的 `i18n/`（构建产物）被排除

**已知取舍**：oxfmt 是 Prettier 系，会把能塞进 320 的手动折行合并回一行。dprint 会保留手动断行，但 dprint 做不到 320 以上、也没有 SCSS/Markdown 之外的统一配置——这是选工具时明确接受的代价。确实需要按自己的意愿断行时，在上一行写 `// oxfmt-ignore`（`// prettier-ignore` 同样有效，两个都实测过）。

---

## 8. 发布链路

```
monorepo 打 tag `move-doc/v1.0.2`
        │
        ├─ 解析出 package=move-doc、version=1.0.2
        ├─ 校验清单里的 version 与 tag 一致
        ├─ 只构建这一个包（不是全量）→ dist/move-doc.zip
        ├─ cp dist/move-doc.zip package.zip     ← 集市按资产名找，必须改名
        ├─ gh release create v1.0.2 --repo TCOTC/move-doc package.zip
        │      └─ 必须是正式 release，不能是 prerelease
        └─ （可选）git subtree push 把源码镜像到 TCOTC/move-doc
                ↓
        bazaar Stage 下一轮抓到新 release → 集市可见
```

三个容易做错的地方：

1. **用 PAT，不能用 `GITHUB_TOKEN`**。`GITHUB_TOKEN` 只能写当前仓库，跨 25 个仓库需要 fine-grained PAT（`contents: write`），存在 `PUBLISH_TOKEN`。
2. **目标仓库的 `release.yml` 必须删掉**。创建 release 会在目标仓库创建 tag，那会触发 `on: push: tags` 的旧 workflow，同一版本被构建两次、互相覆盖资产。
3. **不要用「推 tag 让目标仓库自己构建」**。那等于保留 25 份 lockfile 和 25 份工具链，痛点什么都没变。

集市侧**不需要任何 PR**：25 个包已经都在 `plugins.txt` / `themes.txt` / `widgets.txt` 里，收录记录不会因为换源码仓而变化。

---

## 9. 迁移计划

| 阶段   | 内容                                                                              | 验收标准                                                                      |
| ------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **P0** | 骨架 + kit + 2 个试点包（`move-doc` 标准插件、`highlight-search` 现有 vite 配置） | 两个包 `pnpm build` 通过；`verify` 与旧产物对拍无缺文件；在真实思源里装上能跑 |
| **P1** | 20 个标准插件机械迁移                                                             | 每个包都对拍 + 实机安装；`pnpm -r build` 全绿                                 |
| **P2** | 4 个例外包：`image-squeeze`、`plugin-sample`、`devtools`、+ 有 `scripts/` 的三个  | 逐个人工验证，尤其是 `image-squeeze` 的 Worker 与 wasm                        |
| **P3** | 主题（Whisper）+ 挂件（inline-elements）                                          | 产物结构与现有一致；主题在思源里渲染正常                                      |
| **P4** | 接入 `publish.yml`，先 dry-run 再真发一个包                                       | 集市 Stage 能抓到新版本                                                       |

**安全网（每个包都要做）**：用旧仓库的 `package.zip` 当基线，运行

```bash
siyuan-kit build
siyuan-kit verify --against ../old-package.zip
```

只报差异不自动判定：少文件是硬失败，体积变化与新增文件需要人看。构建系统迁移最危险的失败不是「构建失败」，而是「构建成功但运行时报错」，这在 CI 里不会红。

---

## 10. 已验证 / 仍待验证

**已实测通过（骨架阶段就跑过一遍）**

- **kit 不编译，直接由 Node 剥离类型运行**：`siyuan-kit help` 与 `build` 都能跑，不需要先 `tsc` 一遍。退路仍然是编到 `dist/`，但暂时不需要
- **插件 preset 端到端跑通**：用一个一次性冒烟包（`plugin.json` + TS 入口 + SCSS）构建，产出 `dist/<name>/` 与 `dist/<name>.zip`，zip 根目录正是 `index.js` / `index.css` / `plugin.json` / `README.md`，没有多余包装层
- **产物不落进包目录**：build 之后 `plugins/<name>/` 里仍然只有源码，`dist/` 集中在仓库根
- **dev 同步链路跑通**：`siyuan-kit dev` 监听构建，每次落盘后把 `dist/<name>/` 镜像进假工作空间；目标目录里预先放的旧文件被正确清掉
- **同步的两道安全校验都实测生效**：目标目录没有清单 → 拒绝；清单里 name 不一致 → 拒绝。两种都会给出指向 `siyuan.config.json` 的报错，不会误删别人的插件目录
- **CJS 产物形状确认**：入口被打成 `module.exports = ...`，符合思源 `require` 的加载方式
- **`verify` 可用**：自比对报「与基线一致」，非法 zip 明确报错并退出 1

**实测踩到的两个坑（已写进 preset 注释，迁移时不用再踩）**

- Vite 8 底层已经是 **rolldown** 而不是 rollup。`rollupOptions` 仍然生效，但 `inlineDynamicImports` 这类 rollup 专有选项要在 P2 重新验证，不能照搬文档
- lib 模式的 CSS 命名有两层：必须先设 `build.lib.cssFileName`（否则直接报「package.json 里要有 name」），但**最终路径仍由 `assetFileNames` 决定**。只设 cssFileName 会产出 `assets/index-<hash>.css`，思源找不到样式

**仍需验证**

- `image-squeeze` 的 Worker 与 wasm：rolldown 下 `inlineDynamicImports` 能否替代现有的 `chunkLoading: "import-scripts"`，把 jsquash 的动态 import 内联掉
- `widget` preset：还没有拿真实的 `index.html` 跑过
- 主题的 `dev`：sass 没有 watch 钩子，目前只会在构建后同步一次，不会跟随改动
- 主题入口约定：Whisper 现在由 `builder/compile.mjs` 编译 `styles/`，实际入口名要确认后再固化

**需要你决定**

- 源码要不要镜像回 25 个仓库？镜像则 GitHub 上仍能看代码、issue 有上下文，但多一层失败面；不镜像则那些仓库的树停在搬家那天
- 迁移时保留各仓库历史（`git subtree add`，慢但完整）还是 squash 重开（快，旧历史留在旧仓库）
- 仓库可见性：私有还是公开（公开则 kit 的实现对外可见，命名要走 `@tcotc/*`）

**已知不迁移**

- `Neo-Plus`：只有 2.5 MB 的 `index.js`，无源码无 git
- `sy-theme-change`：纯产物目录
- `hello-siyuan`、`plugin-sample`：origin 指向 `siyuan-note/plugin-sample`，是上游样板的克隆；其中 `plugin-sample` 仍在集市清单里，处理时别弄丢
