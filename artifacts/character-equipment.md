# Cinderline 角色與場上裝備

| 參考 | 本次驗收 |
| --- | --- |
| [Modern Warfare 4 角色與裝備圖](https://www.callofduty.com/blog/2026/10/call-of-duty-modern-warfare-4-launch-multiplayer-operators-weapons-equipment-create-a-class) | 從正面、側面和行進姿勢看頭盔、髖、膝、靴的整體比例。逐件確認武器輪廓。 |
| [Modern Warfare 4 動作與槍械呈現](https://www.callofduty.com/blog/2026/08/call-of-duty-modern-warfare-4-next-highlights-multiplayer-gameplay-systems) | 以角色移動速度和方向驅動腳步。檢查站姿、跑動、側移與蹲姿。 |
| [Battlefield 6 第一與第三人稱修正](https://www.ea.com/games/battlefield/redsec/news/battlefield-6-game-update-1-1-2-0) | 逐次檢查購買、換裝、瞄準、開火與投擲。場上的模型、槍口特效、飛行道具都要符合當下使用的裝備。 |

### 角色

以同一鏡位和制服對照前後版本。站姿髖點由身高的 45.9% 調至 49.2%，膝點由 24.2% 調至 26.4%。重做頭盔比例、褲型、護膝及鞋靴。動作依實際移動方向和速度更新，以鞋底輪廓計算落地高度。兩組平地步態樣本的支撐腳滑動中位數由每秒 0.97 和 1.14 公尺降至 0.001 公尺以下。正面近拍仍可看出髖部網格接縫。

### 場上裝備

場上武器沿用軍械庫的幾何模型，使用各自的左右手定位點和槍口定位點。持槍姿勢會隨步槍、短槍、手槍、近戰與投擲物切換。巡邏兵分別使用 Vesper、Flicker 或 Meridian，彈匣、射速和槍聲對應各自配備。

在單人模式中按 **V** 切換肩後視角，**1／2／3** 切換武器，**4／5／6** 選擇投擲物，**T** 從手中擲出選定道具。狙擊瞄準會進入光學鏡，掩體擋住肩後鏡頭時會切回眼位。

遠處角色的裝備使用從同一模型簡化的單一網格。Vesper 的遠距網格由約 12,000 個三角形降至 3,718 個，繪製次數由 10 次降為 1 次。九件裝備的近遠距外框差距均在約 2 公分內。

[角色比例對照](demo/character-proportions.webp) · [場上裝備對照](demo/character-equipment.webp) · [自動測試報告](tests/smoke-report.json)
