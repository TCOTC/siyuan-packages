# {{displayNameZhCN}}

{{descriptionZhCN}}

## 开发

本插件属于 [siyuan-packages](https://github.com/TCOTC/siyuan-packages)：构建、格式化与 lint 都由仓库根统一提供，包目录里只有源码。

```bash
pnpm install                   # 仓库根执行，首次或依赖变更后
pnpm --filter {{name}} dev     # 监听构建，并把产物目录链接进思源工作空间
pnpm --filter {{name}} build   # 产物：dist/{{name}}/ 与 dist/{{name}}.zip
pnpm --filter {{name}} typecheck
```

`dev` 需要在仓库根放 `siyuan.config.json`（模板见 `siyuan.config.example.json`），否则只构建、不同步。

## 结构

| 路径              | 说明                                            |
| ----------------- | ----------------------------------------------- |
| `plugin.json`     | 集市清单：name / version / displayName / 前后端 |
| `src/index.ts`    | 插件入口，默认导出 `Plugin` 的子类              |
| `src/i18n/*.json` | 界面文案，构建时复制到产物的 `i18n/`            |
| `src/index.scss`  | 插件样式，为空时不产出 `index.css`              |
| `icon.png`        | 集市图标                                        |
| `preview.png`     | 集市预览图                                      |
