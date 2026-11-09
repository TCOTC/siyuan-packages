# Document Activity Stats

Visualize your yearly note distribution with heatmap and calendar views.

Daily activity is counted by block create / update time, so you can see at a glance which days you wrote a lot—and which stretches you slacked off.

## Usage

After installing and enabling the plugin, click the calendar icon on the left side of the top bar to open the stats panel (on mobile, it’s in the right sidebar).

![Top bar button](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/topbar.webp)

Click a day cell to open that day’s details and see related documents and block counts; use the back button to return to the heatmap / calendar view.

![Day details](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/day.webp)

## Views

Switch between the two layouts in the settings menu. Cell color intensity maps to the number of blocks that day:

- **Heatmap**: GitHub-style contribution graph, with cells laid out by week for the whole year
- **Calendar**: Traditional month-by-month calendar

![Heatmap](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/heatmap.png)

![Calendar](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/calendar.png)

## Settings

Open the settings menu from the top-right of the stats panel to adjust:

| Option            | Description                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| View              | Heatmap / Calendar                                                     |
| Count by          | Created time, last updated time, or a mix of both                      |
| Display range     | Last year, or continuously from a chosen year through the current year |
| Year order        | Newest years first / last                                              |
| First day of week | Monday or Sunday                                                       |
| Filter notebooks  | Select which notebooks to include; all by default                      |
| Cell levels       | Customize levels 1–4 by percentile or absolute block counts            |
| Cell color        | Customize the heatmap primary color                                    |

![Settings menu](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/settings.webp)

![Filter notebooks](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/notebooks.webp)

![Cell color](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/color.webp)

Settings are saved automatically and restored the next time you open the panel.
