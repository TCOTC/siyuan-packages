改插件/主题/挂件的逻辑，需要参考思源的代码，即本项目同目录的 siyuan 文件夹（发现文件夹不存在时立即停止会话并报告）。

- siyuan 文件夹是 `siyuan-note/siyuan` 的源码。内核行为看 `kernel/`，前端行为看 `app/src/`；引用它的路径必须写明来源（「siyuan 仓库 `kernel/model/plugin.go`」），裸路径会被误当成本仓库的文件。
- 本仓库的契约在 `docs/rules.md`：目录与身份、清单分三层、产物形态、`build.config.ts` 白名单、tsconfig 基线、发布链路、许可。改结构或清单之前先读它，`pnpm check` 拦的就是这些条款。
- 各包的名称与描述以包内 `manifest.json` 为准；根 `README.md` 的包列表用它们 `displayName` / `description` 里的中文，不要另写一份措辞。
