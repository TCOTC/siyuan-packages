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

pnpm build                          # 构建全部包 → dist/<name>/ 与 dist/<name>.zip
pnpm --filter move-doc build        # 只构建一个包
pnpm --filter move-doc dev          # 监听构建，并同步到思源工作空间
```

`--filter` **区分大小写**：包目录名与清单里的 `name` 逐字符一致，所以是 `--filter Whisper`、`--filter Whisper-Plus`。

`dev` 需要仓库根的 `siyuan.config.json`（已 gitignore），指向思源工作空间的根目录：

```json
{ "workspace": "D:/SiYuan" }
```

没有这个文件时 `dev` 只构建、不同步。

### 常用命令

- `pnpm build` —— 构建全部包
- `pnpm --filter <name> build` / `dev` —— 只构建 / 监听一个包
- `pnpm check` —— 校验目录、清单、脚本、locale 等契约
- `pnpm typecheck` —— 全部包跑 `tsc -p .`
- `pnpm test` —— 全部包跑 vitest
- `pnpm lint` / `pnpm format` —— oxlint / oxfmt
- `pnpm create:plugin <name>` —— 基于模板新建插件

---

## 目录结构

```
plugins/            插件（20 个），每个目录一个包
themes/             主题（1 个）
widgets/            挂件（1 个）
libs/               共享库：会被打进别人产物，但自己不发布
kit/                构建内核：把源码变成 dist/<name>/ 与 dist/<name>.zip
docs/               仓库规则
dist/               所有产物（生成，gitignore）
```

包放在哪个类型目录下就决定它的类型：`plugins/*` → `plugin`（`plugin.json`）、`themes/*` → `theme`（`theme.json`）、`widgets/*` → `widget`（`widget.json`）。

---

## 新建插件

```bash
pnpm create:plugin my-plugin \
  --display-name "My Plugin" --zh-name "我的插件" \
  --description "What it does" --zh-description "它做什么"
```

命令会把 `kit/templates/plugin/` 复制成 `plugins/my-plugin/` 并替换占位符（清单、两份 README 与 `package.json` 都会带上新名字）。生成后执行一次 `pnpm install` 把新包接进 workspace，再 `pnpm --filter my-plugin dev`。占位符清单见 [`kit/templates/README.md`](kit/templates/README.md)。

---

## 发布

改完清单里的 `version` 后打 tag：

```bash
git tag move-doc/v1.0.3 && git push origin move-doc/v1.0.3
```

`.github/workflows/publish.yml` 会校验 tag 与清单、只构建这一个包、把 `dist/<name>.zip` 改名为 `package.zip`，在对应的集市收录仓库创建正式 release。集市下一轮抓取后即可见。

---

## 许可

本仓与 22 个包统一使用根目录的 [MIT License](LICENSE)（`Copyright (c) 2026 Jeffrey Chen`），各包目录不再放 `LICENSE` 副本，发布产物也不带自有许可原文。

第三方内容的再分发义务单独处理：包根放一个 `THIRD_PARTY-NOTICES.md`（固定文件名，许可全文写在同一文件内），kit 会自动带进产物（`devtools` / `snippets` / `image-squeeze` / `code-recognition`）；字体则随字体子目录内的许可文件一起分发。明细见 [`docs/rules.md`](docs/rules.md) 第 11 节。

---

## 文档

- [`docs/rules.md`](docs/rules.md) —— 仓库规则：集市约束、目录与身份、产物契约、`build.config.ts` 白名单、tsconfig 两档、`pnpm check` 门禁、依赖治理、格式化、发布链路。
- [`kit/templates/README.md`](kit/templates/README.md) —— 新建包的模板与占位符。

各包自己的说明与多语言 README 在包目录下。
