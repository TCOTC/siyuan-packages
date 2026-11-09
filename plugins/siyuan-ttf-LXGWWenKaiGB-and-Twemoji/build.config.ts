import type { BuildOptions } from "@jeffrey-chen/siyuan-kit";

/**
 * 字体文件不经过 vite 的模块图：14 MB 的 woff 一旦被当成 url() 依赖，
 * 产物里会多出一份哈希命名的副本，而运行期本来就按绝对路径
 * `/plugins/<name>/LXGWWenKai/...` 加载。这里原样复制到产物根目录，
 * 与旧 webpack 的 CopyPlugin 结果一致。
 *
 * `!**\/*.bak` 对应旧配置的 `FONT_COPY_IGNORE`：字形剥离脚本会就地留下备份，
 * 它们不属于发布内容。
 */
const options: BuildOptions = {
  copy: ["LXGWWenKai/**/*", "Twemoji/**/*", "!**/*.bak"],
};

export default options;
