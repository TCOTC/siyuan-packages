# 包的骨架

这里放新建包用的模板，由 `pnpm create:plugin <name>` 读取。它待在 `kit/` 里而不是根目录：模板只服务于 kit 的生成器，不值得为它多一层顶层目录。

模板**不是** pnpm workspace 成员，也不在 `kit/tsconfig.json` 的 `include` 范围内，所以 `pnpm -r build` / `typecheck` / `test` 都不会碰它，只有生成器会遍历并复制。

| 模板      | 命令                        | 复制到            |
| --------- | --------------------------- | ----------------- |
| `plugin/` | `pnpm create:plugin <name>` | `plugins/<name>/` |

## 占位符

模板文件里的 `{{...}}` 会在复制时替换掉。取值来自命令参数与默认值，**出现未定义的占位符会直接报错**，不会静默留在产物里。

| 占位符                | 含义                                | 默认值                            |
| --------------------- | ----------------------------------- | --------------------------------- |
| `{{name}}`            | 包名，同时是目录名与清单里的 `name` | 命令行的 `<name>`                 |
| `{{displayName}}`     | 集市显示名（default）               | 由 `<name>` 转成 Title Case       |
| `{{displayNameZhCN}}` | 集市显示名（zh-CN）                 | 同 `{{displayName}}`              |
| `{{description}}`     | 集市描述（default）                 | 空字符串                          |
| `{{descriptionZhCN}}` | 集市描述（zh-CN）                   | 空字符串                          |
| `{{author}}`          | 清单 author 与 LICENSE 版权人       | `Jeffrey Chen`                    |
| `{{url}}`             | 清单 url                            | `https://github.com/TCOTC/<name>` |
| `{{year}}`            | LICENSE 年份                        | 当前年份                          |

占位符只能出现在**字符串、JSON 值、Markdown 与注释**里。`kit/templates/plugin/src/` 下的 TS 会被仓库根的 `pnpm lint` / `pnpm format` 扫描，把占位符写进标识符位置会让解析直接失败。

新增占位符时同步改 `kit/src/create.ts` 的类型与默认值。
