# 仓库规则

本仓把 22 个集市包的源码收在一处，共享一套构建契约。规则覆盖：目录与身份、产物契约、零配置与例外、tsconfig、契约门禁、依赖治理、格式化与 lint、发布。

写在文档里的约定只是给人读，其中可以在构建阶段判定的那部分由 `pnpm check` 负责拦住（见第 6 节）。

---

## 1. 集市约束

以下五条决定了仓库形态，依据是集市（bazaar）源码，不能凭印象改：

| 约束                                    | 依据                                                                                                 | 对架构的影响                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 一个仓库只能承载一个包                  | `util.FetchLatestReleaseZip` 走 `/releases/latest`；`plugins.txt` 是纯 `owner/repo` 行，不支持子目录 | 每个包的收录仓库必须保留，不能合并成 1 个 |
| 集市只读最新 release 里的 `package.zip` | `actions/stage/index.go` 下载 zip 并解压，从 zip 内读清单、README、图标                              | 分发只需发 release 资产；仓库树内容不参与 |
| 资产名必须恰好是 `package.zip`          | `actions/util/release.go` 里 `asset.GetName() == "package.zip"`                                      | 产物命名不可自定义                        |
| prerelease 不参与索引                   | GitHub `/releases/latest` 忽略 prerelease                                                            | 自动发布必须直接建正式 release            |
| `version` 单调递增且不带 `v` 前缀       | `rules/manifest.go`                                                                                  | 清单写 `1.0.2`，tag 写 `v1.0.2`           |

**所以本仓是「单源码仓 + 每个包一个发布端点」，不是把 22 个包并成一个集市包。**

---

## 2. 目录与身份

### 2.1 三个类型目录 + 两个支撑目录

```
plugins/          发布包，类型 plugin  → plugin.json
themes/           发布包，类型 theme   → theme.json
widgets/          发布包，类型 widget  → widget.json
libs/             不发布到集市的共享库
kit/              构建内核 @jeffrey-chen/siyuan-kit
```

包放在哪个类型目录下就决定它的类型，类型决定清单文件名。`libs/*` 不是集市包：没有清单、没有 `build` 脚本、不进 `dist/`，`exports` 直接指向 `src/index.ts`，由消费方的 vite 把 TS 源码一起编译进 bundle，运行时没有额外加载。

`libs/vconsole` 是唯一例外形态：上游只发源码、打包需要整套 svelte + webpack，仓内无法复现，所以直接提交官方构建产物（入口指向 `dist/vconsole.min.js`），更新方式写在该目录的 README 里。

### 2.2 目录名 == 清单 `name` == `package.json` 的 `name`

三者必须逐字符相同（含大小写）。`siyuan-kit` 在 `resolvePackage` 里把它拦成**硬错误**，不是警告。

`name` 同时决定产物目录 `dist/<name>`、思源安装目录 `data/<类型>/<name>`、以及发布目标仓库 `TCOTC/<name>`。目录名一旦自己漂移（`Whisper-Plus` 曾写成 `whisper-plus`、`Whisper` 曾写成 `whisper`），同一个包就在多个地方有不同写法。

代价只有一个：`pnpm --filter` 区分大小写，`--filter Whisper` 不能用小写写。这是保留集市身份的必然结果——改清单里的 `name` 会让思源装出一个新目录、集市收录记录也对不上，不能动。

### 2.3 locale 一律 BCP 47

除 `zh-CN` / `zh-TW` / `pt-BR` 外都不带地区码。依据在思源自己的源码里：`kernel/model/conf_specs.go` 落盘前就把语言码归一成 BCP 47（`Conf.Lang = util.LangToBCP47(value.Lang)`），`kernel/bazaar/package.go` 的 `GetPreferredLocaleString` 按 `Conf.Lang` 查表，下划线写法（`zh_CN`）只是回退链里的兼容分支；`app/appearance/langs/` 下的 22 个文件就是标准全集。

同一条规则贯穿四个地方，必须一起改，只改一半就会静默失效：

| 位置                                                 | 例子                                        |
| ---------------------------------------------------- | ------------------------------------------- |
| 清单 `displayName` / `description` / `readme` 的 key | `"zh-CN"`、`"zh-TW"`、`"ja"`                |
| 多语言 README 文件名                                 | `README.zh-CN.md`、`README.ja.md`           |
| `src/i18n/*.json` 的文件名                           | `zh-CN.json`、`ja.json`                     |
| `src/index.ts` 里对 i18n JSON 的导入路径             | `import type zhCN from "./i18n/zh-CN.json"` |

`pnpm check` 校验前两项，并检查清单声明的每个 README 都真实存在。

### 2.4 一个插件包的最小结构

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

主题的约定入口是 `styles/index.scss`，挂件的约定入口是包根的 `index.html`。

---

## 3. 产物契约

### 3.1 产物只在仓库根的 `dist/`

**源码目录里永远不出现产物。** 包目录只有源码，`.gitignore` 只需要一行 `/dist`。

```
plugins/move-doc/           源   {plugin.json, README*.md, icon.png, preview.png, src/}
        │
        └─▶ dist/move-doc/  解包内容  {index.js, index.css, plugin.json, README*.md, i18n/}
            dist/move-doc.zip            上传到 release 的那个包
```

这样做的好处：源码与产物彻底分离；发布脚本按约定取 `dist/<name>.zip`，不用遍历包目录；换机器、换工作空间路径都不用动任何包。

**三条硬规定：**

- zip 内**不能**多一层包装目录，清单必须在 zip 根（集市校验会拒）
- 清单里的 `version` 不带 `v` 前缀；release tag 带 `v`
- `dist/` 与 `siyuan.config.json` 都 gitignore

### 3.2 运行期形态

- 插件入口必须打成 CommonJS `module.exports`（内核按 `require` 加载）。vite 的 lib 模式默认就是这个形态，不要改成纯 ESM。
- 样式必须落在 `index.css`，不能是 `assets/index-<hash>.css`（内核按固定名找）。
- 入口 import 了样式、但编译后没有任何规则时，**build 不产出 `index.css`**；dev 会补一个空文件（工作空间里目录结构稳定）。不需要为了「产物有文件」去加无用样式规则。
- dev 与 build 的产物形态只有两处不同：dev 不压缩 + inline sourcemap；build 压缩 + 无 sourcemap。其余（`base`、`external`、CSS 固定命名）两边一致，否则会出现「本地能跑、装了包不行」。

### 3.3 dev 同步

```
plugins/move-doc/ ──watch──▶ dist/move-doc/ ──同步──▶ <工作空间>/data/plugins/move-doc/
```

每次产物落盘后，`dist/<name>/` 会被**镜像**进思源工作空间：新增的复制过去，变了的覆盖，产物里没有的删掉（否则改文件名后旧文件会一直留在插件目录里）。

需要仓库根的 `siyuan.config.json`（已 gitignore，模板见 `siyuan.config.example.json`）：

```json
{ "workspace": "D:/SiYuan" }
```

指向**工作空间根目录**（包含 `data/` 的那一层）。没有这个文件时 `dev` 只构建、不同步，并给出提示。路径不存在、填成了 `data` 目录本身、或者目录下没有 `data/`，三种情况各有对应的报错。

**安全校验**：同步前会确认目标目录里有对应清单、且清单里的 `name` 与本包一致；不满足就拒绝写入。这是为了防止 workspace 配错时，把工作空间里别人的插件目录当成自己的产物目录镜像掉（镜像会删除多余文件）。

**不要拿源码 checkout 当同步目标**：镜像会删掉产物里没有的文件，指向 checkout 会清掉 `src/` 与 `.git`。

---

## 4. 零配置与例外

标准包**零构建配置**，`package.json` 只有下面几行（`typecheck` 由根目录 `pnpm -r` 驱动）：

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

有单测的包再加 `"test": "vitest run"` 与 `vitest` 依赖；需要 DOM 的包自己在 `vitest.config.ts` 里设 `environment: "jsdom"`，`siyuan` 是纯类型包，测试里把它 alias 到桩。

`@jeffrey-chen/siyuan-kit` 必须写进 `devDependencies`（`workspace:*`），否则 pnpm 不会把 `siyuan-kit` 这个 bin 链进该包的 `node_modules/.bin`。

kit 从同目录的清单读 `name` / `version` / `icon` / `preview` / `readme`，按约定找 `src/index.ts` 和 `src/i18n/`，用清单里的 name 算出 `/plugins/<name>/` 作为 `base`。

### 4.1 `build.config.ts` 白名单

偏离约定用**同一套 API** 声明，而不是退回自建打包器。只有「有东西不在 vite 模块图里」或「需要多入口」才需要这份配置：

| 包                                         | 需要什么                                                | 怎么表达                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `image-squeeze`                            | 主入口 CJS + Worker 入口 IIFE；wasm 由 `new URL` 引用   | `passes: [{format:"cjs"}, {format:"iife", name, inlineDynamicImports}]`，另加 `define: {"import.meta.url": "self.location.href"}`（iife 没有 `import.meta`） |
| `code-recognition`                         | wasm 不在模块图里（运行期按绝对路径动态 import）        | `copy: ["wasm/**/*"]`，原样复制到产物根                                                                                                                      |
| `flomo-web`                                | 主进程挂钩脚本由 `remote.require()` 按路径加载          | `copy: ["devtools-hook.cjs"]`                                                                                                                                |
| `siyuan-ttf-LXGWWenKaiGB-and-Twemoji`      | 14 MB 字体不能进模块图（会被当成 url() 依赖再打包一份） | `copy: ["LXGWWenKai/**/*", "Twemoji/**/*", "!**/*.bak"]`；样式里写 `/plugins/<name>/...` 绝对 URL                                                            |
| `siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji` | 11 MB 字体不能进模块图                                  | `copy: ["HarmonyOS_Sans/**/*", "Twemoji/**/*"]`，同上                                                                                                        |
| `siyuan-plugin-openmoji-emoji`             | 953 KiB 字体不能进模块图                                | `copy: ["OpenMoji/**/*"]`（字体自带的 `OpenMoji/LICENSE.txt` 一并复制）                                                                                      |
| `inline-elements`                          | 生产构建要去掉 `console.*`                              | `dropConsole: true`：挂件 preset 把它传给 rolldown 的 `output.minify.compress.dropConsole`，dev 不生效                                                       |

这份表是**白名单**，不是「以后再想」：新增条目必须先登记到 `kit/src/check.ts` 的 `ALLOWED_BUILD_CONFIG`（附理由），否则 `pnpm check` 会红。

`copy` 的规则：相对包根的 glob，`!` 前缀排除，命中的目录递归复制，目标保持包内相对路径。所以字体与 wasm 在产物里的位置与源码里一致，运行期直接用 `/plugins/<name>/...` 绝对 URL 访问，vite 既不改写也不会再打包一份。

---

## 5. tsconfig 只有两档

包内 `tsconfig.json` 只指定 `extends`（必要时再写 `include` 与个别 `compilerOptions` 覆盖），不许自创第三份基线：

| 基线                    | 严格度                                                                  | 谁用                                                                          |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `tsconfig.base.json`    | `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`    | `kit`、`libs/token-vault`、`snippets` / `install-package` / `inline-elements` |
| `tsconfig.package.json` | `strict: false` + `noImplicitAny`（其余依赖 strictNullChecks 的项关掉） | 其余 18 个包                                                                  |

新包默认走严格档。宽松档为严格度尚未收紧的包保留；收紧类型属于独立重构，不和其他改动混在一起。

`include` 不能放进共享基线：TS 的 `include` 相对声明它的配置文件解析，写进根配置会指向仓库根的 `src/`，落到每个包上就是空集合。

`libs/token-vault` 因为源码会被两个消费方包的 tsc 程序一并检查，与它们保持一致关掉了 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`。

---

## 6. 契约门禁：`pnpm check`

`siyuan-kit check` 把「构建阶段就能判定」的那部分约定变成一条会变红的检查，遍历 `{plugins,themes,widgets}/*`：

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
| 许可副本    | 包根不允许出现 `LICENSE` / `LICENSE.md` / `LICENSE.txt`，许可只在仓库根声明                                  |
| 第三方通知  | 包根只能有 `THIRD_PARTY-NOTICES.md`，其它 `THIRD_PARTY*` 文件一律报错（它们不会进产物）                      |
| 约定入口    | 没有 `build.config.ts` 时，`src/index.ts`（插件）/ `index.html`（挂件）/ `styles/index.scss`（主题）必须存在 |

CI 在 `format:check` 之前跑它：结构错了，后面的检查都跑在错的输入上。

---

## 7. 依赖治理

- **一份 lockfile**：`pnpm-lock.yaml` 只有根目录一份
- **catalog 是唯一真相源**：升级思源 API 或构建工具只改 `pnpm-workspace.yaml` 里的 catalog，22 个包一起动
- **`siyuan` 类型包钉在 petal 的具体提交上，且全仓只有一个 pin**。当前是 `github:siyuan-note/petal#edc4b0494a`——插件需要的几处声明（`Plugin.i18n` 是 `Record<string, string>`、`open-menu-doctree` 的排序字段、`Title.getText()`）还没发到 npm，只存在于 main。这是「单一 pin、单一升级点」，lockfile 仍然可复现；petal 发布含这些声明的版本后改回 npm 上的 semver 版本即可
- **仓内共享库用 `workspace:*`**：`libs/*` 的版本号只作记录，解析结果永远是 `link:../../libs/<name>`，不存在「两个消费方锁在不同提交」的可能
- **源码在仓内构建不了的预编译产物也放 `libs/*`**：`libs/vconsole` 提交官方构建产物，消费方照常用 `workspace:*`
- **关闭 `shamefully-hoist`**：仓库里没有 `.npmrc`，pnpm 默认就是隔离式 `node_modules`。开了等于把全部插件的依赖解析拍平，幽灵依赖会被静默解析成功。不要为了图快加 `shamefully-hoist=true`
- **不用 `overrides` 压平依赖副本**：清单写范围或精确版本，版本由 lockfile 钉住。一旦上游把最低要求提到高于我们 pin 的版本，pnpm 会解析出两份同族依赖，`tsc` 会把两份实例的私有字段当成不同类型直接报错——这个错误恰好提示该升级 catalog 了；而 `overrides` 会把旧版本静默塞给要求新版的包，编译能过、运行期缺 API
- **直接进产物的依赖在 catalog 里写精确版本**：`@codemirror/*`、`@lezer/*`、`@jsquash/*` 这类库会带一串同族传递依赖，版本漂移会让产物随上游变化，出问题时无法归因
- **machine 相关的配置不进仓库**：registry、`store-dir` 留在用户级 `~/.npmrc`；CI 跑在 ubuntu-latest，仓库里硬编码 Windows 路径会直接把 CI 弄坏
- **只用类型的重依赖也要写进 `allowBuilds`**：如 `electron` 只为 `typeof import("electron")`，漏写会让 pnpm 报 `ERR_PNPM_IGNORED_BUILDS` 并退出 1；写 `false` 后不会下载二进制

---

## 8. 格式化与 lint

两者都交给 oxc，一个工具链覆盖 TS / SCSS / Markdown / JSON：

- `pnpm format` / `pnpm format:check` → oxfmt（配置 `.oxfmtrc.json`）
- `pnpm lint` → oxlint（配置 `.oxlintrc.json`）

规则要点：

- `printWidth: 320`：不是「不限制折行」，而是 oxfmt 允许的最大值（超过 320 会报配置错误）。实际效果是 320 列以内不折
- `experimentalOperatorPosition: "start"`：表达式被迫折行时，运算符放行首
- `tabWidth: 2`、LF、双引号、分号、`trailingComma: "all"`
- `objectWrap: "preserve"`：对象字面量按你写的单行/多行来
- YAML 不参与：`ignorePatterns` 里排掉 `**/*.{yml,yaml}`
- `src/i18n/` 参与格式化，只有包根的 `i18n/`（构建产物）被排除
- 压缩产物与生成物不参与：`libs/vconsole/dist`、`libs/vconsole/build`、`plugins/code-recognition/wasm`（及基准语料 `docs/`）都排掉了。格式化 wasm-bindgen 产物会让每次构建都漂移，格式化基准语料会直接毁掉基准

**已知取舍**：oxfmt 是 Prettier 系，会把能塞进 320 的手动折行合并回一行；也会改写 Markdown 列表标记（`*` → `-`）。确实需要按自己的意愿断行时，在上一行写 `// oxfmt-ignore`（`// prettier-ignore` 同样有效）。

---

## 9. 根目录脚本与 CI

| 命令                              | 作用                                             |
| --------------------------------- | ------------------------------------------------ |
| `pnpm build`                      | `pnpm -r build`，全量构建                        |
| `pnpm --filter <name> build\|dev` | 只构建 / 监听一个包（**`--filter` 区分大小写**） |
| `pnpm check`                      | 契约门禁，见第 6 节                              |
| `pnpm typecheck`                  | `pnpm -r typecheck`（`tsc -p .`）                |
| `pnpm test`                       | `pnpm -r test`（vitest）                         |
| `pnpm lint` / `pnpm format`       | oxlint / oxfmt                                   |
| `pnpm create:plugin <name>`       | 基于 `kit/templates/plugin` 新建包               |

CI 顺序：`install --frozen-lockfile` → `check` → `format:check` → `lint` → `typecheck` → `test` → `build`。

---

## 10. 发布链路

```
打 tag `move-doc/v1.0.3`
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

发一个版本就两句：

```bash
# 改完清单里的 version 后
git tag move-doc/v1.0.3 && git push origin move-doc/v1.0.3
```

`workflow_dispatch` 保留做 dry-run（`dry_run` 默认 true）：只构建、校验 zip 根目录有清单，不创建 release。

三个容易做错的地方：

1. **用 PAT，不能用 `GITHUB_TOKEN`**。`GITHUB_TOKEN` 只能写当前仓库，跨 20 多个收录仓库需要 fine-grained PAT（`contents: write`），存在 `PUBLISH_TOKEN`。
2. **目标仓库不能有自己的发布工作流**。创建 release 会在目标仓库创建 tag，若那里还有 `on: push: tags` 的旧工作流，同一版本会被构建两次、互相覆盖资产。
3. **不要用「推 tag 让目标仓库自己构建」**。那等于保留 20 多份 lockfile 和 20 多份工具链。

---

## 11. 许可

### 11.1 自有代码：仓库根一份

**整个仓库共用根目录的一份 [LICENSE](../LICENSE)（MIT）。** 各包不再放副本，`pnpm check` 会把包根的 `LICENSE` / `LICENSE.md` / `LICENSE.txt` 判为错误。

**发布产物固定不带许可原文。** `collectStaticAssets` 只复制清单、README、图标、预览图、`i18n/` 与第三方通知文件，`build.config.ts` 的 `copy` 也不许列 `LICENSE`。集市包是「装进 `data/plugins/<name>/` 的一组文件」，作者与条款由仓库根的 LICENSE 与各包 README 承担。

### 11.2 第三方：固定一个 `THIRD_PARTY-NOTICES.md`

第三方条款是**再分发义务**，不能靠仓库根那一份代替。约定是包根放**恰好一个** `THIRD_PARTY-NOTICES.md`，kit 的 `collectStaticAssets` 自动把它复制到产物根——不需要也不要再写 `copy`。

**文件名固定，不允许多种后缀并行。** 许可全文（Apache / BSD / IJG / ISC …）写进这个文件的「许可全文」段落，每份用 ` ```text ` 围栏包住（围栏内不会被 oxfmt 重排，逐字符保留原文）。`pnpm check` 会把包根任何 `THIRD_PARTY` 开头但名字不对的文件判为错误：那些文件**不会**进产物，而作者会以为带上了。

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

新增第三方内容时，先确认条款对「随插件分发」的要求，再在 `THIRD_PARTY-NOTICES.md` 的「随附组件」表里加一行（组件 / 版本 / 许可 / 版权行），并把许可全文追加到「许可全文」段落。**不要**拆成多个 `THIRD_PARTY-*` 文件，也不要把许可改名成包根 `LICENSE` 或塞进 `copy`。
