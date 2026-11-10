# 仓库规则

22 个集市包的源码收在一处，共享一套构建契约。其中能在构建阶段判定的部分由 `pnpm check` 拦住（第 6 节）。

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

即「单源码仓 + 每个包一个发布端点」，不是把 22 个包并成一个集市包。

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

### 2.5 清单分三层

包里的清单**不是集市读的那一份**，它只是覆盖层。集市读的是构建写进产物的完整清单。

| 层   | 字段                                                                                                                 | 写在哪                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 推导 | `name`、`url`、`readme`、`icon`、`preview`                                                                           | 不写。`name` ← 目录名、`url` ← `TCOTC/<name>`、`readme` ← 包根 `README*.md`、`icon`/`preview` ← 包根同名图片 |
| 共用 | `author`、`funding`（顶层）；`backends`、`frontends`（按类型分节）                                                   | [`manifests/base.json`](../manifests/base.json)                                                              |
| 独有 | `version`、`minAppVersion`、`displayName`、`description`、`disabledInPublish`、`keywords`、`settingsWindow`、`modes` | 包内清单                                                                                                     |

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

产物里的清单是**生成**的（三层合并，见 2.5），不是从包目录复制。包目录里那份只是覆盖层，复制过去会变成缺 `name` / 缺 `url` 的半成品。

### 3.2 运行期形态

- 插件入口必须是 CommonJS（内核按 `require` 加载），不要改成纯 ESM。
- 样式必须落在 `index.css`，不能带哈希或进 `assets/`（内核按固定名找）。
- 入口 import 了样式但编译结果为空时，build 不产出 `index.css`，dev 补一个空文件。
- dev 与 build 只差两处：dev 不压缩 + inline sourcemap，build 压缩 + 无 sourcemap。`base` / `external` / CSS 命名两边一致，否则会「本地能跑、装了包不行」。

### 3.3 dev 同步

产物落盘后 `dist/<name>/` 会被镜像进 `<工作空间>/data/<类型>/<name>/`：新增复制、变化覆盖、产物里没有的删除。

需要仓库根的 `siyuan.config.json`（gitignore，模板见 `siyuan.config.example.json`）：

```json
{ "workspace": "D:/SiYuan" }
```

指向工作空间根目录（含 `data/` 的那一层）。缺文件时只构建不同步；路径不存在、填成 `data` 本身、目录下没有 `data/` 各有报错。

同步前会校验目标目录的清单与本包 `name` 一致，否则拒绝写入——镜像会删多余文件，配错就会清掉别人的插件目录。也不要把源码 checkout 当目标。

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

- 有单测的包再加 `"test": "vitest run"` 与 `vitest` 依赖；需要 DOM 的包在 `vitest.config.ts` 里设 `environment: "jsdom"`。`siyuan` 是纯类型包，测试里 alias 到桩。
- `@jeffrey-chen/siyuan-kit` 必须写进 `devDependencies`（`workspace:*`），否则 `siyuan-kit` bin 不会链进该包。
- kit 从清单读 `version` / `displayName` / `description` 与共用段，再推导 `name` / `url` / `readme` / `icon` / `preview`，按约定找 `src/index.ts` 与 `src/i18n/`，用 name 算出 `/plugins/<name>/` 作为 `base`。

### 4.1 `build.config.ts` 白名单

偏离约定用同一套 API 声明。只有「有东西不在 vite 模块图里」或「需要多入口」才需要这份配置：

| 包                                         | 需要什么                                                | 怎么表达                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `image-squeeze`                            | 主入口 CJS + Worker 入口 IIFE；wasm 由 `new URL` 引用   | `passes: [{format:"cjs"}, {format:"iife", name, inlineDynamicImports}]`，另加 `define: {"import.meta.url": "self.location.href"}`（iife 没有 `import.meta`） |
| `code-recognition`                         | wasm 不在模块图里（运行期按绝对路径动态 import）        | `copy: ["wasm/**/*"]`，原样复制到产物根                                                                                                                      |
| `flomo-web`                                | 主进程挂钩脚本由 `remote.require()` 按路径加载          | `copy: ["devtools-hook.cjs"]`                                                                                                                                |
| `siyuan-ttf-LXGWWenKaiGB-and-Twemoji`      | 14 MB 字体不能进模块图（会被当成 url() 依赖再打包一份） | `copy: ["LXGWWenKai/**/*", "Twemoji/**/*", "!**/*.bak"]`；样式里写 `/plugins/<name>/...` 绝对 URL                                                            |
| `siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji` | 11 MB 字体不能进模块图                                  | `copy: ["HarmonyOS_Sans/**/*", "Twemoji/**/*"]`，同上                                                                                                        |
| `siyuan-plugin-openmoji-emoji`             | 953 KiB 字体不能进模块图                                | `copy: ["OpenMoji/**/*"]`（字体自带的 `OpenMoji/LICENSE.txt` 一并复制）                                                                                      |
| `inline-elements`                          | 生产构建要去掉 `console.*`                              | `dropConsole: true`：挂件 preset 把它传给 rolldown 的 `output.minify.compress.dropConsole`，dev 不生效                                                       |

这份表是**白名单**：新增条目必须先登记到 `kit/src/check.ts` 的 `ALLOWED_BUILD_CONFIG`（附理由），否则 `pnpm check` 会红。

`copy` 的规则：相对包根 glob，`!` 前缀排除，命中目录递归复制，目标保持包内相对路径。字体与 wasm 在产物里的位置与源码一致，运行期用 `/plugins/<name>/...` 绝对 URL 访问，vite 不改写也不会再打包一份。

---

## 5. tsconfig 只有两份基线

包内 `tsconfig.json` 只写 `extends` 与 `include`（必要时再补个别「更严」的开关），不许自创第三份基线：

| 基线                   | 严格度                                                                  | 谁用                        |
| ---------------------- | ----------------------------------------------------------------------- | --------------------------- |
| `tsconfig.base.json`   | `strict` + `noImplicitOverride` + `verbatimModuleSyntax`                | 全部 21 个发布包 + 新包模板 |
| `tsconfig.strict.json` | base 之上再开 `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | `kit`、`libs/*`             |

默认档就是严格档：`strict` 全仓开启，没有「宽松档」。加强档只给那些「一个错误会扩散到很多包」的代码——kit 自身出错会让 21 个包的构建一起崩，`libs/*` 会被多个消费方的 tsc 程序一并检查。某个发布包整体重构时可以临时改成 `../../../tsconfig.strict.json` 收紧，`pnpm typecheck` 会列出要收的全部位置。

四条硬规则：

- **`target` 一律 `ES2022`**，没有例外。`target` / `lib` / `module` / `moduleResolution` 是编译事实，改一处就会改产物。
- **`include` 不能放进共享基线**：TS 的 `include` / `exclude` 相对「声明它的那个配置文件」解析，写进根配置会指向仓库根的 `src/`，套到每个包上就成了空集合。
- **包内只允许把检查调得更严**（`noUnusedLocals`、`noFallthroughCasesInSwitch` 这类）。`strict`、`verbatimModuleSyntax`、`target` 等由基线管辖，`pnpm check` 会拦住任何覆盖。
- **`verbatimModuleSyntax` 全仓开启**：纯类型导入必须写 `import type`。产物由 rolldown/esbuild 剥离类型，少写一个 `type` 就会让类型导入留进 bundle，运行期去找一个不存在的模块。

`kit` 自己额外叠两条只有它需要的开关：`allowImportingTsExtensions`（`bin` 直接指向 `src/cli.ts`，由 Node 剥离类型运行，导入必须带 `.ts`）与 `erasableSyntaxOnly`（禁掉 `enum` / `namespace` / 参数属性这类 Node 剥不掉的语法）。`allowImportingTsExtensions` 留在基线里是因为各包的 tsc 程序会顺带编译 kit 源码，它只是「允许」而非「强制」。

---

## 6. 契约门禁：`pnpm check`

`siyuan-kit check` 遍历 `{plugins,themes,widgets}/*`，把能在构建阶段判定的约定变成一条会变红的检查：

| 检查项      | 具体规则                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 身份一致    | 目录名 == `package.json` 的 `name`（逐字符，含大小写）；清单 `name` 由目录名推导，不再单独声明                                                                                                                                                   |
| 脚本入口    | `build` 必须是 `siyuan-kit build`，`dev` 必须是 `siyuan-kit dev`                                                                                                                                                                                 |
| 测试        | 有 `src/**/*.test.ts` 或 `tests/` 就必须有 `test` 脚本且为 `vitest run`                                                                                                                                                                          |
| tsconfig    | 必须 extends 仓库根的 `tsconfig.base.json` 或 `tsconfig.strict.json`，且不得覆盖基线管辖的选项                                                                                                                                                   |
| 配置白名单  | 有 `build.config.ts` 就必须在 `ALLOWED_BUILD_CONFIG` 里                                                                                                                                                                                          |
| 清单覆盖层  | 包内清单不得声明推导字段（`name` / `url` / `readme` / `icon` / `preview`）与统一字段（`author` / `funding`）；`displayName` / `description` 必须带 `default`；插件与挂件必须显式写 `disabledInPublish`、主题不得写；与 base 取值相同的声明算冗余 |
| 共用清单    | `manifests/base.json` 顶层不得含包间不同的字段（`version` / `displayName` 等），类型分节不得与顶层重复、也不得写包间不同的字段                                                                                                                   |
| locale      | 清单的 `displayName` / `description` key 与 `src/i18n/*.json` 文件名必须是 BCP 47                                                                                                                                                                |
| README 命名 | 包根 `README*.md` 必须匹配 `^README(\.[\w-]+)?\.md$` 且包根必须有 `README.md`（集市在清单没有 default 时回退它）；`README_zh_CN.md` 这类下划线命名会报“不会被复制”                                                                               |
| 图片扩展名  | 包根 `icon.*` / `preview.*` 的扩展名必须在思源白名单 `png / jpg / jpeg / webp / avif` 内，否则不进产物也拿不到 URL                                                                                                                               |
| 产物位置    | 包目录里不允许出现 `dist/` / `package.zip` / `index.js` / `index.css` / `i18n/`，也不允许出现产物清单名 `plugin.json` / `theme.json` / `widget.json`                                                                                             |
| 许可副本    | 包根不允许出现 `LICENSE` / `LICENSE.md` / `LICENSE.txt`，许可只在仓库根声明                                                                                                                                                                      |
| 第三方通知  | 包根只能有 `THIRD_PARTY-NOTICES.md`，其它 `THIRD_PARTY*` 文件一律报错（它们不会进产物）                                                                                                                                                          |
| 约定入口    | 没有 `build.config.ts` 时，`src/index.ts`（插件）/ `index.html`（挂件）/ `styles/index.scss`（主题）必须存在                                                                                                                                     |

CI 在 `format:check` 之前跑它：结构错了，后面的检查都跑在错的输入上。

---

## 7. 依赖治理

- **一份 lockfile**：`pnpm-lock.yaml` 只有根目录一份。
- **catalog 是唯一真相源**：升级思源 API 或构建工具只改 `pnpm-workspace.yaml`，全仓一起动。
- **`siyuan` 类型包钉在 petal 的具体提交**（当前 `github:siyuan-note/petal#edc4b0494a`）：插件需要的几处声明还没发到 npm。单一 pin、单一升级点，lockfile 仍可复现；petal 发布后改回 semver 即可。
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
- 压缩产物与生成物排除：`libs/vconsole/dist`、`libs/vconsole/build`、`plugins/code-recognition/wasm` 与 `docs/`。格式化 wasm-bindgen 产物会让每次构建都漂移，格式化基准语料会毁掉基准。

**已知取舍**：oxfmt 是 Prettier 系，会把能塞进 320 的手动折行合并回一行，也会改写 Markdown 列表标记（`*` → `-`）。需要保留自己的断行时在上一行写 `// oxfmt-ignore`（`// prettier-ignore` 同样有效）。

---

## 9. 脚本与 CI

根目录脚本见 [README](../README.md#快速开始)。

CI 顺序：`install --frozen-lockfile` → `check` → `format:check` → `lint` → `typecheck` → `test` → `build`。

---

## 10. 发布链路

```
打 tag `move-doc/v1.0.3`
        │
        ├─ 从 github.ref_name 切出 package=move-doc、version=1.0.3
        ├─ siyuan-kit manifest <目录> 取合成清单（包里那份没有 name / url）
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

1. **用 PAT，不能用 `GITHUB_TOKEN`**：后者只能写当前仓库，跨 20 多个收录仓库需要 fine-grained PAT（`contents: write`），存在 `PUBLISH_TOKEN`。
2. **目标仓库不能有自己的发布工作流**：创建 release 会在目标仓库建 tag，若那里还有 `on: push: tags` 的旧工作流，同一版本会被构建两次、互相覆盖资产。
3. **不要用「推 tag 让目标仓库自己构建」**：那等于保留 20 多份 lockfile 和 20 多份工具链。

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
