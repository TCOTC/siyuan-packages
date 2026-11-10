# 仓库规则

集市包的源码收在一处，共享一套构建契约。其中能在构建阶段判定的部分由 `pnpm check` 拦住（第 6 节）。

---

## 1. 集市约束

以下五条决定仓库形态，依据是集市（bazaar）源码：

| 约束                                    | 依据                                                                                                 | 对架构的影响                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 一个仓库只能承载一个包                  | `util.FetchLatestReleaseZip` 走 `/releases/latest`；`plugins.txt` 是纯 `owner/repo` 行，不支持子目录 | 每个包的收录仓库必须保留，不能合并成 1 个 |
| 集市只读最新 release 里的 `package.zip` | `actions/stage/index.go` 下载 zip 并解压，从 zip 内读清单、README、图标                              | 分发只需发 release 资产；仓库树内容不参与 |
| 资产名必须恰好是 `package.zip`          | `actions/util/release.go` 里 `asset.GetName() == "package.zip"`                                      | 产物命名不可自定义                        |
| prerelease 不参与索引                   | GitHub `/releases/latest` 忽略 prerelease                                                            | 自动发布必须直接建正式 release            |
| `version` 单调递增且不带 `v` 前缀       | `rules/manifest.go`                                                                                  | 清单写 `1.0.2`，tag 写 `v1.0.2`           |

即「单源码仓 + 每个包一个发布端点」，不是把全部包并成一个集市包。

---

## 2. 目录与身份

### 2.1 类型目录与支撑目录

```
plugins/          发布包，类型 plugin  → 包内 manifest.json，产物 plugin.json
themes/           发布包，类型 theme   → 包内 manifest.json，产物 theme.json
widgets/          发布包，类型 widget  → 包内 manifest.json，产物 widget.json
libs/             不发布的共享库
kit/              构建内核 @jeffrey-chen/siyuan-kit
```

目录决定类型。**包内清单与产物清单不同名**：手写的那份统一叫 `manifest.json`，产物里那份按集市要求叫 `plugin.json` / `theme.json` / `widget.json`。同名会让人分不清哪个该改、哪个是生成结果，也容易把缺 `name` / `url` 的源清单直接当产物发出去。

`libs/*` 不是集市包：无清单、无 `build` 脚本、不进 `dist/`，`exports` 指向 `src/index.ts`，由消费方 vite 一并编译进 bundle。

`libs/vconsole` 是唯一例外：上游只发源码、打包需要整套 svelte + webpack，仓内无法复现，所以直接提交官方构建产物（更新方式见该目录 README）。

**写新代码前先看 `libs/*` 是否已有对应能力**，别在包内再抄一份。当前共享能力：

| 目录                   | 提供                                                                                                                          | 备注                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `libs/kernel-client`   | 内核 HTTP 传输、响应包络归一、文件读写                                                                                        | 只服务直接走 `fetch` 的包；用宿主导出 `fetchPost` / `fetchSyncPost` 的包保留自己的封装（宿主行为不同，见该目录注释） |
| `libs/plugin-env`      | `isMobileFrontend()` / `isDesktopClientFrontend()`                                                                            | 判定必须走宿主 `getFrontend()`，不要嗅探 UA                                                                          |
| `libs/custom-tab`      | 自定义页签的新建 / 复用 / 按类型查找                                                                                          | 复用按页签类型判定，不依赖 `custom.data`                                                                             |
| `libs/html-safety`     | `escapeHtml`、`safeExternalUrl`                                                                                               | 拼 HTML 字符串、渲染外部链接一律走这里                                                                               |
| `libs/token-field`     | 令牌输入框遮蔽策略与类名                                                                                                      | 类名要与消费方 `index.scss` 的同名选择器一致                                                                         |
| `libs/version-compare` | `compareCoreVersions` / `isVersionInRange`（只比核心数字，预发布按核心数字归类）、`compareSemver`（严格 2.0.0，判「谁更新」） | 两种口径语义不同，**不要合并**；发布检测脚本也 import 这一份（Node 26 直接跑 `.ts`）                                 |
| `libs/i18n-types`      | `SameKeys` / `Equal` / `AssertTrue`                                                                                           | 纯类型，`import type` 引用                                                                                           |

### 2.2 目录名 == 清单 `name` == `package.json` 的 `name`

三者逐字符相同（含大小写）。清单里的 `name` 现在**由构建从目录名推导**，所以真正要维护的只有两处：目录名与 `package.json` 的 `name`，`resolvePackage` 里是**硬错误**。`name` 决定 `dist/<name>`、`data/<类型>/<name>` 与发布仓库 `TCOTC/<name>`，任何一处漂移都会让同一个包出现多种写法。

代价是 `pnpm --filter` 区分大小写。改 `name` 会让思源装出新目录、集市收录记录也对不上，所以不能改。

### 2.3 locale 一律 BCP 47

除 `zh-CN` / `zh-TW` / `pt-BR` 外不带地区码。思源落盘前就把语言码归一成 BCP 47（见 siyuan 仓库 `kernel/model/conf_specs.go`），下划线写法只是回退链里的兼容分支。

四处必须同步改，只改一半就会静默失效：

| 位置                                      | 例子                                        |
| ----------------------------------------- | ------------------------------------------- |
| 清单 `displayName` / `description` 的 key | `"zh-CN"`、`"zh-TW"`、`"ja"`                |
| 多语言 README 文件名                      | `README.zh-CN.md`、`README.ja.md`           |
| `src/i18n/*.json` 的文件名                | `zh-CN.json`、`ja.json`                     |
| `src/index.ts` 里对 i18n JSON 的导入路径  | `import type zhCN from "./i18n/zh-CN.json"` |

清单的 `readme` 字段由构建从包根的 `README*.md` 推导，不用手写；文件名不合规则的文件不会进产物，`pnpm check` 会报（`README_zh_CN.md` 这类下划线写法就是它拦下的）。前两项与 `src/i18n/*.json` 的文件名由 `pnpm check` 校验。

### 2.4 一个插件包的最小结构

```
plugins/move-doc/
├── package.json
├── manifest.json         # 清单的独有层：version / minAppVersion / displayName / description
├── icon.png
├── preview.png
├── README.md             # 多语言：README.zh-CN.md、README.ja.md …
└── src/
    ├── index.ts          # 默认入口
    └── i18n/*.json       # 会被复制到产物的 i18n/
```

包根不允许出现 `plugin.json` / `theme.json` / `widget.json`：那是产物清单的名字，`pnpm check` 会拦（改名漏改时会给 `git mv` 提示）。

主题的约定入口是 `styles/index.scss`，挂件的约定入口是包根的 `index.html`。

### 2.5 环境声明只在仓库根一份

样式模块（`*.scss`）的模块声明**只写在仓库根的 [`types/ambient/index.d.ts`](../types/ambient/index.d.ts)**，由 `tsconfig.base.json` 的 `typeRoots` + `types` 自动纳入每个包的编译：

```json
"typeRoots": ["./types", "./node_modules/@types"],
"types": ["node", "ambient"]
```

`typeRoots` 里的相对路径相对**声明它的那份配置文件**（仓库根）解析，所以包内不需要写 `include`，也不需要 `references`。

因此包内**不允许**再出现 `src/declarations.d.ts` / `env.d.ts` / `ambient.d.ts` / `global.d.ts`（这四种名字都是历史遗留，`pnpm check` 会拦）。真正属于某个包的全局类型写成 `src/types.d.ts`，一个包最多一份。

### 2.5.1 思源全局对象：用 `siyuan` 包自带的

`siyuan` 包的 `siyuan.d.ts` 已经写了：

```ts
declare global {
  interface Window extends Global {}
}
export interface Global {
  Lute: typeof Lute; // NewNodeID / EscapeHTMLStr / UnEscapeHTMLStr 都是静态方法
  siyuan: ISiyuan;
}
```

所以包内**不要**再手写 `interface Window { siyuan: …; Lute: … }`。只要包内任意文件 `import` 过 `siyuan`（插件几乎必然），`window.siyuan`、`window.Lute` 就有类型。

三条补充规则：

- **挂件里 `window.siyuan` 不存在**，一律走 `window.parent.siyuan`（`Window.parent` 的类型是同一个 `Window`，所以不需要额外的 `declare global`）。挂件若没有别的文件 import `siyuan`，在 `src/types.d.ts` 里写一行 `import "siyuan";` 把类型拉进编译单元即可——这里 import 只为激活全局声明，产物里不会留下任何东西。
- **上游把 `config` / `menus` / `languages` 声明成可选**，但这些字段在页面就绪后必然存在。只有确实需要"非空"的包才写收窄（`siyuan: ISiyuan & { config: NonNullable<…> }`），目前只有 `snippets`；其余包用可选链（`window.siyuan.config?.fileTree`）就够了。**不要**把收窄提到仓库根的 `types/` 里——`typeRoots` 下的文件只能从仓库根解析模块，而仓库根不依赖 `siyuan`（各包各自通过 catalog 安装）。
- **上游漏声明的成员**（如 `Dialog.id`、`Dialog.destroyCallback`）用 `declare module "siyuan" { interface Dialog { … } }` 在包内补充；只给本包自创的成员（如 `destroyNative`）也写在同一个块里，并在注释中说明哪几个是内核字段、哪几个是本包约定。

### 2.6 源码文件名一律 kebab-case

`src/**` 下的 `.ts` / `.scss` / `.json` 文件名统一小写连字符：`package-sort.ts`、`install-history.ts`、`gen-list/render-list.ts`。目录名同样适用（`gen-list/` 而不是 `genList/`）。

例外只有两类：

- `README*` / `LICENSE*` / `THIRD_PARTY-*` 这类约定名；
- `src/i18n/` 下的 locale 文件名（`zh-CN.json`、`zh-TW.json`、`pt-BR.json`），它们是 BCP 47 标识，不是代码标识符。

`pnpm check` 会拦下 camelCase / PascalCase 的源码文件名。改名的同时用「符号级 rename」或 `git mv` + 全仓替换 import 路径，别只改一半。

### 2.7 README 不写 H1

集市详情页的页头已经展示包名与图标，README 里再写一遍 `# <displayName>` 只是噪音。所有 `README*.md` 都**不允许出现一级标题**，直接从正文或 `##` 开始，`pnpm check` 会拦。

### 2.8 i18n 一律是 JSON

界面文案只有一种形态：`src/i18n/<locale>.json`，代码里 `import type zhCN from "./i18n/zh-CN.json"` 拿到键名（`declare i18n: typeof zhCN` / `PluginI18n`），少一个键会在 tsc 阶段报错。目录里不允许出现非 JSON 文件。

各包的类型自查写法：`export type I18n = typeof en;` 再加一句键集合断言（`keyof` 双向 extends），多语言之间键不一致同样在 tsc 阶段报错。

三种包的差别只在构建：

| 包类型 | 文案如何进产物                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| 插件   | `src/i18n/` 整目录复制到产物 `i18n/`，内核按 `Conf.Lang` 注入 `Plugin.i18n`（siyuan 仓库 `kernel/model/plugin.go`） |
| 挂件   | **内核没有这条路径**：JSON 由代码导入、打包器内联进 `index.html`                                                    |
| 主题   | 无文案，不需要 i18n                                                                                                 |

### 2.9 测试布局

| 类型       | 位置               | 说明                                                            |
| ---------- | ------------------ | --------------------------------------------------------------- |
| 单元测试   | `src/**/*.test.ts` | 与源码同目录，跟着 `tsc` 一起被检查                             |
| 端到端测试 | `e2e/**/*.test.ts` | 包根独立目录，不进产物                                          |
| 测试替身   | `src/__mocks__/`   | 例如 `src/__mocks__/siyuan.ts`，`vitest.config.ts` alias 指过去 |

不允许 `tests/` 或 `test/`（单数/复数）目录，也不允许 `.test.mjs`：来源一是 Node 直接跑 TS 时的遗留，二是 webpack 时代的测试目录。`pnpm check` 会拦。

每个有测试的包都有 `vitest.config.ts`，写法全仓一致，`include` 固定为两项：

```ts
include: ["src/**/*.test.ts", "e2e/**/*.test.ts"];
```

除 `include` 外只允许两类差异：`resolve.alias`（把 `siyuan` 指向 `src/__mocks__/siyuan.ts`，且必须是绝对路径）与 `test.environment`（整包需要 DOM 时设 `jsdom`，如 `highlight-search`）。

### 2.10 清单分三层

包里的清单**不是集市读的那一份**，它只是覆盖层。集市读的是构建写进产物的完整清单。

| 层   | 字段                                                                                               | 写在哪                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 推导 | `name`、`url`、`readme`、`icon`、`preview`                                                         | 不写。`name` ← 目录名、`url` ← `TCOTC/<name>`、`readme` ← 包根 `README*.md`、`icon`/`preview` ← 包根同名图片 |
| 共用 | `author`、`funding`（顶层）；`backends`、`frontends`（按类型分节）                                 | [`manifests/base.json`](../manifests/base.json)                                                              |
| 独有 | `version`、`minAppVersion`、`displayName`、`description`、`disabledInPublish`、`keywords`、`modes` | 包内清单                                                                                                     |

合成顺序是「共用顶层 → 该类型分节 → 包内 → 推导」，后者覆盖前者；推导最后写入，不会被覆盖。字段按固定顺序输出，所以同一份源码两次构建出的清单逐字节相同。

推导字段的具体规则：

| 字段      | 来源                                                                         | 何时进清单                      |
| --------- | ---------------------------------------------------------------------------- | ------------------------------- |
| `name`    | 包目录名                                                                     | 总是                            |
| `url`     | `https://github.com/TCOTC/<name>`                                            | 总是                            |
| `readme`  | 包根 `README*.md`，`README.md` → `default`、`README.<locale>.md` → 该 locale | 至少有一个 README 时            |
| `icon`    | 包根 `icon.{png,webp,jpg,jpeg,avif}`，按此优先级取第一个                     | **文件名不是 `icon.png` 时**    |
| `preview` | 包根 `preview.{png,webp,jpg,jpeg,avif}`，同上                                | **文件名不是 `preview.png` 时** |

`icon` / `preview` 的默认名不写进清单：siyuan 仓库 `kernel/bazaar/bazaar.go` 的 `packageImageName(configured, legacyName)` 在 `configured` 为 nil 时直接返回 `legacyName`（即 `icon.png` / `preview.png`），所以「叫 icon.png」与「不声明」完全等价。文件名是 `preview.webp` 这类才需要声明。

图片文件**始终会复制进产物**（与是否写入清单无关）：`collectStaticAssets` 按同一个探测结果复制。扩展名必须在思源白名单 `png / jpg / jpeg / webp / avif` 内（`isSupportedPackageImageName`），放 `icon.svg` 既不进产物也拿不到 URL，`pnpm check` 会报。

四个规矩：

- **推导字段写进包内清单一律报错**（`resolvePackage` 直接抛）。写了也不生效，留着只会让下一个人以为它是真相。
- **`author` / `funding` 一律不得在包内声明**：它们是全仓统一的身份信息，只能写在 `manifests/base.json` 顶层。包内写一份会盖掉共用值，而且改 base 时同步不到——`pnpm check` 会直接报错。（历史遗留的 `code-languages` 旧值已于 2026-11-10 清除）
- **其余共用字段只在本包确实不同时才写**，且不得与 base 取值相同：相同即为冗余声明（删掉行为不变），`pnpm check` 会报。
- **`manifests/base.json` 只有两层**：顶层放三种包类型取值相同的字段（`author`、`funding`），`plugin` / `theme` / `widget` 分节放该类型特有的默认值（如 theme 没有 `backends`，widget 没有前后端）。同一个字段不许同时出现在两层——`pnpm check` 会报「与顶层重复」。
- **`backends` / `frontends` 里 `["all"]` 与省略等价**：内核 `IsTargetSupported` 遇到 `all` 直接返回兼容，所以「全平台」不要写成一长串枚举再加 `all`。
- **`disabledInPublish` 只对插件与挂件有效**：插件走 `CheckPluginAccessableInPublish`、挂件走 `CheckWidgetAccessableInPublish`（均在 siyuan 仓库 `kernel/model/publish_resource_access.go`），主题没有任何读取点，写了也不生效。插件与挂件必须显式声明（零值等价于 `false`），主题写了会被 `pnpm check` 报错。
- **`settingsWindow` 只在需要于独立设置窗口里加载时才写 `true`**：它不是「卡片上的设置入口」，而是「独立设置窗口中加载本插件」——siyuan 仓库 `kernel/model/plugin.go` 的 `LoadSettingsWindowPetals` 只返回声明了它的插件，`app/src/plugin/loader.ts` 再按 `=== true` 过滤。主窗口的插件设置不受影响；未声明的插件在用户开启「独立设置窗口」后点设置会静默无反应。目前只有三个字体包声明（OpenMoji / 鸿蒙黑体 / 霞鹜文楷，字体与表情开关要在设置窗口里预览）。`false` 与省略等价，主题与挂件不许写，`pnpm check` 都会拦。
- **包内键序固定为** `version` → `minAppVersion` →（`backends` → `frontends`）→ `disabledInPublish` → `displayName` → `description` →（`keywords` → `modes` → `settingsWindow`）。产物清单由 `MANIFEST_FIELD_ORDER` 重排，这里的顺序只影响源码可读性，照抄相邻包的写法即可。

想随时看某包合成后的清单：

```bash
siyuan-kit manifest plugins/move-doc
```

**Schema**：三份 schema 与共用清单同在 `manifests/`：`override.schema.json`（包内覆盖层）、`dist.schema.json`（产物清单）、`base.schema.json`（共用清单）。`.vscode/settings.json` 已把前两份绑到对应路径，写清单有补全与校验。schema 只服务编辑器体验，结构校验仍由 `pnpm check` 承担（不为它引运行时依赖）。

---

## 3. 产物契约

### 3.1 产物只在仓库根的 `dist/`

源码目录里永远不出现产物，`.gitignore` 只需一行 `/dist`。

```
plugins/move-doc/           源码  {manifest.json, README*.md, icon.png, preview.png, src/}
        └─▶ dist/move-doc/  产物  {index.js, index.css, plugin.json, README*.md, i18n/}
            dist/move-doc.zip       上传到 release 的那个包
```

发布脚本按约定取 `dist/<name>.zip`，不用遍历包目录；换机器、换工作空间路径都不用动包。

三条硬规定：

- zip 内不能多一层包装目录，清单必须在 zip 根
- 清单 `version` 不带 `v` 前缀；release tag 带 `v`
- `dist/` 与 `siyuan.config.json` 都 gitignore

产物里的清单是**生成**的（三层合并，见 2.10），不是从包目录复制。包目录里那份只是覆盖层，复制过去会变成缺 `name` / 缺 `url` 的半成品。

### 3.2 运行期形态

- 插件入口必须是 CommonJS（内核按 `require` 加载），不要改成纯 ESM。
- 样式必须落在 `index.css`，不能带哈希或进 `assets/`（内核按固定名找）。
- 入口 import 了样式但编译结果为空时，build 不产出 `index.css`，dev 补一个空文件。
- dev 与 build 只差两处：dev 不压缩 + inline sourcemap，build 压缩 + 无 sourcemap（`sync` 用 dev 口径）。`base` / `external` / CSS 命名两边一致，否则会「本地能跑、装了包不行」。

### 3.3 工作空间链接（dev / sync）

`siyuan-kit dev` 与 `siyuan-kit sync` 在工作空间里为产物目录建一个**目录链接**：

```
<工作空间>/data/<类型>/<name>  →  <仓库>/dist/<name>/
```

链接建一次就够，构建写的就是链接指向的那个目录，所以不存在「漏同步」：改完源码刷新思源就能看到新产物。
Windows 用**目录联接**（junction），不需要开发者模式或管理员权限；其它平台用符号链接。主题（sass）与插件/挂件一样适用。

`dev` 是持续监听：插件/挂件由 vite 的 `build.watch` 负责；主题是唯一不走打包器的形态，由 kit 用 `fs.watch` 盯住入口目录（递归，含 partial 子目录）、入口之外被 `@use` 引用过的目录与 `icons/`（sass 的 `compileAsync` 没有 watch API）。编译错误只打到控制台、不中断监听；`dev` **不清空产物目录**——它已经链进思源，先清后编一旦失败（SCSS 报错、进程 OOM）思源里就只剩一个空主题。

`sync` 是同一套产物口径（不压缩 + inline sourcemap）与链接的一次性版本：不监听、不产出 zip，跑完就退出。在仓库根裸跑即全部分发包（也可点名），在包目录里裸跑就是它自己。它同样**不清空产物目录**（目录已经链进思源），也**必须**有 `siyuan.config.json`——链接是这条命令的全部意义，缺文件直接报错，而不是像 `dev` 那样只构建不链接。

需要仓库根的 `siyuan.config.json`（gitignore，模板见 `siyuan.config.example.json`，照抄后改成自己的路径）：

```json
{
  "workspace": "D:/路径/到/思源工作空间(data文件夹的上一层)"
}
```

指向工作空间根目录（含 `data/` 的那一层）。**只有 `dev` / `sync` 读这份配置**：`dev` 缺文件时只构建不链接（同一批启动的进程里只提示一次），`sync` 缺文件直接报错；路径不存在、填成 `data` 本身、目录下没有 `data/` 各有报错。`build` / `check` 不读它，本机路径失效也不会让打包失败。

建链接时会校验已有目标：

- 已经是链到本包 `dist/<name>` 的链接 → 直接复用。
- 是**真实目录**（例如从集市装过的同一个包）→ 校验目录里的清单 `name` 与本包一致后删除，改成链接；不一致则拒绝，不会清掉别人的目录。
- 是**指向别处的链接** → 拒绝，不擅自删除。

链接是持久的：停掉 dev（或跑完 sync）之后它仍指向 `dist/<name>/`。要让思源恢复集市安装的版本，删掉这条链接（或整个 `dist/` 后重装）即可。

根目录的 `pnpm dev` 是 `siyuan-kit dev`，**必须指定包名**（`pnpm dev Whisper`，也接受 `themes/Whisper` 这种目录）。裸跑会报错并列出全部包名：一次拉起二十多个 watch 进程会把内存吃光，最先崩的是编辑器。要全部包时用根目录的 `pnpm dev:all`（`pnpm -r --parallel`，每包一个进程、各占一个堆）。点名多个包时在同一个进程里串行启动。

包枚举只有一份：`kit/src/resolve.ts` 的 `listPackages()`，`check`、`dev` 与 `sync` 共用，报错提示也从它取包名列表。

编辑器侧：仓库的 `.vscode/settings.json` 把 `dist/` 从 `files.watcherExclude`、`search.exclude` 与 `js/ts.tsserver.watchOptions.excludeDirectories` 里排除。构建产物每次重写都是成千上万个文件事件，不排除的话编辑器光靠监听就能被拖死（`files.watcherExclude` 默认只排 `node_modules` 与 `.git/objects`，**不排 `dist`**）。

---

## 4. 零配置与例外

标准包零构建配置，`package.json` 只有下面这些（`typecheck` 由根目录 `pnpm -r` 驱动）：

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

- 有单测的包再加 `"test": "vitest run"` 与 `vitest` 依赖；`vitest.config.ts` 的写法见 2.9。`siyuan` 是纯类型包，测试里 alias 到 `src/__mocks__/siyuan.ts`。
- `@jeffrey-chen/siyuan-kit` 必须写进 `devDependencies`（`workspace:*`），否则 `siyuan-kit` bin 不会链进该包。
- kit 从清单读 `version` / `displayName` / `description` 与共用段，再推导 `name` / `url` / `readme` / `icon` / `preview`，按约定找 `src/index.ts` 与 `src/i18n/`，用 name 算出 `/plugins/<name>/` 作为 `base`。

### 4.1 `build.config.ts` 白名单

偏离约定用同一套 API 声明。只有「有东西不在 vite 模块图里」或「需要多入口」才需要这份配置：

| 包                                         | 需要什么                                                | 怎么表达                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `image-squeeze`                            | 主入口 CJS + Worker 入口 IIFE；wasm 由 `new URL` 引用   | `passes: [{format:"cjs"}, {format:"iife", name}]`，另加 `define: {"import.meta.url": "self.location.href"}`（iife 没有 `import.meta`） |
| `code-recognition`                         | wasm 不在模块图里（运行期按绝对路径动态 import）        | `copy: ["wasm/**/*"]`，原样复制到产物根                                                                                                |
| `flomo-web`                                | 主进程挂钩脚本由 `remote.require()` 按路径加载          | `copy: ["devtools-hook.cjs"]`                                                                                                          |
| `siyuan-ttf-LXGWWenKaiGB-and-Twemoji`      | 14 MB 字体不能进模块图（会被当成 url() 依赖再打包一份） | `copy: ["LXGWWenKai/**/*", "Twemoji/**/*", "!**/*.bak"]`；样式里写 `/plugins/<name>/...` 绝对 URL                                      |
| `siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji` | 11 MB 字体不能进模块图                                  | `copy: ["HarmonyOS_Sans/**/*", "Twemoji/**/*"]`，同上                                                                                  |
| `siyuan-plugin-openmoji-emoji`             | 953 KiB 字体不能进模块图                                | `copy: ["OpenMoji/**/*"]`（字体自带的 `OpenMoji/LICENSE.txt` 一并复制）                                                                |
| `inline-elements`                          | 生产构建要去掉 `console.*`                              | `dropConsole: true`：挂件 preset 把它传给 rolldown 的 `output.minify.compress.dropConsole`，dev 不生效                                 |

这份表是**白名单**：新增条目必须先登记到 `kit/src/check.ts` 的 `ALLOWED_BUILD_CONFIG`（附理由），否则 `pnpm check` 会红。

`copy` 的规则：相对包根 glob，`!` 前缀排除，命中目录递归复制，目标保持包内相对路径。字体与 wasm 在产物里的位置与源码一致，运行期用 `/plugins/<name>/...` 绝对 URL 访问，vite 不改写也不会再打包一份。

---

## 5. tsconfig 只有两份基线

包内 `tsconfig.json` 只写 `extends` 与 `include`（必要时再补个别「更严」的开关），不许自创第三份基线：

| 基线                   | 严格度                                                                  | 谁用                  |
| ---------------------- | ----------------------------------------------------------------------- | --------------------- |
| `tsconfig.base.json`   | `strict` + `noImplicitOverride` + `verbatimModuleSyntax`                | 全部发布包 + 新包模板 |
| `tsconfig.strict.json` | base 之上再开 `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | `kit`、`libs/*`       |

默认档就是严格档：`strict` 全仓开启，没有「宽松档」。加强档只给那些「一个错误会扩散到很多包」的代码——kit 自身出错会让全部包的构建一起崩，`libs/*` 会被多个消费方的 tsc 程序一并检查。某个发布包整体重构时可以临时改成 `../../../tsconfig.strict.json` 收紧，`pnpm typecheck` 会列出要收的全部位置。

四条硬规则：

- **`target` 一律 `ES2022`**，没有例外。`target` / `lib` / `module` / `moduleResolution` 是编译事实，改一处就会改产物。
- **`include` 不能放进共享基线**：TS 的 `include` / `exclude` 相对「声明它的那个配置文件」解析，写进根配置会指向仓库根的 `src/`，套到每个包上就成了空集合。
- **包内只允许把检查调得更严**（`noUnusedLocals`、`noFallthroughCasesInSwitch` 这类）。`strict`、`verbatimModuleSyntax`、`target` 等由基线管辖，`pnpm check` 会拦住任何覆盖。
- **`verbatimModuleSyntax` 全仓开启**：纯类型导入必须写 `import type`。产物由 rolldown/esbuild 剥离类型，少写一个 `type` 就会让类型导入留进 bundle，运行期去找一个不存在的模块。

`kit` 自己额外叠两条只有它需要的开关：`allowImportingTsExtensions`（`bin` 直接指向 `src/cli.ts`，由 Node 剥离类型运行，导入必须带 `.ts`）与 `erasableSyntaxOnly`（禁掉 `enum` / `namespace` / 参数属性这类 Node 剥不掉的语法）。`allowImportingTsExtensions` 留在基线里是因为各包的 tsc 程序会顺带编译 kit 源码，它只是「允许」而非「强制」。

### 5.1 `types: ["node"]` 的副作用

基线给每个包注入了 `"types": ["node", "ambient"]`，因为单元测试（`node:assert/strict`）、`vitest.config.ts` 与 `build.config.ts` 都跑在 Node 上。代价是**发行代码里误用 Node API 时 `tsc` 不报错**：浏览器桌面端既没有 `process` 也没有 `Buffer`，装上去就是 `ReferenceError`。

类型系统这条路走不通（`*.test.ts` 与源码同目录，拆 `types` 需要第二个 tsconfig），所以由 `pnpm check` 的「Node API」一项兜住（详见第 6 节）。

---

## 6. 契约门禁：`pnpm check`

`siyuan-kit check` 遍历 `{plugins,themes,widgets}/*`，把能在构建阶段判定的约定变成一条会变红的检查：

| 检查项      | 具体规则                                                                                                                                                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 身份一致    | 目录名 == `package.json` 的 `name`（逐字符，含大小写）；清单 `name` 由目录名推导，不再单独声明                                                                                                                                                                                                 |
| 脚本入口    | `build` 必须是 `siyuan-kit build`，`dev` 必须是 `siyuan-kit dev`                                                                                                                                                                                                                               |
| 测试布局    | 单测必须写在 `src/**/*.test.ts`、端到端测试放 `e2e/**/*.test.ts`；不允许 `tests/` / `test/` 目录与 `.test.mjs`；有测试就必须有 `test` 脚本（`vitest run`）与 `vitest.config.ts`，且 `include` 含两个固定 glob                                                                                  |
| 环境声明    | `src/` 下不允许 `declarations.d.ts` / `env.d.ts` / `ambient.d.ts` / `global.d.ts`（样式模块统一在仓库根 `types/ambient`）；包自有的全局类型与模块补充写 `src/types.d.ts`                                                                                                                       |
| 文件命名    | `src/**` 下的 `.ts` / `.scss` / `.json` 必须是 kebab-case（`README*` / `LICENSE*` / `THIRD_PARTY*` 与 `src/i18n/<locale>.json` 除外）                                                                                                                                                          |
| i18n 形态   | 只允许 `src/i18n/<locale>.json`，目录里出现非 JSON 文件即报错（挂件的 JSON 由代码导入内联，不靠内核注入）                                                                                                                                                                                      |
| tsconfig    | 必须 extends 仓库根的 `tsconfig.base.json` 或 `tsconfig.strict.json`，且不得覆盖基线管辖的选项                                                                                                                                                                                                 |
| 配置白名单  | 有 `build.config.ts` 就必须在 `ALLOWED_BUILD_CONFIG` 里                                                                                                                                                                                                                                        |
| 清单覆盖层  | 包内清单不得声明推导字段（`name` / `url` / `readme` / `icon` / `preview`）与统一字段（`author` / `funding`）；`displayName` / `description` 必须带 `default`；插件与挂件必须显式写 `disabledInPublish`、主题不得写；`settingsWindow` 只有插件可写且只能为 `true`；与 base 取值相同的声明算冗余 |
| 共用清单    | `manifests/base.json` 顶层不得含包间不同的字段（`version` / `displayName` 等），类型分节不得与顶层重复、也不得写包间不同的字段                                                                                                                                                                 |
| locale      | 清单的 `displayName` / `description` key 与 `src/i18n/*.json` 文件名必须是 BCP 47                                                                                                                                                                                                              |
| README 命名 | 包根 `README*.md` 必须匹配 `^README(\.[\w-]+)?\.md$` 且包根必须有 `README.md`（集市在清单没有 default 时回退它）；`README_zh_CN.md` 这类下划线命名会报“不会被复制”                                                                                                                             |
| README 体例 | `README*.md` 不得出现一级标题（`# `），页头已展示包名，正文从二级标题开始                                                                                                                                                                                                                      |
| 图片扩展名  | 包根 `icon.*` / `preview.*` 的扩展名必须在思源白名单 `png / jpg / jpeg / webp / avif` 内，否则不进产物也拿不到 URL                                                                                                                                                                             |
| 产物位置    | 包目录里不允许出现 `dist/` / `package.zip` / `index.js` / `index.css` / `i18n/`，也不允许出现产物清单名 `plugin.json` / `theme.json` / `widget.json`                                                                                                                                           |
| 许可副本    | 包根不允许出现 `LICENSE` / `LICENSE.md` / `LICENSE.txt`，许可只在仓库根声明                                                                                                                                                                                                                    |
| 第三方通知  | 包根只能有 `THIRD_PARTY-NOTICES.md`，其它 `THIRD_PARTY*` 文件一律报错（它们不会进产物）                                                                                                                                                                                                        |
| 约定入口    | 没有 `build.config.ts` 时，`src/index.ts`（插件）/ `index.html`（挂件）/ `styles/index.scss`（主题）必须存在                                                                                                                                                                                   |
| Node API    | `src/**` 下的发行代码（`.test.ts` / `.d.ts` / `src/__mocks__/` 除外）不允许出现 Node 内置模块（`node:*`、`fs`、`path`、`fs/promises` 等，按首段判断）与只在 Node 里存在的全局量（`process.env`、`Buffer.from`、`__dirname` …）                                                                 |

CI 在 `format:check` 之前跑它：结构错了，后面的检查都跑在错的输入上。

---

## 7. 依赖治理

- **Node 版本是 26**：根 `engines.node` 是 `>=26.0.0`，`.nvmrc` 写 `26`，CI 两个 workflow 的 `node-version` 都是 `"26"`。四处必须同步改。
  - 为什么是 26：`jsdom` 的 `engines` 是 `^22.22.2 || ^24.15.0 || >=26.0.0`，**跳过了 25**。Node 25 是奇数版、已于 2026-03-31 EOL，两头都不支持，所以只能在 24 与 26 之间选。26 于 2026-05 发布、2026-10 转 LTS，是当前该依赖支持的最高档，也是 `.nvmrc` 选它而不是 24 的理由。
  - `@types/node` 跟着 `engines.node` 走（catalog 里写 `^26.6.6`），它定义的就是 Node 的 API 面；两者脱节会让代码用到类型库没有的 API，或者反过来被过期的类型骗过。
- **一份 lockfile**：`pnpm-lock.yaml` 只有根目录一份。
- **catalog 是唯一真相源**：升级思源 API 或构建工具只改 `pnpm-workspace.yaml`，全仓一起动。Dependabot 提的升级 PR 也只动这一处（见 9.2）。
- **`siyuan` 类型包用 semver**（catalog 写 `siyuan: "1.3.0"`，包本身由 petal 仓库发布到 npm）：升级只改 catalog 一处，lockfile 仍可复现。petal 发版之前曾钉在具体提交（`github:siyuan-note/petal#<sha>`），现在已经不需要。
- **仓内共享库用 `workspace:*`**：解析结果永远是 `link:../../libs/<name>`，不会出现两个消费方锁在不同提交。
- **仓内构建不了的预编译产物也放 `libs/*`**：如 `libs/vconsole`。
- **不开 `shamefully-hoist`**：开了会拍平全部插件的依赖解析，幽灵依赖被静默接受。
- **不用 `overrides` 压平副本**：清单写范围或精确版本，由 lockfile 钉住。上游抬高最低版本时 pnpm 会解析出两份，`tsc` 直接报私有字段类型冲突 —— 这个错误正好提示该升 catalog；而 `overrides` 会把旧版静默塞给要求新版的包，编译能过、运行期缺 API。
- **直接进产物的依赖在 catalog 里写精确版本**：`@codemirror/*`、`@lezer/*`、`@jsquash/*` 版本漂移会让产物随上游变化，出问题无法归因。
- **机器相关配置不进仓库**：registry / `store-dir` 留在 `~/.npmrc`。
- **只用类型的重依赖也要写进 `allowBuilds`**：如 `electron`，漏写会让 pnpm 报 `ERR_PNPM_IGNORED_BUILDS` 并退出 1；写 `false` 则不下载二进制。

---

## 8. 格式化与 lint

两者都交给 oxc，覆盖面包括 TS / SCSS / Markdown / JSON：

- `pnpm format` / `format:check` → oxfmt（`.oxfmtrc.json`）
- `pnpm lint` → oxlint（`.oxlintrc.json`）

规则要点：

- `printWidth: 320`：oxfmt 允许的最大值（超出会报配置错误），实际效果是 320 列以内不折行。
- `experimentalOperatorPosition: "start"`：被迫折行时运算符放行首。
- `tabWidth: 2`、LF、双引号、分号、`trailingComma: "all"`、`objectWrap: "preserve"`。
- YAML 不参与（`ignorePatterns` 排掉 `**/*.{yml,yaml}`）。
- `src/i18n/` 参与格式化，包根的 `i18n/`（构建产物）排除。
- 压缩产物与生成物排除：`dist/`、`package.zip`、`libs/vconsole/{dist,build}`、`plugins/code-recognition/wasm` 与 `plugins/code-recognition/docs`。格式化 wasm-bindgen 产物会让每次构建都漂移，格式化基准语料会毁掉基准。仓库根的 `docs/`（本文件所在处）**参与**格式化。

**已知取舍**：oxfmt 是 Prettier 系，会把能塞进 320 的手动折行合并回一行，也会改写 Markdown 列表标记（`*` → `-`）。需要保留自己的断行时在上一行写 `// oxfmt-ignore`（`// prettier-ignore` 同样有效）。

### 8.1 oxlint 的规则取舍

`suspicious` 与 `perf` 两类全开会刷出两百多条警告，而 GitHub 的注解面板只显示前十条 —— 等于**没有信号**。所以规则按「这条警告是否指向需要动手的代码」筛，当前 `pnpm lint` 是**零警告**：新出现的警告一定有指认价值。

只有三条规则整条关掉，其余能改的都改了代码，剩下的极少数在命中处用 `// oxlint-disable-next-line` 就地豁免——规则自身保持开启，新代码不能无声地把同一个问题再写一遍。

| 规则                          | 为什么整条关掉                                                                                                                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-array-sort`               | 它要求改写 `toSorted()`，那是 ES2023；而产物要跑在 iOS 15.6 的 WKWebView 上（`siyuan-ios` 的 `IPHONEOS_DEPLOYMENT_TARGET = 15.6`），那里没有这个方法。这是**全仓统一的运行时约束**，不是逐点的代码决策。                                                          |
| `no-await-in-loop`            | 本仓的串行 `await` 是**顺序语义**而非「漏写并发」：轮询等渲染、重试写入、按序改 `document.head`、按序调内核 install/uninstall、按批限流（批内仍是 `Promise.all`）。规则分不出这两者，逐处豁免要写三十多条内容雷同的注释。关掉后每处仍保留一句「为什么必须串行」。 |
| `consistent-function-scoping` | 纯风格（建议把不捕获外部变量的函数提到外层），对正确性零收益；命中处多是工厂内部的小工具，提出来反而破坏封装。                                                                                                                                                    |

就地豁免的三类（都是「规则不认识这里的语义」，不是不想改）：

| 规则                                 | 处理方式                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `prefer-add-event-listener`          | **全部真改**为 `addEventListener`。`menu-drag-sort` 是唯一保留 `on*` 语义的地方：它要在拖拽期间接管并成对移除 document 上的监听      |
| `no-useless-concat`                  | **全部真改**：合并成单个字面量，多段 HTML 夹具改成数组 `join("")`                                                                    |
| `no-unmodified-loop-condition`       | **全部真改**：写成 `for (let cursor = new Date(start); ; cursor.setDate(…)) { if (cursor > end) break; }`（`setDate` 是原地改 Date） |
| `require-post-message-target-origin` | 命中处是 Worker 的 `postMessage`（协议里没有 targetOrigin），加 disable 注释（`sync.ts` 的私有方法已改名 `sendBroadcastMessage`）    |

两个选项式的放宽：

- `no-underscore-dangle` 配 `allow` 白名单：`__heatmapSiyuanStub`、`__flomoWebInjected`、`_config`、`_kernel`、`l_/m_/s_` 都是有意义的名字（测试替身的全局挂名、语言代码拆出的分量）。
- `no-unused-vars` 同时配 `argsIgnorePattern` 与 `caughtErrorsIgnorePattern` 为 `^_`：`catch (_)` 是「这个异常我不关心」的惯用写法。

`plugins/install-package/tools/**` 与 `themes/Whisper/tools/**` 进 `ignorePatterns`：它们是本地辅助脚本，不进产物、也不在 tsconfig 的 `include` 里。

---

## 9. 脚本与 CI

根目录脚本见 [README](../README.md#快速开始)。

CI 顺序：`install --frozen-lockfile` → `check` → `format:check` → `lint` → `typecheck` → `test` → `build`。

- **runner 镜像写具体版本**（`ubuntu-26.04`）：`ubuntu-latest` 会在镜像换代时静默换环境，还会每次运行挂一条迁移注解。
- **每个 job 都有 `timeout-minutes`**：默认上限 360 分钟，卡住时白烧额度；实测全流程约 65s，留十倍余量。
- **workflow 级声明最小权限**（`contents: read`）：默认 token 还带 `packages` 等本流程用不到的权限。
- **`dependency-review` job 只在 `pull_request` 上跑**：Dependabot 的 PR 会直接改 lockfile，这里按 `moderate` 拦「升到有已知漏洞的版本」。它单独成一个 job，故障不影响全量校验。

### 9.1 workflow 依赖锁

workflow 里 `uses:` 的版本与它对应的**提交 SHA** 记在 `.github/workflows/actions.lock`。这个文件由 GitHub 官方扩展 [`github/gh-actions-lock`](https://github.com/github/gh-actions-lock) 生成并校验，**不要手改**。

- 写法：`uses:` 保留完整 semver tag（`actions/checkout@v7.0.1`），SHA 只进锁文件；运行时由 runner 按锁文件核对，对不上的 pin 直接拒绝执行。首次解析时 `v7` 会被**收窄**成 `v7.0.1`（完整 semver tag 基本不会移动，pin 的有效期更长），分支名与非版本 tag 不收窄。
- 生成 / 修复：仓库根跑 `gh actions-lock`（首次先 `gh extension install github/gh-actions-lock`）。它按 `ref` / `commit` / `owner_id` / `repo_id` 写每个 action，并把 workflow 路径归到 `workflows` 段。
- 升级到新版本：改完 `uses:` 后跑 `gh actions-lock --relock` 推进已锁条目，或直接跑 `gh actions-lock` 让新 ref 被 onboard。
- CI 的「校验 workflow 锁文件」步骤跑 `gh actions-lock --verify`：`uses:` 与锁文件不一致、或锁定的提交已不是上游该 ref 指向的提交时失败。它在 checkout 之后、装 Node 之前跑，所以是「先拦，再跑长流程」。
- `dependencies` 里每条都必须有 `ref` / `commit` / `owner_id` / `repo_id`，缺一个就会让引擎**静默**把整份锁文件当成空文件（Dependabot 侧会报 `actions.lock` 不可解析）。
- 锁文件没有扩展名，oxfmt 按扩展名识别文件，因此不会改写它（YAML 本来也在 `ignorePatterns` 里）。

### 9.2 依赖更新（Dependabot）

`.github/dependabot.yml` 覆盖三处依赖源，对应仓库的三个「版本落点」：

| ecosystem        | directory                                 | 落点                                                        |
| ---------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `npm`            | `/`                                       | `pnpm-workspace.yaml` 的 `catalog`（包内一律写 `catalog:`） |
| `github-actions` | `/`                                       | 两个 workflow 的 `uses:` + `.github/workflows/actions.lock` |
| `cargo`          | `/plugins/code-recognition/wasm-detector` | `Cargo.toml` / `Cargo.lock`（`wasm/` 是它的生成物）         |

要点：

- **npm 只动 catalog**：Dependabot 的 npm 解析器把包内的 `workspace:` / `catalog:` 当工作区引用**跳过**，另外把 `pnpm-workspace.yaml` 的 `catalog`（以及 `catalogs`）里的条目当作依赖读入。所以升级永远只改 `pnpm-workspace.yaml` 一个文件，22 个包不会出现版本不一致。
- **`versioning-strategy: increase` 是刻意的**：默认的 `auto` 对「库」类会 widen，而本仓把直接进产物的依赖钉成精确版本（见第 7 节），被放宽成范围就等于放开产物漂移。
- **主版本单独出 PR**（`npm-major` 组）：产物体积与行为都可能变，必须逐个对拍；次版本与补丁合组以免刷屏。
- **`cooldown: default-days: 7`**：新版本先晾 7 天再提 PR，给被撤回或被篡改的发布留出下线时间。与 actions 的锁文件是同一套思路。
- **cargo 的 PR 合并后要在本地重建**：CI 不跑 `cargo`，`wasm/` 需要 `pnpm --filter code-recognition build:wasm` 重新生成并提交；`wasm-bindgen` 的 crate 版本必须与本地安装的 `wasm-bindgen` CLI 一致，否则构建直接报错。

---

## 10. 发布链路

发布是「**仓库级标签 + 版本变化检测**」：一个标签可以发布多个包，发哪些由清单版本决定。

```
打 tag `release/20261110-153012`（时间戳，用 pnpm release 生成）
        │
        ├─ 取「上一个可达的 release/* 标签 → 本标签」区间（git diff）
        │    └─ 首次打标签（前面没有更早的标签）→ 只建立基准，不发布任何包
        ├─ 挑出 manifest.json 被新增或修改的包
        ├─ 逐个跳过：基准与现在 version 相同（只改了文案）／版本变小（报错）
        ├─ siyuan-kit manifest <目录> 取合成清单（包里那份没有 name / url）
        ├─ 从清单 url 推导目标仓库 TCOTC/<name>，校验目录名 == 清单 name
        ├─ 只构建这些包（不是全量）→ dist/<name>.zip
        ├─ 校验 zip 根目录直接是 plugin.json / theme.json / widget.json
        ├─ 校验产物清单的 version == 检测到的版本（防检测与构建不是同一棵树）
        ├─ cp dist/<name>.zip package.zip     ← 集市按资产名找，必须改名
        └─ gh release create v<version> --repo TCOTC/<name> package.zip
               ├─ 必须是正式 release，不能是 prerelease
               └─ 正文自己写（--notes-file），不用 --generate-notes
                ↓
        bazaar Stage 下一轮抓到新 release → 集市可见
```

发一个版本：

```bash
# 1. 抬高要发的包的清单 version
# 2. 提交并推送
# 3. 发版（检测 → 打标签 → 推送，没有待发包就拒绝）
pnpm release
```

`pnpm release` 是 `.github/scripts/release.mjs`，默认动作就是「检测 + 打标签 + 推送」，不需要任何参数。

| 开关            | 作用                                                       |
| --------------- | ---------------------------------------------------------- |
| 无              | 检测 → 打标签 → `git push origin <标签>`，Publish 立刻开始 |
| `--dry-run`     | 只检测并打印标签名与待发清单，不建标签、不推送             |
| `--no-push`     | 只打标签，稍后自己 `git push origin <标签>`                |
| `--allow-empty` | 区间内没有版本变化时也打标签（只推进基准，见下文「补发」） |

**标签名是时间戳 `release/<YYYYMMDD>-<HHmmss>`**，因为同一天可能发多个批次。唯一性靠时间戳保证，
「上一个标签」靠 git 的 `creatordate` 排序取，**与标签名的字典序无关** —— 不要试图从名字里解析顺序。
格式定义在 `.github/scripts/tag.mjs`，检测与打标签两个脚本共用它，不存在第二份。

打标签前会自动做两件检查：工作区已跟踪文件必须干净（标签指向 commit，未提交改动不会进发布包）；
区间内没有待发的包就拒绝（除非 `--allow-empty`）。

检测逻辑在 `.github/scripts/detect-packages.mjs`，也能单独跑：
`node .github/scripts/detect-packages.mjs`（加 `--json` 输出机器可读结果），不上传任何东西。

构建与发布的循环在 `.github/scripts/publish.sh`（YAML 里只留 `bash .github/scripts/publish.sh`）。
它读 `PACKAGES` / `EVENT` / `INPUT_DRY_RUN` / `INPUT_FORCE` 四个环境变量，本地也能直接跑 dry-run：

```bash
# PACKAGES 每行七列（制表符分隔）：包目录 / 包名 / 版本 / 目标仓库 / 类型 / 上一个版本（新包留空）/ 基准 ref
PACKAGES=$'plugins/move-doc\tmove-doc\t1.0.2\tTCOTC/move-doc\tplugin\t1.0.1\trelease/20261001-120000' \
EVENT=workflow_dispatch INPUT_DRY_RUN=true bash .github/scripts/publish.sh
```

之所以是 bash 而不是 Node：这段逻辑已经在本仓 CI 上实跑验证过，重写会把三个已修好的坑
（`grep` 提前退出导致的 SIGPIPE、`set -u` 下 `$GITHUB_STEP_SUMMARY` unbound、`mapfile` 读清单）重新引入一遍。
单独成文件是为了能 `bash -n` 检查语法、能本地执行；塞在 YAML 里两者都做不到。

**运行汇总表**由 `publish.sh` 输出（`| 类型 | 包名 | 前一个版本 | 当前发布版本 | Release |`）：
Release 链接只有发布后才知道，所以表格不能放在检测步骤——放两处必然不一致。

**release 正文是脚本自己写的，不用 `gh --generate-notes`。** GitHub 的自动正文按**目标仓库**的提交生成，
而每个包的收录仓库迁移后已归档、只剩 README，自动生成的 `Full Changelog` 指过去永远是空区间。
GitHub 也没有「跨仓库生成 notes」的能力，`--notes-start-tag` 只能在同一仓库里换起点，所以只能自写：

```text
## 更新内容

- <基准 ref → HEAD 区间里本包目录的提交>（本包目录没有直接提交时退一步列 kit / libs 的提交）

**Full Changelog**: https://github.com/<本仓>/compare/<基准 sha>...<HEAD sha>

源码：https://github.com/<本仓>/tree/<HEAD sha>/<包目录>
```

`Full Changelog` 指向本仓的同区间对比（含其他包的改动——这是本仓唯一的「区间」概念，
本包的精确改动由上面的提交列表给出）。`force` 重发时会用 `gh release edit` 把正文一起换掉，
否则重发后还挂着上一次的提交列表。基准 ref 由检测阶段作为第 7 列传给 `publish.sh`。

六条语义：

- **只改代码、不抬 `version` → 不发布**。版本号是唯一的发布信号。
- **首次标签只建立基准**：在此之前没有任何 `release/*` 标签时，区间无从算起，直接跳过。所以迁移进本仓的第一批标签不会把全部包重发一遍。
- **版本必须严格变大**：变小会让集市索引回退，检测阶段直接报错。判断走 `libs/version-compare` 的 `compareSemver`（严格语义化版本 2.0.0），**不是**区间用的 `isVersionInRange`——后者会把预发布按核心数字归类，`1.0.2 → 1.0.2-beta.1` 在那里会被判成「相等」而静默跳过。
- **版本串无法解析即报错**：清单里写 `1.0` 这类非三段版本时，检测阶段直接失败并打印新旧版本，不静默跳过。当前 22 个包都是 `主.次.修订`。
- **同版本已存在即失败**：目标仓库已有 `v<version>` 时整包报错，不静默覆盖（`--clobber` 会让已安装用户收不到更新）。真需要覆盖时用 `workflow_dispatch` 勾 `force`。
- **补发漏掉的包要推进基准**：用 `workflow_dispatch` 的 `packages` 手动发过之后，本地标签的基准还停在旧位置，
  下次 `pnpm release` 会重复检测到同一个包（然后撞「同版本已存在」）。此时用 `pnpm release --allow-empty`
  建一个只推进基准的标签。

`workflow_dispatch` 四个输入：`base`（对比基准，留空自动取最近的标签）、`packages`（只发这些包，逗号分隔，**跳过变更检测**，用于补发漏掉的包）、`force`、`dry_run`（默认 true，只构建与校验，不创建 release）。

三个容易做错的地方：

1. **用 PAT，不能用 `GITHUB_TOKEN`**：后者只能写当前仓库，跨 20 多个收录仓库需要 fine-grained PAT（`contents: write`），存在 `PUBLISH_TOKEN`。
2. **目标仓库不能有自己的发布工作流**：创建 release 会在目标仓库建 tag，若那里还有 `on: push: tags` 的旧工作流，同一版本会被构建两次、互相覆盖资产。
3. **不要用「推 tag 让目标仓库自己构建」**：那等于保留 20 多份 lockfile 和 20 多份工具链。

checkout 必须 `fetch-depth: 0` 且取全部标签：浅克隆既拿不到上一个标签，也做不了 `git diff`。

---

## 11. 许可

### 11.1 自有代码：仓库根一份

整个仓库共用根目录的一份 [LICENSE](../LICENSE)（MIT）。各包不放副本，`pnpm check` 会把包根的 `LICENSE` / `LICENSE.md` / `LICENSE.txt` 判为错误。

**发布产物固定不带许可原文。** `collectStaticAssets` 只复制清单、README、图标、预览图、`i18n/` 与第三方通知文件，`build.config.ts` 的 `copy` 也不许列 `LICENSE`。

### 11.2 第三方：固定一个 `THIRD_PARTY-NOTICES.md`

第三方条款是**再分发义务**，不能靠仓库根那份代替。包根放恰好一个 `THIRD_PARTY-NOTICES.md`，kit 会自动复制到产物根，不需要也不要再写 `copy`。

文件名固定：许可全文（Apache / BSD / IJG / ISC …）写进该文件的「许可全文」段落，每份用 ` ```text ` 围栏包住（围栏内不会被 oxfmt 重排）。包根任何 `THIRD_PARTY` 开头但名字不对的文件都会被 `pnpm check` 判错——那些文件不会进产物，而作者会以为带上了。

判断依据是「代码有没有进产物」，不是「有没有装依赖」：

| 形态                                   | 是否需随附 | 例子                                              |
| -------------------------------------- | ---------- | ------------------------------------------------- |
| 打包进 `index.js` / `codecWorker.js`   | 需要       | CodeMirror、prettier、acorn、vConsole、`@jsquash` |
| 作为独立文件随产物分发                 | 需要       | 字体、wasm、模型                                  |
| 仅类型（`import type`）                | 不需要     | `electron`、`@octokit/openapi-types`、`siyuan`    |
| 仅构建期（vite / sass / oxc / vitest） | 不需要     | —                                                 |

现有第三方内容的归属：

| 包                             | 内容                                                                            | 许可                               | 位置                                        |
| ------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| `devtools`                     | vConsole 3.16.0-alpha                                                           | MIT（腾讯声明）                    | `THIRD_PARTY-NOTICES.md`                    |
| `snippets`                     | CodeMirror 6 / @lezer / prettier / meriyah / acorn / @uiw 主题 / @babel/runtime | MIT + ISC                          | `THIRD_PARTY-NOTICES.md`                    |
| `image-squeeze`                | `@jsquash/*` 与三份编解码器 wasm                                                | Apache-2.0 + BSD-3 + IJG + MIT     | `THIRD_PARTY-NOTICES.md`（含四份许可全文）  |
| `code-recognition`             | betlang wasm、Magika 蒸馏模型                                                   | MIT / Apache-2.0                   | `THIRD_PARTY-NOTICES.md`（含两份许可全文）  |
| `siyuan-plugin-openmoji-emoji` | OpenMoji 字体                                                                   | CC BY-SA 4.0                       | `OpenMoji/LICENSE.txt`（随字体一起 `copy`） |
| 两个字体包                     | Twemoji / 霞鹜文楷 / HarmonyOS Sans                                             | CC BY 4.0 / OFL 1.1 / 华为字体许可 | 各字体子目录内的许可文件                    |

新增第三方内容时，先确认条款对「随插件分发」的要求，再在「随附组件」表加一行（组件 / 版本 / 许可 / 版权行），并把许可全文追加到「许可全文」段落。不要拆成多个 `THIRD_PARTY-*` 文件，也不要改名成包根 `LICENSE` 或塞进 `copy`。
