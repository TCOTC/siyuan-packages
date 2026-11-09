# siyuan-packages

把散在 27 个目录、25 个 GitHub 仓库里的思源集市包收进一个源码仓库：**统一构建，各自发布**。

> **当前状态：已迁入 `plugins/highlight-search`、`plugins/move-doc`、`plugins/install-package`、`plugins/snippets`、`plugins/select-opened-doc`、`plugins/heatmap`、`plugins/siyuan-ttf-LXGWWenKaiGB-and-Twemoji`、`plugins/siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji`、`plugins/siyuan-plugin-openmoji-emoji`、`plugins/whisper-plus` 与 `plugins/temp-edit`，十一个旧仓库均已归档（只剩 `README.md`）。**
> 十一者都由 `pnpm --filter <name> build` 构建，产物与旧仓库的 `package.zip` 对拍一致（`move-doc` 只剩 `index.js` 的体积差异；`install-package` 的旧 `index.js` 经过混淆，体积不可比，已改用桩模块证明运行时行为一致；`snippets` 的 `index.js` 小 5.7%，静态资源逐字节相同、CSS 只有 minifier 等价重写；`select-opened-doc` 的 `index.js` 小 20%，静态资源逐字节相同，字符串字面量只差 webpack 运行时的三个；`heatmap` 的 `index.js` 小 10.6%，字符串字面量同样只差那三个，CSS 只有 minifier 等价重写；`siyuan-ttf-LXGWWenKaiGB-and-Twemoji` 的 `index.js` 小 19%，15 MB 字体在内的静态资源逐字节相同；`siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji` 的 `index.js` 小 18%，11 MB 鸿蒙字体在内的 18 个静态文件逐字节相同；`siyuan-plugin-openmoji-emoji` 的 `index.js` 小 33%，953 KiB 字体在内的 5 个静态文件逐字节相同；`whisper-plus` 的 `index.js` 小 17%，图标 / 预览图逐字节相同，字符串字面量只差 webpack 运行时三个、被 tree-shaking 的死代码与前缀常量折叠；`temp-edit` 的 `index.js` 小 17%，`i18n` 逐字节相同、清单与两份 README 只差 oxfmt 排版，字符串字面量只差 webpack 运行时三个，CSS 只有 minifier 等价重写），单测 / 类型检查 / lint 均已接入仓库根的那一套。
> **共享库 `siyuan-token-vault` 已迁入 `libs/token-vault`**，`install-package` 与 `snippets` 改用 `workspace:*` 直接从源码导入，不再依赖 GitHub 上的 git 哈希。
> 其余包仍按 README 末尾的迁移计划逐个搬。**每个包的迁移任务只有在旧仓库归档后才算完成**，规则见 9.1 ⑧。

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
├── libs/                 # 不发布到集市的共享库（源码被消费方直接打包）
│   └── token-vault/      # siyuan-token-vault：加密 Token 存储
├── kit/                  # 构建内核 @jeffrey-chen/siyuan-kit
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

根目录的规则很简单：三个类型目录装「要发布的东西」，`libs/` 装「会被打进别人产物、但自己不发布的库」，`kit/` 装「把前者变成 `package.zip` 的那个程序」。没有 `packages/`、也没有 `tooling/` 这类外层容器——每个都只有一个成员时，那层只增加路径长度，不承载任何语义。

`libs/*` 不是集市包：没有清单、没有 `build` 脚本、不进 `dist/`，`exports` 直接指向 `src/index.ts`（与 `kit` 一样不预编译）。消费方写 `workspace:*`，构建时由 vite 把它的 TS 源码一并编译进自己的 bundle，运行时没有额外加载。

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
    "@jeffrey-chen/siyuan-kit": "workspace:*",
    "siyuan": "catalog:"
  }
}
```

kit 从同目录的清单读 `name` / `version` / `icon` / `preview` / `readme`，按约定找 `src/index.ts` 和 `src/i18n/`，用清单里的 name 算出 `/plugins/<name>/` 作为 `base`。

`@jeffrey-chen/siyuan-kit` 必须写进 `devDependencies`（`workspace:*`），否则 pnpm 不会把 `siyuan-kit` 这个 bin 链进该包的 `node_modules/.bin`。

偏离约定用**同一套 API** 声明，而不是退回 webpack。目前已知需要 `build.config.ts` 的包：

| 包                                         | 需要什么                                                    | 怎么表达                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `image-squeeze`                            | 主入口 CJS + Worker 入口 IIFE；wasm 资源；自定义 base       | `passes: [{format:"cjs"}, {format:"iife", name, inlineDynamicImports}]`                                                                     |
| `plugin-sample`                            | 插件 CJS + 内核侧 ESM                                       | `passes: [{format:"cjs"}, {format:"es", entry:"src/kernel.ts"}]`                                                                            |
| `devtools`                                 | 构建前先打包 vConsole                                       | 保留 prebuild 脚本，`scripts.build` 里串联                                                                                                  |
| `highlight-search`                         | 旧 vite 配置里的自定义 define 与 CSS 改名                   | 已实测**无需** `build.config.ts`：preset 的 `define` 与 `assetFileNames` 原样覆盖，静态资源由 `collectStaticAssets` 复制                    |
| `siyuan-ttf-LXGWWenKaiGB-and-Twemoji`      | 15 MB 字体文件不能进模块图（会被当成 url() 依赖再打包一份） | `copy: ["LXGWWenKai/**/*", "Twemoji/**/*", "!**/*.bak"]`，原样复制到产物根；样式里写 `/plugins/<name>/...` 绝对 URL                         |
| `siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji` | 11 MB 字体文件不能进模块图（会被当成 url() 依赖再打包一份） | `copy: ["HarmonyOS_Sans/**/*", "Twemoji/**/*"]`，原样复制到产物根；样式里写 `/plugins/<name>/...` 绝对 URL                                  |
| `siyuan-plugin-openmoji-emoji`             | 953 KiB 字体文件不能进模块图；旧产物里还有根 `LICENSE`      | `copy: ["OpenMoji/**/*", "LICENSE"]`，原样复制到产物根；样式里写 `/plugins/<name>/...` 绝对 URL（`collectStaticAssets` 不复制根 `LICENSE`） |

这 7 个是**已知例外**，不是「以后再想」。迁移时逐个验证，不要强行套模板。

---

## 7. 依赖治理

- **一份 lockfile**：`pnpm-lock.yaml` 只有根目录一份
- **catalog 是唯一真相源**：升级思源 API 或构建工具只改 `pnpm-workspace.yaml` 里的 catalog，25 个包一起动
- **`siyuan` 用已发布版本，不用 git 短哈希**：19 种 pin 收敛成 1 行，lockfile 可复现、可缓存
- **仓内共享库用 `workspace:*`，不进 catalog、不用 git 依赖**：`libs/*` 的版本号只作记录，解析结果永远是 `link:../../libs/<name>`，不存在「两个消费方锁在不同提交」的可能
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

| 阶段   | 内容                                                                              | 验收标准                                                                                                                      |
| ------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **P0** | 骨架 + kit + 2 个试点包（`move-doc` 标准插件、`highlight-search` 现有 vite 配置） | 两个包 `pnpm build` 通过；`verify` 与旧产物对拍无缺文件；**旧仓库已归档**（只剩 `README.md`，见 9.1 ⑧）；在真实思源里装上能跑 |
| **P1** | 20 个标准插件机械迁移                                                             | 每个包都对拍 + 实机安装 + **旧仓库已归档**；`pnpm -r build` 全绿                                                              |
| **P2** | 4 个例外包：`image-squeeze`、`plugin-sample`、`devtools`、+ 有 `scripts/` 的三个  | 逐个人工验证，尤其是 `image-squeeze` 的 Worker 与 wasm；**旧仓库已归档**                                                      |
| **P3** | 主题（Whisper）+ 挂件（inline-elements）                                          | 产物结构与现有一致；主题在思源里渲染正常；**旧仓库已归档**                                                                    |
| **P4** | 接入 `publish.yml`，先 dry-run 再真发一个包                                       | 集市 Stage 能抓到新版本                                                                                                       |

**安全网（每个包都要做）**：用旧仓库的 `package.zip` 当基线，运行

```bash
siyuan-kit build
siyuan-kit verify --against ../old-package.zip
```

只报差异不自动判定：少文件是硬失败，体积变化与新增文件需要人看。构建系统迁移最危险的失败不是「构建失败」，而是「构建成功但运行时报错」，这在 CI 里不会红。

### 9.1 迁移笔记（临时，P1 完成后删）

`highlight-search` 迁完后总结出的通用做法，后面 24 个包照这个走。**这节是过程记录，不是长期文档**。

**① 旧仓库的 `package.zip` 基本不可信，别当基线。**
这里的 `package.zip` 是 `version 1.0.2` 的产物，而源码已经是 `1.0.3`（提示文案也改过）。直接拿它对拍，`verify` 报「一致」只证明了**文件清单**同名——内容差异被完全掩盖。正确做法是先 `git status` 确认旧仓库干净，用**旧工具链**（旧 `pnpm install` + 旧 `vite.config.ts`）重建一份，那才是基线。

**② `verify` 只比文件名与体积（默认 5% 容差），永远不比内容。**
通过它是必要条件，不是充分条件。补两步：逐文件 SHA-256 比对；文本资源用 `git diff --no-index --ignore-all-space --ignore-blank-lines` 复核——Windows 上旧产物是 CRLF、本仓强制 LF，`plugin.json` / `README*.md` / `i18n/*.json` 会字节不同而内容相同。

**③ 用 2×2 构建矩阵把「工具链漂移」和「自己的源码改动」分开。**

```
old toolchain × old source   ← 基线
new toolchain × old source   ← 差集 A = 工具链
new toolchain × new source   ← 差集 B = 你改的代码
```

对压缩产物，把 minifier 生成的 1–3 字符标识符**按首次出现顺序重编号**，再 diff 词元流，几百处「差异」会收敛到几处真的。经验值：vite 8.1.5 → 8.3.6 只会带来两类等价重写——函数体末尾的 `if (c) { f(); return } tail` → `c ? f() : tail`，以及常量折叠 `${800*2}px` → `1600px`。字符串字面量数量与内容应当**完全不变**，变了就是真改动。

**④ 要证明运行时等价，而不只是长得像。**
用桩模块顶掉 `siyuan`（`app` / `fetchSyncPost` / `Dialog` 用宽容 Proxy），在 jsdom 里加载产物、`new Plugin()` 后调 `onload()`，记录注册了什么：命令的 `langKey` / `hotkey`、图标、顶栏按钮、设置项、存储调用，然后 diff 两份记录。注意 `type: module` 的仓库会把 `.js` 产物当 ESM 加载，`require` 前先复制成 `.cjs`。

**⑤ 换构建系统时不要顺手改严格度。**
保留包原有的 `tsconfig`（这里是 `strict: false`），只修共享配置强制要求的：`Plugin` 成员的 `override`（`noImplicitOverride`）、以及 oxlint **error 级**规则（`no-new-array` 会让 CI 变红）。收紧类型另开一次提交。连带一条：`strictNullChecks` 关着时，基线的 `exactOptionalPropertyTypes` 必须显式关掉，否则 TS5052。

**⑥ 产物形状不能变。** 入口必须 `module.exports`（内核用 `require` 加载）；样式必须落在 `index.css`，不能是 `assets/index-<hash>.css`（内核按固定名找）。

**⑦ 不要拿源码目录当 `dev` 的同步目标。** `siyuan-kit dev` 会镜像并**删除**产物里没有的文件，指向 checkout 会清掉 `src/` 和 `.git`。

**⑧ 迁移的最后一步就是归档原仓库，必须当场做完，不许留到以后。**
迁移的定义是三步：**复制源码 → 产物对拍 → 归档原仓库**。前两步通过却把仓库原封不动留着，等于同时维持两套工具链和一个仍在漂移的源码副本，合仓要解决的第一个痛点立刻回来了。「等发布链路接好再归档」不是理由：集市按**旧仓库**的 `releases/latest` 取包（`util.FetchLatestReleaseZip` 走 `/releases/latest`，`plugins.txt` 只有 `owner/repo` 一行），所以旧仓库**不能删**，但仓库里的东西它一个都不用——归档不会影响任何一次发布，只会让源码只有一处。
归档后的目标状态：**仓库树与磁盘目录都只剩 `README.md`**（`git ls-tree -r HEAD` 只有一行，`Get-ChildItem -Force` 只有 `.git` 与 `README.md`），不留任何源码、工具链、清单、静态资源与产物，**也不留运行时文件**。

顺序本身就是规则的一部分，照抄不要跳步：

0. **先固定基线。** `git status` 必须干净；需要与新产物对拍就用**旧工具链**（旧 `pnpm install` + 旧 `webpack` / `vite`）重建一份 `package.zip`，**复制到仓库外**再动手（见 ①）。归档之后再也造不出这份基线。
1. **删掉 `.github/`**（整个目录）。`release.yml` 必须最先删：新仓发版会在旧仓库建 tag，`on: push: tags` 的旧工作流会再构建一遍并覆盖 release 资产（第 8 节第 2 条）；`check.yml` 已经没东西可查。
2. `git rm -r` 掉除 `README.md` 外的**全部受控文件**：`src/`、`tests/`、`tools/`、`webpack.config.js`（或 `vite.config.ts` / `build.config.ts`）、`eslint.config.mjs`、`tsconfig.json`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.gitignore`、`plugin.json`（`theme.json` / `widget.json`）、`icon.png`、`preview.png` / `preview.webp`、`LICENSE`、多语言 README。清单与静态资源只是「集市解压 zip 之后」读的那一份副本（`actions/stage/index.go`），仓库树里的留着没有意义。
3. 删掉未跟踪的产物与本机垃圾：`dist/`、`node_modules/`、`i18n/`、`index.js`、`index.css`、`package.zip`、`.idea/`、`.eslintcache`、`.preview/`、空的 `scripts/`。这些没被跟踪，`git rm` 删不到，要单独 `Remove-Item`。
4. README 按 ⑨ 的模板重写，然后提交（`.git` 必须留着：仓库本身和这条提交都在里面）。
5. **不要装回运行时文件。** 归档目录里出现 `index.js` / `index.css` / `i18n/` / `plugin.json` / `icon.png` / `preview.webp` 就等于又留下一份可漂移的产物副本，仓库树干净、磁盘上却堆着旧代码，下次谁看到都会以为它才是真相。仓库目录**必须只有 `README.md`**，`git status` 必须干净。
   - 迁移的起点常常就是 `<工作空间>/data/plugins/<name>`，两个身份压在同一条路径上。删完源码这个插件在思源里立刻失效，**这是预期结果，不是要修的故障**。
   - 要恢复使用只有一条正当路径：**从集市 release 重新安装**（新版本走第 8 节的 tag → `publish.yml`）。急用则临时把 `dist/<name>/` 装到**别的**插件目录名或另一台设备，用完删掉，不放回归档目录。
   - 需要保留旧产物的场合（复现问题、留证），用的是第 0 步存到仓库外的 `package.zip`，不是仓库目录里的散文件。

两条必须记住的连带事实：

- **`package.zip` 同时是 `verify` 的基线。** 归档删掉它以后想再对拍，只能从 GitHub release 重新下载；而那份会停在归档时的版本，源码已经比它新，**别当成基线用**（见 ①）。所以第 0 步的离线副本要留好。
- **归档不等于发布。** 归档只改旧仓库的树；集市看到的是 release 资产，一次发布都不会因此中断，也不会提前生效。真正的新版本仍要走第 8 节的 tag → `publish.yml`。

**⑨ 归档后的 README 就按这个模板写**，把 `<...>` 换掉即可（`highlight-search` 已是这个形态）：

```markdown
# <displayName.default>

Source code: [TCOTC/siyuan-packages](https://github.com/TCOTC/siyuan-packages/tree/main/plugins/<name>). This repository only hosts Bazaar releases.
```

三条要求：标题用清单里 `displayName.default` 的原文；链接必须指向 `plugins/<name>` 目录而不是仓库根；只讲「源码在哪、本仓库干什么」，不写迁移过程——过程记录留在本 README 的 9.1 节。

**⑩ 已发布的 `siyuan` 类型包可能落后于 petal 仓库 main。**
`move-doc` 用到的三处声明（`open-menu-doctree` 的 `effectiveSortMode` / `childrenSortMode`、`Title.getText()`、`Plugin.i18n` 是 `Record<string, string>`）在 npm 的 `siyuan@1.2.9` 里都没有，旧仓库是靠 `github:siyuan-note/petal#67d2f50` 拿到的。
按第 7 节的依赖治理**不要**把 catalog 换回 git 短哈希：把缺口收进包内的 `src/compat.ts`（只补实际用到的成员，注明对应的 petal 提交），并在 i18n 取值处用一次转换。catalog 升级后再删掉该文件、重新 typecheck 即可确认。

**⑪ 入口 import 了样式、但编译后没有任何规则时，vite 不产出 CSS 文件。**
典型是整份 SCSS 都是注释（`move-doc` 就是这样），旧 webpack 会留下 1 字节的 `index.css`。
**dev 与 build 这里刻意不同**：dev 补一个空 `index.css`（工作空间里看到的目录结构与真实插件一致，避免来回切换时文件忽有忽无）；build 不补——没有有效样式就不应有这个文件。
这也意味着 `move-doc` 的 `verify --against` 会把 `index.css` 报成「缺少文件」并退出 1，**这是预期偏差**，不是迁移失败。新包不要再为了让产物「有文件」去加无用样式规则。

**⑫ dev 与 build 的产物形态只有两处不同，不要合并。**
dev：不压缩 + inline sourcemap（在思源里直接打源码行号）；build：压缩 + 无 sourcemap（思源用 `eval` 加载，外链 `.map` 也解析不到）。其余（`base`、`external`、CSS 固定命名）两边一致，否则「本地能跑、装了包不行」。

**⑬ 打包进产物的依赖要同时写 catalog 与 overrides（`snippets` 实测）。**
`@codemirror/*` / `@lezer/*` 这类库既在 `dependencies` 里、又会带一串同族传递依赖。只写 catalog（哪怕是精确版本）时，pnpm 会为嵌套范围再解析一份更新的副本：
`tsc` 会把两份 `@codemirror/state` 的私有字段当成不同类型直接报错，产物里也会出现两套 parser 表。做法是把旧仓库 lockfile 的解析结果写进根 `pnpm-workspace.yaml` 的 `overrides`（目前只有 `snippets` 用这些包），升级时改一处即可。
另外 `@uiw/codemirror-theme-vscode@4.25.11` 的 ESM 产物 import 了 `@babel/runtime/helpers/extends` 却没声明该依赖（幽灵依赖），旧仓库靠顶层声明兜住，迁移时也要照写。

**⑭ 已发布 `siyuan` 类型升级后，旧代码可能只在类型层报错（`snippets` 实测）。**
`siyuan@1.2.6 → 1.2.9` 有两处破坏性类型变化：

- `Plugin.i18n` 从 `Record<string, string>` 变成 `Record<string, JSONValue>`。本插件有 200 余处 `this.i18n.xxx`，逐个 `as string` 不现实；在派生类里用 `declare i18n: Record<string, string>` 收窄一次即可（`Record<string,string>` 仍可赋给基类类型）。
- `fetchPost` 从返回 `void` 变成返回 `Promise`。单测里的同步回调桩需要在 `vi.mocked(fetchPost)` 处放宽一次类型（`as unknown as ReturnType<typeof vi.fn>`），运行期行为不变。
  这两项都是**只改类型断言、不改运行期代码**；`postReloadUI` 把回调放在 data 位的旧写法也原样保留（内核不读该参数），要修它属于另一次改动。

**⑮ oxfmt 重排会让静态资源与旧产物不再逐字节相同，按 ② 的方式复核。**
`plugin.json` / `README*.md` 只需 `git diff --no-index --ignore-all-space`；`i18n/*.json` 因为数组折行会产生成片行级差异，直接 `JSON.parse` 后比较更可靠。

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
- **`highlight-search` 原样迁入，不需要 `build.config.ts`**：旧 vite 配置只做三件事——注入 `process.env.*`、把 `style.css` 改名成 `index.css`、复制清单 / README / 图标与 `src/i18n`，三者分别由 preset 的 `define`、`assetFileNames` 和 `collectStaticAssets` 覆盖。`verify --against <旧 package.zip>` 报「与基线一致」，`index.css` 体积完全相同，`index.js` 只差 0.3%（vite 8.1.5 → 8.3.6），产物仍以 `require("siyuan")` 开头、`module.exports` 结尾
- **迁移没有顺手改代码**：包内 `tsconfig.json` 保留原来的 `strict: false`（收紧类型属于独立重构），只补了 `override` 修饰符与一个 `new Array(n)` 写法以满足仓库基线；单测 90 条全过
- **`move-doc` 标准插件迁入，不需要 `build.config.ts`**：`plugin.json` / README / 图标 / `i18n/*.json` 与旧产物逐字节相同（清单只被 oxfmt 重排空白）；`index.js` 从 7115 降到 5635 字节，多出来的只有 webpack 运行时（`use strict` / `Module` / `__esModule`）三个字符串字面量，其余 76 个新旧一一对应。`index.css` 是 1 字节空样式，按设计**不再产出**（见 9.1 ⑪），所以 `verify` 会报这一个缺失文件并退出 1——预期偏差，其余清单一致
- **dev 与 build 的形态差异已实测**：dev 产物 41504 字节、不压缩、末尾带 inline sourcemap，并额外补一个空 `index.css`；build 产物 5635 字节、压缩、无 sourcemap、无 `index.css`。`highlight-search`（样式有真实内容）两种模式都正常产出 `index.css`，说明这段补丁只作用于「编译结果为空」的情况
- **`move-doc` 的运行时行为用桩模块对拍过**：同一份桩 `siyuan` 下分别加载新旧 `index.js`，`onload`（事件订阅、两个设置项与下拉选项）、三种 `open-menu-doctree`（自定义排序 / 非自定义排序 / 笔记本）、`moveDocBeside` 与 `moveDocAsChild` 的 API 调用序列、`onunload` / `uninstall` 全部一致；只有 `src/compat.ts` 新增的 `?? ""` 多出一个空字符串字面量
- **归档后的旧仓库确实只剩 README**：`move-doc` 清完以后 `git ls-tree -r HEAD` 只输出 `README.md`，工作区目录也只有 `README.md` 与 `.git`，`git status` 干净；`plugin.json` / 图标 / `LICENSE` / 运行时文件都已从树与磁盘移除（顺序与坑见 9.1 ⑧）
- **`install-package` 迁入，不需要 `build.config.ts`**：清单 / 两版 README / 图标 / 预览图 / `i18n/*.json` 与旧产物**逐字节相同**（跑过 oxfmt 之后只剩换行与空白差异，JSON 解析后完全相等）；`index.css` 的规则与声明集合一致，差异只有 minifier 的等价重写（`flex:1 1 auto`→`flex:auto`、`column-gap`+`row-gap`→`gap`、`rgba(0,0,0,0)`→`#0000`、`@media(max-width: 860px)`→`@media(width<=860px)`）；`index.js` 从 373909 降到 133775 字节——旧产物经过 `webpack-obfuscator`，**体积与词元都对拍不了**，只能靠行为对拍
- **`install-package` 的运行时行为用桩模块对拍过**：同一份桩 `siyuan` + jsdom 下分别加载新旧 `index.js`，导出的键、4640 个图标的集合、三个自定义页签、两个事件订阅、顶栏按钮与四个命令、`onload` / `onunload` 全部一致
- **`install-package` 的单测保留 Node 自带 runner**：97 条用例都不需要 DOM，继续用 `node --test` + `tests/tsResolve.mjs` 的解析钩子（补无扩展名的相对导入），没有为了统一而改写成 vitest
- **内部共享库改为源码直连**：`siyuan-token-vault` 已从 `git+https://…#<提交>` 迁入 `libs/token-vault`，`exports` 指向 `src/index.ts`，消费方（`install-package` / `snippets`）写 `workspace:*`；`electron` 只用于取类型（`window.require("electron")`），必须在 `allowBuilds` 里显式写 `electron: false`，否则被跳过的构建脚本会让 `pnpm install` 直接退出 1
- **`siyuan-token-vault` 迁入后产物是语义等价的**：两个插件的 `index.js` 分别从 1324566 / 133775 降到 1323035 / 132238 字节（约 -1.5 KB），字符串字面量集合的差异**只有两类**——旧产物里由 ESM 模块包装带来的 `__esModule`、7 个导出名（`CURRENT_VERSION` / `KDF_ITERATIONS` / `encryptToken` 等）与一个空串/`"."` 消失，以及 `` `${CURRENT_VERSION}.` `` 被常量折叠成 `"v1."`；密文格式 / 种子拼接顺序 / 文件名派生均未改动，25 条库单测与 439 + 97 条消费方单测全过
- **`install-package` 的旧仓库已按 9.1 ⑧ 归档并当场验证**：`git ls-tree -r HEAD` 只剩 `README.md`，`.github/`（含 `release.yml`）、`src/`、`tests/`、`tools/`、`webpack.config.js`、`package.json`、`plugin.json`、图标与产物全部移除，磁盘目录同样只有 `.git` 与 `README.md`；该目录同时是测试空间里在用的插件，因此它现在在思源里失效——按规则这是预期结果，恢复走集市 release 重装
- **`snippets` 迁入，不需要 `build.config.ts`**：`plugin.json` / 四份 README / 图标 / 预览图解析后与旧产物**完全相等**（只有 oxfmt 的空白/换行差异）；`index.css` 的规则集合一致，差异只有 minifier 的等价重写（属性重排、`translateX(0)`→`translate(0)`、`transition: .25s`→`transition: all .25s`、`rgba(0,0,0,0)`→`#0000`、`::after`→`:after`、补 `-webkit-user-select`、**4 条相同的 `display:none!important` 规则被合并成 1 条选择器列表**）；`index.js` 从 1404110 降到 1324566 字节（-5.7%，webpack 运行时与重复模块消失），26 个新增字符串字面量是 rolldown 的模块包装标记、`siyuan-token-vault` 的导出名与 lezer 表的常量折叠结果
- **`snippets` 的运行时行为用桩模块对拍过**：同一份桩 `siyuan` + jsdom 下分别加载新旧 `index.js`，原型成员（12 个）与 `onload` 期间的动作序列（35 条：`addCommand` 两个、`Setting.addItem` 28 项、`loadData`、`eventBus.on("ws-main")` 等）完全一致；`onload` 结束后再等 50ms 让异步分支跑完，`onunload` 同样无差异
- **`snippets` 的单测迁到 vitest**：439 条用例全过（31 个文件），仍用 `tests/mocks/siyuan.ts` 作 `siyuan` 的 alias；`@vitest-environment jsdom` 文件头继续生效
- **`snippets` 的旧仓库已按 9.1 ⑧ 归档并当场验证**：`git ls-tree -r HEAD` 只剩 `README.md`，`.github/`、`src/`、`tests/`、`docs/`、`webpack.config.js`、`package.json`、`plugin.json`、图标与产物全部移除，磁盘目录只有 `.git` 与 `README.md`；该目录同样是测试空间里在用的插件，现在在思源里失效属预期，恢复走集市 release 重装
- **`select-opened-doc` 迁入，不需要 `build.config.ts`**：`plugin.json` / 三份 README / `LICENSE` / 图标 / 预览图 / `i18n/*.json` 与旧产物**逐字节相同**（SHA-256 全部一致）；`index.js` 从 5618 降到 4483 字节，用 acorn 解析后比对字符串字面量，差异只有 webpack 运行时带来的 `use strict` / `Module` / `__esModule` 三条，其余 52 条一一对应
- **`select-opened-doc` 的运行时行为用桩模块对拍过**：同一份桩 `siyuan` + jsdom 下分别加载新旧 `index.js`，覆盖桌面 / 移动端、有配置 / 无配置、无打开文档、无文件树模型五种场景；设置项的默认值、三个控件生成的 HTML、`saveData` 的载荷、`aria-label` 的改写与还原、左键 / 右键 / 轻触 / 长按四条交互（含长按后吞掉一次 `click`）、`collapseAll` 与 `selectItem` 的调用序列、`onunload` / `uninstall` 全部一致
- **`select-opened-doc` 只改了两处类型层代码**：`declare i18n: Record<string, string>` 收窄（1.2.9 把 `Plugin.i18n` 声明成 `Record<string, JSONValue>`）与四个生命周期方法的 `override`，运行期代码原样保留
- **`select-opened-doc` 的旧仓库已按 9.1 ⑧ 归档并当场验证**：`git ls-tree -r HEAD` 只剩 `README.md`，`.github/`、`src/`、`eslint.config.mjs`、`webpack.config.js`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`plugin.json`、`LICENSE`、图标与产物全部移除，磁盘目录只有 `.git` 与 `README.md`；该目录同样是测试空间里在用的插件，现在在思源里失效属预期，恢复走集市 release 重装
- **`heatmap` 迁入，不需要 `build.config.ts`**：旧仓库的 `package.zip` 生成于 7 月、早于 11 月的 HEAD，按 9.1 ① 先用旧工具链重建基线再对拍。`plugin.json` / 图标 / 预览图与基线**逐字节相同**；四份 README 被 oxfmt 重排（表格对齐），其中的截图地址同时改指向 monorepo 的 `plugins/heatmap/pic`，否则旧仓库归档后图片会 404；`index.js` 从 70463 降到 62962 字节，用 acorn 取字符串字面量（含模板字符串）后差异只有 webpack 运行时的 `use strict` / `Module` / `__esModule` 三条，其余 577 条一一对应；`index.css` 的 113 条规则全部保留，32 条声明差异全是 minifier 等价重写（属性重排、`overflow-x`+`overflow-y`→`overflow`、`container-type`+`container-name`→`container`、`::before`→`:before`、`@container (min-width: N)`→`(width>=N)`、`flex:1 1 auto`→`flex:auto`、省略 `transition` 的默认 `ease`、补 `-webkit-user-select`）
- **`heatmap` 的运行时行为用桩模块对拍过**：同一份桩 `siyuan` 下分别加载新旧 `index.js`，导出的键、37 个原型方法与 `onload` / `onLayoutReady` / `onunload` / `uninstall` 的 7 条可观察调用（图标、`loadData`/`removeData` 的 `config.json`、顶栏按钮、命令、`ws-main` 订阅与退订）完全一致；唯一差异是 `eventBus` 回调的函数名——webpack 压成 `anonymous`，vite 保留 `onWsMain`
- **`heatmap` 的单测迁到 vitest**：95 条用例（7 个文件）全部通过，断言仍用 `node:assert`；`siyuan` 只有 `.d.ts`、没有可运行 JS，在 `vitest.config.ts` 里 alias 到 `test/siyuan-stub.ts`（沿用原 `test/preload-siyuan.cjs` 的 `__heatmapSiyuanStub` 约定）
- **`heatmap` 的旧仓库已按 9.1 ⑧ 归档并当场验证**：`git ls-tree -r HEAD` 只剩 `README.md`（commit `3246602`），`.github/`、`src/`、`test/`、`pic/`、`webpack.config.js`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`dprint.json`、`eslint.config.mjs`、`plugin.json`、`LICENSE`、四份 README、图标与产物全部移除，磁盘目录只有 `.git` 与 `README.md`；该目录同样是测试空间里在用的插件，现在在思源里失效属预期，恢复走集市 release 重装
- **`siyuan-ttf-LXGWWenKaiGB-and-Twemoji` 迁入，需要 `build.config.ts` 的 `copy`**：两套字体（13.6 MB 的 woff 与 598 KiB 的 woff2）不能进模块图，否则 url() 会被 vite 当成依赖再打包一份；`collectStaticAssets` 只管清单 / README / 图标 / 预览图 / i18n，所以给 kit 补上了 `define.ts` 里早已声明却一直没实现的 `copy`（相对包根的 glob，`!` 前缀排除，命中的目录递归复制）。`index.js` 从 5832 降到 4710 字节，`index.css` 从 725 降到 697（`font-family:"LXGW WenKai"`→`LXGW WenKai`、`U+00A9`→`U+A9`、url 去引号都是 CSS 等价写法），其余 14 个文件（含两套字体、`OFL.txt`、`LICENSE-GRAPHICS`）**SHA-256 全部相同**
- **`siyuan-ttf-LXGWWenKaiGB-and-Twemoji` 的运行时行为用桩模块对拍过**：同一份桩 `siyuan` + jsdom 下分别加载新旧 `index.js`，`loadData` / 两个设置项（下拉四个选项、开关默认值）/ 四种作用范围的 `confirmCallback`（生成的 `#snippetCSS-<name>-override` 样式文本与 `saveData` 载荷）/ `#siyuanStyle` 被重写后重新生成规则 / `destroyCallback` / `onunload` / `uninstall` 的 `removeData` 全部一致，`document.fonts.load` 的三条预加载调用也一致
- **`siyuan-ttf-LXGWWenKaiGB-and-Twemoji` 的旧仓库已按 9.1 ⑧ 归档并当场验证**：`git ls-tree -r HEAD` 只剩 `README.md`，`.github/`、`src/`、`scripts/`、`LXGWWenKai/`、`Twemoji/`、`webpack.config.js`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`dprint.json`、`eslint.config.mjs`、`plugin.json`、`LICENSE`、两份 README 与产物全部移除，磁盘目录只有 `.git` 与 `README.md`；该目录同样是测试空间里在用的插件，现在在思源里失效属预期，恢复走集市 release 重装
- **`siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji` 迁入，沿用 LXGW 那套 `copy`**：四款 HarmonyOS Sans（基础 / 斜体 / SC / 阿拉伯语，合计 11 MB）与 Twemoji 不能进模块图，`build.config.ts` 只写 `copy: ["HarmonyOS_Sans/**/*", "Twemoji/**/*"]`（本包没有字形剥离脚本，不需要 `!**/*.bak`）。两套字体、`LICENSE.txt`、`LICENSE-GRAPHICS`、图标、预览图共 13 个文件**SHA-256 全部相同**；`plugin.json`、两份 README、`i18n/*.json` 只差 CRLF→LF 与 oxfmt 的空白（`git diff --ignore-all-space` 无输出）。`index.js` 从 6059 降到 4970 字节，acorn 取字符串字面量（含模板字符串）后 121→117，差异只有 webpack 运行时的 `use strict` / `u` / `Module` / `__esModule`；`index.css` 从 2158 降到 2105，差异只有 url 改成 `/plugins/<name>/...` 绝对路径、`font-family:"..."` 去引号、`U+00A9`→`U+A9`、末尾多一个 `/*$vite$:1*/`
- **`siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji` 的运行时行为用桩模块对拍过**：与 LXGW 同一套桩 `siyuan` + jsdom 脚本，覆盖 `zh-CN` / `en` / `ar` 三种语言 × 是否配置编辑器与全局字重，共 468 条记录；`loadData`、两个设置项（下拉四项、开关默认值）、四种作用范围 × 开关两态的 `preview` / `confirmCallback`（生成的 `#snippetCSS-<name>-override` 文本与 `saveData` 载荷）、`#siyuanStyle` 被重写后重新生成规则、`destroyCallback`、`onunload`、`uninstall` 的 `removeData`、`document.fonts.load` 的四条预加载全部一致。**唯二差异**是导出形态（webpack 的 `{default}` → cjs 的 `module.exports = class`，思源 loader 取 `.default || exports`，两种都认）与实例上多出的 `inlineStyleObserver: undefined` 字段
- **`siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji` 的旧仓库已按 9.1 ⑧ 归档并当场验证**：`git ls-tree -r HEAD` 只剩 `README.md`，`.github/`、`src/`、`HarmonyOS_Sans/`、`Twemoji/`、`webpack.config.js`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`dprint.json`、`eslint.config.mjs`、`tsconfig.json`、`plugin.json`、`LICENSE`、两份 README 与产物全部移除，磁盘目录只有 `.git` 与 `README.md`；该目录同样是测试空间里在用的插件，现在在思源里失效属预期，恢复走集市 release 重装
- **`siyuan-plugin-openmoji-emoji` 迁入，需要 `build.config.ts` 的 `copy`**：953 KiB 的 OpenMoji woff2 不能进模块图，`copy: ["OpenMoji/**/*", "LICENSE"]` 把它与字体自带的 `LICENSE.txt` 一起原样复制到产物根；根 `LICENSE` 也必须显式列出，因为 `collectStaticAssets` 只管清单 / README / 图标 / 预览图 / i18n，而旧 webpack 配置把它打进了 `package.zip`。字体 url 由 `../plugins/<name>/...` 改成 `/plugins/<name>/...` 绝对路径（思源把插件样式内联进 `<style>`，根路径下两者等价；vite 会为此打一条 "didn't resolve at build time" 警告，**预期，不是失败**）。`plugin.json`、两份 README 只差 CRLF→LF 与 oxfmt 空白（`git diff --no-index --ignore-all-space` 无输出），`icon.png`、`preview.png`、`LICENSE`、`OpenMoji/LICENSE.txt`、woff2 共 5 个文件**SHA-256 相同**；`index.js` 从 1304 降到 876 字节，acorn 取字符串字面量（含模板字符串）后 20→16，差异只有 webpack 运行时的 `use strict` / `u` / `Module` / `__esModule`；`index.css` 从 229 到 232，差异只有上面那条绝对 URL、`font-family:"OpenMoji"`→`OpenMoji`、`U+00A9`→`U+A9` 与末尾多一个 `/*$vite$:1*/`
- **`siyuan-plugin-openmoji-emoji` 的运行时行为用桩模块对拍过**：同一份桩 `siyuan` + jsdom 下分别加载新旧 `index.js`，原型成员（5 个）、`onload` 生成的 `#snippetCSS-<name>-override` 样式（两条 CSS 变量规则、挂在 `head`、重复 `onload` 不重复插入）、`document.fonts.load` 的预加载参数、`console.log` 与 `onunload` 的移除全部一致。**唯一差异**是导出形态（webpack 的 `{default}` → cjs 的 `module.exports = class`，思源 loader 取 `.default || exports`，两种都认）
- **`siyuan-plugin-openmoji-emoji` 的旧仓库已按 9.1 ⑧ 归档并当场验证**：`git ls-tree -r HEAD` 只剩 `README.md`，`.github/`、`src/`、`OpenMoji/`、`webpack.config.js`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`dprint.json`、`eslint.config.mjs`、`tsconfig.json`、`plugin.json`、`LICENSE`、两份 README 与产物全部移除，磁盘目录只有 `.git` 与 `README.md`；该目录同样是测试空间里在用的插件，现在在思源里失效属预期，恢复走集市 release 重装
- **`whisper-plus` 迁入，不需要 `build.config.ts`**：旧仓库的 `package.zip` 生成于 8/30、早于 11/8 的 HEAD（`plugin.json` 与图标 / 预览图都是旧的），按 9.1 ① 先用旧工具链（webpack 5.109.2 + esbuild-loader）重建基线再对拍。`icon.png` / `preview.png` **SHA-256 相同**；`plugin.json`、四份 README、`i18n/*.json` 与基线只差 CRLF→LF 与 oxfmt 空白（JSON 解析后完全相等，`README.md` 仅少一个末尾空行）。`index.js` 从 36430 降到 30200 字节：acorn 把字符串字面量与模板字符串合并统计后 343→339，仅旧的 9 条是 webpack 运行时的 `use strict` / `Module` / `__esModule` 与 `api.ts` 里三个**从未被引用**的导出（`setLocalStorageVal` / `getFile` / `removeFile`）的 URL 与请求头被 rolldown tree-shaking，仅新的 5 条是 `WHISPER_THEME_NAME` 常量折叠进各调用点。旧 `dist/index.css` 是 1 字节，但**生产构建本来就不产出 CSS**（入口没引样式），重建的基线与新产物都没有，不属于偏差
- **`whisper-plus` 的运行时行为用桩模块对拍过**：同一份桩 `siyuan` + jsdom 下分别加载新旧 `index.js`，快照了四个阶段——`onload`（1 个图标、1 个顶栏按钮、9 条命令、8 个 eventBus 订阅、`config.json` 落盘、一次旧配置迁移请求、html 上 8 个 `data-whisper-*` 属性）、打开顶栏菜单（8 个菜单项、4 条分隔线）、逐一点击全部菜单项与子菜单选项（6 个配色方案、3 个特性开关、顶栏融合、启停主题）、`onunload`（属性清除、按钮移除、菜单关闭）——两套产物的 JSON 快照**逐字节相同**
- **`whisper-plus` 只改类型层**：包内 `tsconfig.json` 关闭 `verbatimModuleSyntax` / `erasableSyntaxOnly`（原代码依赖参数属性与混合导入，与 `install-package` / `snippets` 同样的处理）、补 4 个生命周期方法的 `override`，并把两处 `plugin.i18n[...]` 按 1.2.9 的 `Record<string, JSONValue>` 收窄成 `string | undefined`；运行期代码未动。旧仓库没有单测，本包也未新增
- **`whisper-plus` 的旧仓库已按 9.1 ⑧ 归档并当场验证**：`git ls-tree -r HEAD` 只剩 `README.md`，`.github/`、`src/`、`webpack.config.js`、`eslint.config.mjs`、`dprint.json`、`tsconfig.json`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.gitignore`、`plugin.json`、`LICENSE`、四份 README、图标与产物全部移除，磁盘目录只有 `.git` 与 `README.md`；该目录同样是测试空间里在用的插件，现在在思源里失效属预期，恢复走集市 release 重装
- **`temp-edit` 迁入，不需要 `build.config.ts`**：旧仓库的 `package.zip` 与 HEAD 同一次构建，仍按 9.1 ① 用旧工具链（webpack 5.109.2 + esbuild-loader）重建基线后逐文件核对（SHA-256 全同）。`i18n/en.json` / `i18n/zh-CN.json` 与基线**逐字节相同**；`plugin.json` 只被 oxfmt 把 `frontends` 数组折成一行（`JSON.parse` 后完全相等），两份 README 只被 oxfmt 把 `*` 列表标记改成 `-`（`git diff --no-index --ignore-all-space` 只剩这一处，见 ⑮）。旧仓库根目录本来就没有 `icon.png` / `preview.png`（`CopyPlugin` 写了 `noErrorOnMissing`），基线 zip 里也没有这两个文件，新产物同样没有。`index.js` 从 4086 降到 3389 字节（-17%），acorn 取字符串字面量（含模板字符串）后 52→49，差异只有 webpack 运行时的 `use strict` / `Module` / `__esModule`；`index.css` 的 8 个选择器全部保留，差异只有属性重排、`flex:0 1 auto`→`flex:0 auto` 与末尾多一个 `/*$vite$:1*/`
- **`temp-edit` 的运行时行为用桩模块对拍过**：同一份桩 `siyuan` + jsdom 下分别加载新旧 `index.js`，覆盖 `onload`（页签注册、移动端直接返回）、`onLayoutReady`（顶栏按钮的图标 / 标题 / 位置）、点击顶栏 `openTab` 的 `custom` 载荷、`Custom.init` 挂载后的面板与空段落 HTML、Protyle 构造参数、`resize`、复制 Markdown（`lute.BlockDOM2StdMd` 入参与 `navigator.clipboard` 调用）、清空（`transaction` 的 do/undo 操作与 `focusBlock`）、已是空段落时只聚焦不产生事务、`destroy` 与 `onunload`——21 条记录的 JSON 快照**逐字节相同**
- **`temp-edit` 只改类型层**：补 3 个生命周期方法的 `override`，运行期代码未动。旧仓库没有单测，本包也未新增
- **`temp-edit` 的旧仓库已按 9.1 ⑧ 归档并当场验证**：`git ls-tree -r HEAD` 只剩 `README.md`（commit `8dcb496`，未 push），`.github/`、`src/`、`webpack.config.js`、`eslint.config.mjs`、`dprint.json`、`tsconfig.json`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.gitignore`、`plugin.json`、`LICENSE`、两份 README 与产物全部移除，磁盘目录只有 `.git` 与 `README.md`；该目录同样是测试空间里在用的插件，现在在思源里失效属预期，恢复走集市 release 重装

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
- 仓库可见性：私有还是公开（公开则 kit 的实现对外可见，命名要走 `@jeffrey-chen/*`）

**已知不迁移**

- `Neo-Plus`：只有 2.5 MB 的 `index.js`，无源码无 git
- `sy-theme-change`：纯产物目录
- `hello-siyuan`、`plugin-sample`：origin 指向 `siyuan-note/plugin-sample`，是上游样板的克隆；其中 `plugin-sample` 仍在集市清单里，处理时别弄丢
