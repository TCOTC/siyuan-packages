# 文檔活躍統計

直觀展示全年筆記分佈，支援熱力圖與日曆兩種形式。

按區塊的建立 / 更新時間統計每日活躍度，一眼看出哪天寫得多、哪段時間在摸魚。

## 使用

安裝並啟用插件後，點擊頂欄左側的日曆圖示即可打開統計面板（行動端則在右側欄中）。

![頂欄按鈕](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/topbar.webp)

點擊某個日期格子，可進入該日詳情，查看當天相關文檔及區塊數量；點返回按鈕回到熱力 / 日曆視圖。

![單日詳情](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/day.webp)

## 視圖

設定選單中可在兩種佈局間切換，格子顏色深淺對應當日區塊數：

- **熱力圖**：類似 GitHub 貢獻圖，按週展開全年格子
- **日曆**：按月排成傳統日曆

![熱力圖](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/heatmap.png)

![日曆](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/calendar.png)

## 設定

在統計面板右上角打開設定選單，可調整：

| 選項       | 說明                                   |
| ---------- | -------------------------------------- |
| 視圖       | 熱力圖 / 日曆                          |
| 統計方式   | 按建立時間、按最後更新時間，或兩者混合 |
| 顯示範圍   | 最近一年，或從指定年份連續顯示到今年   |
| 年份排序   | 最近的年份在前 / 在後                  |
| 每週第一天 | 週一或週日                             |
| 篩選筆記本 | 勾選要納入統計的筆記本，預設全部       |
| 格子檔位   | 按百分位或絕對區塊數自訂 1–4 級閾值    |
| 格子顏色   | 自訂熱力主色                           |

![設定選單](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/settings.webp)

![篩選筆記本](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/notebooks.webp)

![格子顏色](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/color.webp)

設定會自動儲存，下次打開沿用上次選項。
