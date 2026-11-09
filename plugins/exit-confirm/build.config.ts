import { defineBuild } from "@jeffrey-chen/siyuan-kit";

// 本包沿用旧仓库的 README_<locale>.md 命名（plugin.json 的 readme 字段按这套文件名映射），
// kit 的约定只认 README.md / README.<locale>.md，所以多语言 README 走 copy 显式列出。
export default defineBuild({
  copy: ["README_*.md"],
});
