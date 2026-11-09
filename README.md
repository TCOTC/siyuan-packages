# siyuan-packages

把散在 27 个目录、25 个 GitHub 仓库里的思源集市包收进一个源码仓库：**统一构建，各自发布**。

**本仓已收进 22 个**（20 插件 + 1 主题 + 1 挂件），其余 3 个不迁移（见第 9 节的「已知不迁移」）。

> **当前状态：22 个集市包已全部迁完**（20 插件 + 1 主题 `themes/Whisper` + 1 挂件 `widgets/inline-elements`），对应的旧仓库均已归档，只剩 `README.md`。每个包都由 `pnpm --filter <name> build` 构建，产物在仓库根的 `dist/`，`pnpm check` 校验 22 个包的结构契约。
> 逐包的对拍数据（文件清单 / SHA-256 / 行为记录）与迁移过程中总结的通用做法收在 [`docs/migration-notes.md`](docs/migration-notes.md)，那是过程存档，不是需要跟着代码维护的文档。
> **共享库 `siyuan-token-vault` 已迁入 `libs/token-vault`**，`install-package` 与 `snippets` 改用 `workspace:*` 直接从源码导入，不再依赖 GitHub 上的 git 哈希。

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
| 一个仓库只能承载一个包                  | `util.FetchLatestReleaseZip` 走 `/releases/latest`；`plugins.txt` 是纯 `owner/repo` 行，不支持子目录 | 每个包的收录仓库**必须保留**，不能合并成 1 个 |
| 集市只读最新 release 里的 `package.zip` | `actions/stage/index.go` 下载 zip 并解压，从 zip 内读清单、README、图标                              | 分发只需发 release 资产；仓库树内容不参与     |
| 资产名必须恰好是 `package.zip`          | `actions/util/release.go` 里 `asset.GetName() == "package.zip"`                                      | 产物命名不可自定义                            |
| prerelease 不参与索引                   | GitHub `/releases/latest` 忽略 prerelease                                                            | 自动发布必须直接建**正式** release            |
| `version` 单调递增且不带 `v` 前缀       | `rules/manifest.go`                                                                                  | 清单写 `1.0.2`，tag 写 `v1.0.2`，两者分工固定 |

**所以架构只能是：单源码仓 + 22 个发布端点 + 自动扇出。** 想让集市少收录几个仓库是没有路的。

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
├── plugins/              # 20 个插件，一个包一个目录
├── themes/               # 1 个主题（Whisper）
├── widgets/              # 1 个挂件（inline-elements）
├── libs/                 # 不发布到集市的共享库（源码被消费方直接打包）
│   ├── token-vault/      # siyuan-token-vault：加密 Token 存储
│   └── vconsole/         # Tencent vConsole 的官方预编译产物（vendored）
├── kit/                  # 构建内核 @jeffrey-chen/siyuan-kit
│   ├── src/
│   │   ├── define.ts     # 公开契约：BuildOptions / PassOptions
│   │   ├── resolve.ts    # 约定推断：包类型、清单、静态资源
│   │   ├── plan.ts       # 按包类型生成 BuildStep[]
│   │   ├── presets/      # plugin / widget / theme
│   │   ├── pack.ts       # 复制静态资源、打 zip
│   │   ├── sass.ts       # 主题：sass 编译 + icons/ 内联
│   │   ├── workspace.ts  # dev 同步进思源工作空间
│   │   ├── check.ts      # 仓库级契约门禁（pnpm check）
│   │   ├── create.ts     # 基于模板生成新包
│   │   └── cli.ts        # build / dev / check / create
│   └── templates/        # 新建包的骨架（不在 workspace 里，不参与构建）
│       └── plugin/       # pnpm create:plugin <name> 复制这一份
├── docs/                 # 迁移过程存档（不跟代码维护）
├── pnpm-workspace.yaml   # catalog：依赖版本唯一真相源
├── tsconfig.base.json    # 严格档基线
├── tsconfig.package.json # 宽松档基线（旧仓库原样迁入的包沿用）
├── .oxfmtrc.json         # 格式化规则（oxfmt）
├── .oxlintrc.json        # lint 规则（oxlint）
├── siyuan.config.example.json   # 本机工作空间配置的模板（真实配置不入库）
└── dist/                 # 所有产物（生成，gitignore）
```

根目录的规则很简单：三个类型目录装「要发布的东西」，`libs/` 装「会被打进别人产物、但自己不发布的库」，`kit/` 装「把前者变成 `package.zip` 的那个程序」。没有 `packages/`、也没有 `tooling/` 这类外层容器——每个都只有一个成员时，那层只增加路径长度，不承载任何语义。

`libs/*` 不是集市包：没有清单、没有 `build` 脚本、不进 `dist/`，`exports` 直接指向 `src/index.ts`（与 `kit` 一样不预编译）。消费方写 `workspace:*`，构建时由 vite 把它的 TS 源码一并编译进自己的 bundle，运行时没有额外加载。`libs/vconsole` 是唯一的例外形态：上游只发源码、打包需要一整套 svelte + webpack，仓内无法复现，所以直接放官方构建产物（入口指向 `dist/vconsole.min.js`，见第 7 节）。

包放在哪个类型目录下就决定它的类型：`plugins/*` → `plugin`，`themes/*` → `theme`，`widgets/*` → `widget`。类型决定清单文件名（`plugin.json` / `theme.json` / `widget.json`），与集市规则一一对应。

**目录名必须与清单里的 `name` 逐字符相同（含大小写），包内 `package.json` 的 `name` 也写同一个字符串。** 这不是排版偏好：`name` 同时决定产物目录 `dist/<name>`、思源安装目录 `data/<类型>/<name>`、归档旧仓库 README 里 `.../tree/main/<类型>/<name>` 那条链接，目录名一旦自己漂移（`Whisper-Plus` 曾写成 `whisper-plus`、`Whisper` 曾写成 `whisper`），同一个包就在四个地方有三种写法，看目录的人无从判断哪个是真实身份。所以 `siyuan-kit` 在 `resolvePackage` 里把它拦成**硬错误**，而不是警告。

代价只有一个：`pnpm --filter` 区分大小写，`--filter Whisper` 不能用小写写。这是保留集市身份的必然结果——改清单里的 `name` 会让思源装出一个新目录、集市收录记录也对不上，不能动。

**locale 标识一律用 BCP 47，且除 `zh-CN` / `zh-TW` / `pt-BR` 外都不带地区码。** 依据在思源自己的源码里：`kernel/model/conf_specs.go` 落盘前就把语言码归一成 BCP 47（`Conf.Lang = util.LangToBCP47(value.Lang)`），`kernel/bazaar/package.go` 的 `GetPreferredLocaleString` 按 `Conf.Lang` 查表，下划线写法（`zh_CN`）只是回退链里的兼容分支；`app/appearance/langs/` 下的 22 个文件就是标准全集。

同一条规则贯穿四个地方，必须一起改，只改一半就会静默失效：

| 位置                                                 | 例子                                        |
| ---------------------------------------------------- | ------------------------------------------- |
| 清单 `displayName` / `description` / `readme` 的 key | `"zh-CN"`、`"zh-TW"`、`"ja"`                |
| 多语言 README 文件名                                 | `README.zh-CN.md`、`README.ja.md`           |
| `src/i18n/*.json` 的文件名                           | `zh-CN.json`、`ja.json`                     |
| `src/index.ts` 里对 i18n JSON 的导入路径             | `import type zhCN from "./i18n/zh-CN.json"` |

`pnpm check` 会校验前两项，并检查清单声明的每个 README 都真实存在——这条能抓住「key 与文件名各改一半」。

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

新建插件不用手抄这套结构：

```bash
pnpm create:plugin my-plugin \
  --display-name "My Plugin" --zh-name "我的插件" \
  --description "What it does" --zh-description "它做什么"
```

它把 `kit/templates/plugin/` 复制成 `plugins/my-plugin/` 并替换 `{{name}}` / `{{displayName}}` / `{{author}}` / `{{year}}` 等占位符（清单、两份 README、`LICENSE` 与 `package.json` 都会带上新名字）。缺省的显示名由包名转成 Title Case，作者默认 `Jeffrey Chen`，`url` 默认 `https://github.com/TCOTC/<name>`。

模板与生成器一起放在 `kit/` 下，所以根目录不新增目录；模板不是 workspace 成员，也不会被 `kit/tsconfig.json` 扫到，`pnpm -r build` / `typecheck` / `test` 都不会碰它。生成后执行一次 `pnpm install` 把新包接进 workspace，再 `pnpm --filter <name> dev` 即可。占位符清单见 `kit/templates/README.md`。

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

标准包**零构建配置**，`package.json` 只有一行脚本（`typecheck` 由根目录 `pnpm -r` 驱动）：

```json
{
  "name": "move-doc",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "siyuan-kit build",
    "dev": "siyuan-kit dev",
    "typecheck": "tsc -p ."
  },
  "devDependencies": {
    "@jeffrey-chen/siyuan-kit": "workspace:*",
    "siyuan": "catalog:",
    "typescript": "catalog:"
  }
}
```

有单测的包再加 `"test": "vitest run"` 与 `vitest` 依赖；需要 DOM 的包自己加 `vitest.config.ts` 的 `environment: "jsdom"`，`siyuan` 是纯类型包，测试里要 alias 到桩。

kit 从同目录的清单读 `name` / `version` / `icon` / `preview` / `readme`，按约定找 `src/index.ts` 和 `src/i18n/`，用清单里的 name 算出 `/plugins/<name>/` 作为 `base`。

`@jeffrey-chen/siyuan-kit` 必须写进 `devDependencies`（`workspace:*`），否则 pnpm 不会把 `siyuan-kit` 这个 bin 链进该包的 `node_modules/.bin`。

偏离约定用**同一套 API** 声明，而不是退回 webpack。22 个包里只有 7 个需要 `build.config.ts`，全部是「有东西不在 vite 模块图里」或「需要多入口」：

| 包                                         | 需要什么                                                | 怎么表达                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `image-squeeze`                            | 主入口 CJS + Worker 入口 IIFE；wasm 由 `new URL` 引用   | `passes: [{format:"cjs"}, {format:"iife", name, inlineDynamicImports}]`，另加 `define: {"import.meta.url": "self.location.href"}`（iife 没有 `import.meta`，见下） |
| `code-recognition`                         | wasm 与两份第三方许可不在模块图里                       | `copy: ["wasm/**/*", "THIRD_PARTY-*-LICENSE"]`，原样复制到产物根                                                                                                   |
| `flomo-web`                                | 主进程挂钩脚本由 `remote.require()` 按路径加载          | `copy: ["devtools-hook.cjs"]`                                                                                                                                      |
| `siyuan-ttf-LXGWWenKaiGB-and-Twemoji`      | 14 MB 字体不能进模块图（会被当成 url() 依赖再打包一份） | `copy: ["LXGWWenKai/**/*", "Twemoji/**/*", "!**/*.bak"]`；样式里写 `/plugins/<name>/...` 绝对 URL                                                                  |
| `siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji` | 11 MB 字体不能进模块图                                  | `copy: ["HarmonyOS_Sans/**/*", "Twemoji/**/*"]`，同上                                                                                                              |
| `siyuan-plugin-openmoji-emoji`             | 953 KiB 字体不能进模块图；旧产物里还有根 `LICENSE`      | `copy: ["OpenMoji/**/*", "LICENSE"]`（`collectStaticAssets` 不复制根 `LICENSE`）                                                                                   |
| `inline-elements`                          | 生产构建要去掉 `console.*`（旧仓库的 `dropConsole`）    | `dropConsole: true`：挂件 preset 把它传给 rolldown 的 `output.minify.compress.dropConsole`，dev 不生效                                                             |

这 7 个是**已知例外**，不是「以后再想」。新增条目必须先登记到 `kit/src/check.ts` 的 `ALLOWED_BUILD_CONFIG`（附理由），否则 `pnpm check` 会红——防止后续有人随手加一份配置绕过约定。

两个已经归零的历史例外：`highlight-search` 的自定义 define / CSS 改名已由 preset 覆盖，`devtools` 的 vConsole 预编译由 `libs/vconsole` + `workspace:*` 解决，两者都不再需要 `build.config.ts`。

`copy` 的规则：相对包根的 glob，`!` 前缀排除，命中的目录递归复制，目标保持包内相对路径。所以字体与 wasm 在产物里的位置与源码里一致，运行期直接用 `/plugins/<name>/...` 绝对 URL 访问，vite 既不改写也不会再打包一份。

### 6.1 tsconfig 只有两档

包内 `tsconfig.json` 只写 `extends` 与 `include`，不许自创第三份基线：

| 基线                    | 严格度                                                                  | 谁用                                                                          |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `tsconfig.base.json`    | `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`    | `kit`、`libs/token-vault`、`snippets` / `install-package` / `inline-elements` |
| `tsconfig.package.json` | `strict: false` + `noImplicitAny`（其余依赖 strictNullChecks 的项关掉） | 其余 18 个从旧仓库原样迁入的包                                                |

新包默认走严格档。旧包保留宽松档是**刻意的**——换构建系统不顺手改类型严格度，收紧属于独立重构。

`include` 不能放进共享基线：TS 的 `include` 相对声明它的配置文件解析，写进根配置会指向仓库根的 `src/`，落到每个包上就是空集合。

### 6.2 契约门禁：`pnpm check`

约定写在文档里只有人读，人会忘。`siyuan-kit check` 把「构建阶段就能判定」的那部分约定变成一条会变红的检查，遍历 `{plugins,themes,widgets}/*`：

| 检查项      | 具体规则                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| 身份一致    | 目录名 == 清单 `name` == `package.json` 的 `name`（逐字符，含大小写）                                        |
| 脚本入口    | `build` 必须是 `siyuan-kit build`，`dev` 必须是 `siyuan-kit dev`                                             |
| 测试        | 有 `src/**/*.test.ts` 或 `tests/` 就必须有 `test` 脚本且为 `vitest run`                                      |
| tsconfig    | 必须 extends 仓库根的 `tsconfig.base.json` 或 `tsconfig.package.json`                                        |
| 配置白名单  | 有 `build.config.ts` 就必须在 `ALLOWED_BUILD_CONFIG` 里                                                      |
| locale      | 清单的 `displayName` / `description` / `readme` / `title` key 与 `src/i18n/*.json` 文件名必须是 BCP 47       |
| README 存在 | 清单 `readme` 声明的每个文件都必须存在                                                                       |
| 产物位置    | 包目录里不允许出现 `dist/` / `package.zip` / `index.js` / `index.css` / `i18n/`                              |
| 约定入口    | 没有 `build.config.ts` 时，`src/index.ts`（插件）/ `index.html`（挂件）/ `styles/index.scss`（主题）必须存在 |

CI 在 `format:check` 之前跑它：结构错了，后面的检查都跑在错的输入上。

---

## 7. 依赖治理

- **一份 lockfile**：`pnpm-lock.yaml` 只有根目录一份
- **catalog 是唯一真相源**：升级思源 API 或构建工具只改 `pnpm-workspace.yaml` 里的 catalog，22 个包一起动
- **`siyuan` 类型包钉在 petal 的具体提交上，且全仓只有一个 pin**：19 种 pin 收敛成 1 行。当前是 `github:siyuan-note/petal#edc4b0494a`——插件真正需要的几处声明（`Plugin.i18n` 是 `Record<string, string>`、`open-menu-doctree` 的排序字段、`Title.getText()`）还没发到 npm，只存在于 main
  - 这是「唯一真相源」的例外，不是回到 git 依赖满天飞：一处 pin、一处升级，lockfile 仍然可复现（codeload tar.gz 带内容哈希）
  - petal 发布含这些声明的版本后，改回 `"1.3.0"` 并重新 typecheck 即可；届时应顺手删掉各包残留的类型垫片
- **仓内共享库用 `workspace:*`，不进 catalog、不用 git 依赖**：`libs/*` 的版本号只作记录，解析结果永远是 `link:../../libs/<name>`，不存在「两个消费方锁在不同提交」的可能
- **源码在仓内构建不了的预编译产物也放 `libs/*`**：`libs/vconsole` 是 Tencent vConsole 的官方构建产物（npm 上最新是 3.15.1，而 `devtools` 需要未发布的 3.16.0-alpha），旧仓库靠 git submodule + `postinstall` 在本地编一份。合仓后 submodule 与「安装即编译」都不成立，改为把 `dist/vconsole.min.js` / `dist/vconsole.min.d.ts` / `build/vendor.d.ts` / `LICENSE` 连同上游提交号一起提交进 `libs/vconsole`，消费方照常用 `workspace:*`。`libs/vconsole` 的 `dist` / `build` 已从 oxfmt 与 oxlint 的扫描范围里排掉，更新方式写在它自己的 README 里（换上游提交、覆盖产物）
- **关闭 `shamefully-hoist`**：原 Whisper 开了，其余包没开。合仓后 `.npmrc` 只有根一份，开了等于把全部插件的依赖解析拍平，幽灵依赖会被静默解析成功。保持 pnpm 默认的隔离式 `node_modules`，让幽灵依赖在构建期就报错
- **不用 `overrides` 压平依赖副本**：清单写范围或精确版本，版本由 lockfile 钉住。一旦上游把最低要求提到高于我们 pin 的版本，pnpm 会解析出两份同族依赖，`tsc` 会把两份实例的私有字段当成不同类型直接报错——这个错误恰好提示该升级 catalog 了；而 `overrides` 会把旧版本静默塞给要求新版的包，编译能过、运行期缺 API
- **machine 相关的配置不进仓库**：registry、`store-dir` 留在用户级 `~/.npmrc`；CI 跑在 ubuntu-latest，仓库里硬编码 Windows 路径会直接把 CI 弄坏
- **仓库里没有 `.npmrc`，这是刻意的**：pnpm 默认就是隔离式 `node_modules`，不需要任何配置。不要为了图快加 `shamefully-hoist=true`——那会把全部插件的依赖解析拍平，让幽灵依赖在构建期静默通过，最后表现为「本地能构建、换台机器解析不到」

---

### 7.1 格式化与 lint

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

### 7.2 根目录脚本

| 命令                              | 作用                                             |
| --------------------------------- | ------------------------------------------------ |
| `pnpm build`                      | `pnpm -r build`，全量构建 22 个包                |
| `pnpm --filter <name> build\|dev` | 只构建 / 监听一个包（**`--filter` 区分大小写**） |
| `pnpm check`                      | 契约门禁，见 6.2                                 |
| `pnpm typecheck`                  | `pnpm -r typecheck`（`tsc -p .`）                |
| `pnpm test`                       | `pnpm -r test`（vitest）                         |
| `pnpm lint` / `pnpm format`       | oxlint / oxfmt                                   |
| `pnpm create:plugin <name>`       | 基于 `kit/templates/plugin` 新建包               |

CI 顺序：`install --frozen-lockfile` → `check` → `format:check` → `lint` → `typecheck` → `test` → `build`。

---

## 8. 发布链路

```
monorepo 打 tag `move-doc/v1.0.3`
        │
        ├─ 从 github.ref_name 切出 package=move-doc、version=1.0.3
        ├─ 校验：tag 格式 / 包目录存在 / 清单 version == tag / 目录名 == 清单 name
        ├─ 从清单 url 推导目标仓库（回退 TCOTC/<name>）
        ├─ 只构建这一个包（不是全量）→ dist/move-doc.zip
        ├─ cp dist/move-doc.zip package.zip     ← 集市按资产名找，必须改名
        └─ gh release create v1.0.3 --repo TCOTC/move-doc package.zip
               └─ 必须是正式 release，不能是 prerelease
                ↓
        bazaar Stage 下一轮抓到新 release → 集市可见
```

命令就一句：

```bash
# 改完清单里的 version 后
git tag move-doc/v1.0.3 && git push origin move-doc/v1.0.3
```

`workflow_dispatch` 保留做 dry-run（`dry_run` 默认 true）：只构建、校验 zip 根目录有清单，不创建 release。

三个容易做错的地方：

1. **用 PAT，不能用 `GITHUB_TOKEN`**。`GITHUB_TOKEN` 只能写当前仓库，跨 22 个收录仓库需要 fine-grained PAT（`contents: write`），存在 `PUBLISH_TOKEN`。
2. **目标仓库的 `release.yml` 必须删掉**。创建 release 会在目标仓库创建 tag，那会触发 `on: push: tags` 的旧 workflow，同一版本被构建两次、互相覆盖资产。
3. **不要用「推 tag 让目标仓库自己构建」**。那等于保留 22 份 lockfile 和 22 份工具链，痛点什么都没变。

集市侧**不需要任何 PR**：22 个包已经都在 `plugins.txt` / `themes.txt` / `widgets.txt` 里，收录记录不会因为换源码仓而变化。集市按**旧仓库**的 `releases/latest` 取包（`util.FetchLatestReleaseZip`），所以那些仓库不能删，但仓库树里的东西它一个都不用——这就是「归档到只剩 README」可行的原因。

---

## 9. 迁移进度

| 阶段   | 内容                                                                 | 状态                                                               |
| ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **P0** | 骨架 + kit + 2 个试点包（`move-doc`、`highlight-search`）            | 已完成                                                             |
| **P1** | 标准插件机械迁移                                                     | 已完成                                                             |
| **P2** | 例外包：`image-squeeze`、`devtools`、`code-recognition`、`flomo-web` | 已完成（`plugin-sample` 不归本仓管）                               |
| **P3** | 主题 `Whisper` + 挂件 `inline-elements`                              | 已完成                                                             |
| **P4** | 接入 `publish.yml`                                                   | tag 触发已就位，**尚未在真实仓库上实发过一次**（首次发版需人工盯） |

22 个包的旧仓库全部已归档（只剩 `README.md`）。逐包的对拍数据与归档 commit 见 [`docs/migration-notes.md`](docs/migration-notes.md)。

**已知不迁移**：`Neo-Plus`（只有 2.5 MB 的 `index.js`，无源码）、`sy-theme-change`（纯产物目录）、`hello-siyuan` / `plugin-sample`（上游样板的克隆；`plugin-sample` 仍在集市清单里，但不是本仓的包）。

**规矩（以后新增包也适用）**：迁移 = 复制源码 → 产物对拍 → 归档旧仓库，三步必须在同一次任务里做完。「等发布链路接好再归档」不是理由——集市读的是 release 资产，归档不影响任何一次发布。归档后的仓库目录只允许 `.git` 与 `README.md`，**绝不能装回运行时文件**（`index.js` / `i18n/` / `plugin.json` 都不是真相，下次谁看到都会以为它是）。归档后那个目录里在用的插件会在思源里失效，这是预期结果，恢复只能走集市 release 重装。

---

## 10. 验证方式

迁移期每个包都做过三重对拍，这套方法仍然适用于任何「换构建系统 / 大版本升级」的改动：

1. **静态资源逐文件 SHA-256**：清单、README、图标、预览图、`i18n`、字体、wasm 应当**完全相同**；文本资源若只因 CRLF→LF 或 oxfmt 空白不同，用 `git diff --no-index --ignore-all-space` 证明。
2. **`index.js` 比字符串字面量集合，不比体积**：用 acorn 取 `Literal` 与 `TemplateElement` 后做集合 diff。与旧产物相比通常只差 webpack 运行时的 `use strict` / `Module` / `__esModule`（vite 用 rolldown，没有那层包装），一条不少就是等价。
3. **运行时行为用桩模块对拍**：桩掉 `siyuan`（`app` / `fetchSyncPost` / `Dialog` 用宽容 Proxy），在 jsdom 里加载新旧产物，`new Plugin()` 后走完 `onload` / `onLayoutReady` / 交互 / `onunload`，把可观察调用（`addCommand` / `addTopBar` / `Setting.addItem` / `saveData` / `eventBus.on` …）序列化成 JSON 再比。

构建系统迁移最危险的失败不是「构建失败」，而是「构建成功但运行时报错」——后者在 CI 里不会红。逐包的记录见 [`docs/migration-notes.md`](docs/migration-notes.md)。
