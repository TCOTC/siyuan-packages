年間のノート分布をヒートマップとカレンダーで視覚的に表示します。

ブロックの作成 / 更新時刻で日ごとの活発度を集計し、どの日によく書いていたか、どの期間サボっていたかを一目で把握できます。

## 使い方

プラグインをインストールして有効にした後、トップバー左側のカレンダーアイコンをクリックすると統計パネルが開きます（モバイルでは右側サイドバーにあります）。

![トップバーボタン](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/topbar.webp)

日付のマスをクリックすると、その日の詳細が開き、関連ドキュメントとブロック数を確認できます。戻るボタンでヒートマップ / カレンダー表示に戻ります。

![日別詳細](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/day.webp)

## 表示

設定メニューで 2 つのレイアウトを切り替えられます。マスの色の濃さはその日のブロック数に対応します：

- **ヒートマップ**：GitHub のコントリビューショングラフ風に、週単位で一年分を展開
- **カレンダー**：月ごとの伝統的なカレンダー

![ヒートマップ](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/heatmap.png)

![カレンダー](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/calendar.png)

## 設定

統計パネル右上の設定メニューから調整できます：

| 項目                   | 説明                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| 表示                   | ヒートマップ / カレンダー                                         |
| 集計方法               | 作成日時、最終更新日時、または両方の混合                          |
| 表示範囲               | 過去 1 年、または指定年から今年まで連続表示                       |
| 年の並び順             | 新しい年を先に / 後に                                             |
| 週の始まり             | 月曜日または日曜日                                                |
| ノートブックを絞り込み | 集計対象のノートブックを選択（既定はすべて）                      |
| セルの段階             | パーセンタイルまたは絶対ブロック数で 1–4 段階の閾値をカスタマイズ |
| セルの色               | ヒートマップの主色をカスタマイズ                                  |

![設定メニュー](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/settings.webp)

![ノートブックを絞り込み](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/notebooks.webp)

![セルの色](https://raw.githubusercontent.com/TCOTC/siyuan-packages/main/plugins/heatmap/pic/color.webp)

設定は自動保存され、次回開いたときも前回の選択肢が引き継がれます。
