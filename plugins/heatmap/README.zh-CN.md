# 文档活跃统计

直观展示全年笔记分布，支持热力图与日历两种形式。

按块的创建 / 更新时间统计每日活跃度，一眼看出哪天写得多、哪段时间在摸鱼。

## 使用

安装并启用插件后，点击顶栏左侧的日历图标即可打开统计面板（移动端则在右侧栏中）。

![顶栏按钮](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/topbar.webp)

点击某个日期格子，可进入该日详情，查看当天相关文档及块数量；点返回按钮回到热力 / 日历视图。

![单日详情](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/day.webp)

## 视图

设置菜单中可在两种布局间切换，格子颜色深浅对应当日块数：

- **热力图**：类似 GitHub 贡献图，按周展开全年格子
- **日历**：按月排成传统日历

![热力图](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/heatmap.png)

![日历](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/calendar.png)

## 设置

在统计面板右上角打开设置菜单，可调整：

| 选项       | 说明                                   |
| ---------- | -------------------------------------- |
| 视图       | 热力图 / 日历                          |
| 统计方式   | 按创建时间、按最后更新时间，或两者混合 |
| 显示范围   | 最近一年，或从指定年份连续显示到今年   |
| 年份排序   | 最近的年份在前 / 在后                  |
| 每周第一天 | 周一或周日                             |
| 筛选笔记本 | 勾选要纳入统计的笔记本，默认全部       |
| 格子档位   | 按百分位或绝对块数自定义 1–4 级阈值    |
| 格子颜色   | 自定义热力主色                         |

![设置菜单](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/settings.webp)

![筛选笔记本](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/notebooks.webp)

![格子颜色](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/color.webp)

配置会自动保存，下次打开沿用上次选项。
