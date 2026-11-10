# siyuan-packages

思源笔记集市包的单一源码仓库。20 个插件、1 个主题、1 个挂件在这里统一构建，产物分发到各自的集市收录仓库——**集中开发，各自发布**。

每个包都是独立的集市条目，版本、README、清单互不影响；把它们放在一起是为了共用一套构建工具链、一份依赖版本清单（catalog）和一条发布流水线。

---

## 包含的包

### 插件

- [code-languages](plugins/code-languages) —— 编辑代码块的语言列表：排序、添加、删除
- [code-recognition](plugins/code-recognition) —— 用本地模型自动识别代码块的语言
- [devtools](plugins/devtools) —— 重载窗口、打开插件相关目录、切换开发者工具（移动端使用 vConsole）
- [exit-confirm](plugins/exit-confirm) —— 用系统快捷键退出桌面端时弹出确认框
- [flomo-web](plugins/flomo-web) —— 在页签或停靠栏里打开 flomo
- [fullscreen](plugins/fullscreen) —— 在文档面包屑上添加全屏按钮，可分别配置编辑器全屏与窗口全屏
- [heatmap](plugins/heatmap) —— 用热力图与日历展示全年笔记分布
- [highlight-search](plugins/highlight-search) —— 在当前文档中搜索并高亮结果
- [image-squeeze](plugins/image-squeeze) —— 压缩工作空间图片并转成 WebP，自动改写引用
- [install-package](plugins/install-package) —— 从 GitHub 链接安装任意版本的插件、主题、图标、挂件与模板
- [move-doc](plugins/move-doc) —— 把当前文档移动到文档树的指定位置
- [scroll-zoom](plugins/scroll-zoom) —— 按住 Ctrl 滚动滚轮或触控板缩放，调整编辑器字号
- [select-opened-doc](plugins/select-opened-doc) —— 选中当前打开的文档并折叠其他已打开文档
- [siyuan-plugin-openmoji-emoji](plugins/siyuan-plugin-openmoji-emoji) —— 在思源里使用 OpenMoji 表情字体
- [siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji](plugins/siyuan-ttf-HarmonyOS_Sans_SC-and-Twemoji) —— 在思源里使用 HarmonyOS Sans 与 Twemoji 字体
- [siyuan-ttf-LXGWWenKaiGB-and-Twemoji](plugins/siyuan-ttf-LXGWWenKaiGB-and-Twemoji) —— 在思源里使用霞鹜文楷 GB 与 Twemoji 字体
- [snippets](plugins/snippets) —— 管理并编辑代码片段
- [temp-edit](plugins/temp-edit) —— 从顶栏打开临时编辑页签，内容不会写入工作空间
- [top-bar-text](plugins/top-bar-text) —— 在顶栏显示文字与倒计时
- [Whisper-Plus](plugins/Whisper-Plus) —— Whisper 主题的配套插件，提供配色方案与功能开关

### 主题

- [Whisper](themes/Whisper) —— 主题（配色与排版）

### 挂件

- [inline-elements](widgets/inline-elements) —— 汇总文档中的行内元素

### 共享代码

- [libs/token-vault](libs/token-vault) —— 加密 Token 存储，被 `install-package` 与 `snippets` 直接打包
- [libs/vconsole](libs/vconsole) —— vConsole 官方构建产物，供 `devtools` 使用
- [kit](kit) —— 构建内核 `@jeffrey-chen/siyuan-kit`

---

## 快速开始

要求 Node.js ≥ 24、pnpm 11。

```bash
pnpm install
pnpm --filter move-doc build        # 只构建一个包
pnpm dev move-doc                   # 只监听一个包，并把产物目录链接进思源工作空间
```

| 命令                              | 作用                                             |
| --------------------------------- | ------------------------------------------------ |
| `pnpm build`                      | 构建全部包 → `dist/<name>/` 与 `dist/<name>.zip` |
| `pnpm dev <name>…`                | 监听指定的包（不写包名会报错并列出可用包名）     |
| `pnpm dev:all`                    | 监听全部包：每包一个 watch 进程，很吃内存，慎用  |
| `pnpm --filter <name> build\|dev` | 只构建 / 监听一个包（在包目录里跑）              |
| `pnpm check`                      | 校验目录、清单、脚本、locale 等契约              |
| `pnpm typecheck` / `pnpm test`    | 全仓 `tsc -p .` / vitest                         |
| `pnpm lint` / `pnpm format`       | oxlint / oxfmt                                   |
| `pnpm create:plugin <name>`       | 基于模板新建插件                                 |

`--filter` 与 `pnpm dev` 的包名都**区分大小写**：包目录名与清单里的 `name` 逐字符一致，所以是 `Whisper`、`Whisper-Plus`。`pnpm dev` 也接受目录，例如 `pnpm dev themes/Whisper`。

`dev` 需要仓库根的 `siyuan.config.json`（已 gitignore），指向思源工作空间的根目录（含 `data/` 的那层）：

```json
{ "workspace": "D:/SiYuan" }
```

没有这个文件时 `dev` 只构建、不链接（提示只打一次）。`build` 完全不读它：本机工作空间路径配错或换机器都不会影响打包。

`dev` 是持续监听：插件/挂件走 vite 的 `build.watch`，主题由 kit 用 `fs.watch` 盯住 `styles/`（含 partial 子目录）与 `icons/`——sass 的 `compileAsync` 没有 watch API，不自己盯就只能编译一次。SCSS 写错只打到控制台，不会中断监听；`dev` 也不会清空产物目录（它已经链进思源，先清后编一旦失败思源里就只剩空主题）。

**不要把全部包的 dev 一起开着**：`pnpm dev:all` 会同时拉起二十多个 watch 进程（每个几十到上百 MB），编辑器容易被拖到无响应。仓库里的 `.vscode/settings.json` 已经把 `dist/` 从文件监听、搜索和 TS 服务里排除——构建写入的产物不再触发编辑器的索引。

---

## 目录结构

```
plugins/            插件（20 个），每个目录一个包
themes/             主题（1 个）
widgets/            挂件（1 个）
libs/               共享库：会被打进别人产物，但自己不发布
kit/                构建内核：把源码变成 dist/<name>/ 与 dist/<name>.zip
manifests/          清单的共用层（base.json）与三份 JSON Schema
docs/               仓库规则
dist/               所有产物（生成，gitignore）
```

包放在哪个类型目录下就决定它的类型：`plugins/*` → `plugin`、`themes/*` → `theme`、`widgets/*` → `widget`。三种包的源清单统一叫 `manifest.json`，产物里的清单则按集市要求叫 `plugin.json` / `theme.json` / `widget.json`——两个名字不同，避免把源清单当成可直接发布的产物。

### 清单分三层

包里的清单**只写本包独有的值**，不再是集市直接读的那一份：

| 层   | 内容                                                                             | 写在哪                                                                                  |
| ---- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 推导 | `name`、`url`、`readme`、`icon`、`preview`                                       | 不写（构建从目录名与包根文件推导；`icon.png` / `preview.png` 是集市默认名，不写进清单） |
| 共用 | `author`、`funding` 顶层写一次；`backends`、`frontends` 按包类型分节             | [`manifests/base.json`](manifests/base.json)                                            |
| 独有 | `version`、`minAppVersion`、`displayName`、`description`、`disabledInPublish` 等 | 包内 `manifest.json`                                                                    |

构建时三层合并，合并结果写进 `dist/<name>/plugin.json`（主题是 `theme.json`、挂件是 `widget.json`）——集市读的是这一份。运行 `siyuan-kit manifest <目录>` 可以随时看合成结果。

清单的 schema 与共用清单同目录：`manifests/override.schema.json`（包内清单）、`manifests/base.schema.json`（共用清单）、`manifests/dist.schema.json`（产物清单）。VS Code 通过 `.vscode/settings.json` 自动绑定，写清单时会有字段补全与错误提示。

---

## 新建插件

```bash
pnpm create:plugin my-plugin \
  --display-name "My Plugin" --zh-name "我的插件" \
  --description "What it does" --zh-description "它做什么"
```

命令会把 `kit/templates/plugin/` 复制成 `plugins/my-plugin/` 并替换占位符（清单、两份 README 与 `package.json` 都会带上新名字）。之后执行 `pnpm install` 把新包接进 workspace。占位符清单见 [`kit/templates/README.md`](kit/templates/README.md)。

生成的清单已经是覆盖层形态：`name` / `url` / `readme` 由构建推导，`author` / `funding` / 前后端来自 `manifests/base.json`，只有 `displayName` / `description` 需要你改。

---

## 发布

抬完要发的包的清单 `version` 后，提交推送，然后：

```bash
pnpm release
```

这一个命令就够了：它会先检测区间内哪些包的版本变大了，打时间戳标签（如 `release/20261110-153012`），再推送到 origin。同一天可以发多批；工作区有未提交改动、或区间内没有版本变化时直接拒绝。

`.github/workflows/publish.yml` 随后取「上一个标签 → 本标签」区间里清单版本变大的包，逐个构建、把 `dist/<name>.zip` 改名为 `package.zip`，在各自的集市收录仓库创建正式 release。集市下一轮抓取后即可见。

两个要点：**只改代码没抬 `version` 不会发布**；**第一次打标签只建立基准**，不发布任何包。细则见 [`docs/rules.md`](docs/rules.md) 第 10 节。

---

## 许可

本仓与各包统一使用根目录的 [MIT License](LICENSE)（`Copyright (c) 2026 Jeffrey Chen`）。各包不放 `LICENSE` 副本，发布产物也不带自有许可原文。

第三方内容的再分发义务单独处理：包根放一个固定文件名的 `THIRD_PARTY-NOTICES.md`，kit 自动带进产物；字体随字体子目录内的许可文件一起分发。明细见 [`docs/rules.md`](docs/rules.md) 第 11 节。

---

## 文档

- [`docs/rules.md`](docs/rules.md) —— 仓库规则：集市约束、目录与身份、产物契约、`build.config.ts` 白名单、tsconfig、`pnpm check`、依赖治理、格式化、发布、许可。
- [`kit/templates/README.md`](kit/templates/README.md) —— 新建包的模板与占位符。

各包自己的说明与多语言 README 在包目录下。
