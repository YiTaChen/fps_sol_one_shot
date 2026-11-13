# Cinderline 行動與練習場

- **Relay Run** 只顯示當前目標的路標與地面指引。North Service 的轉角已依實際移動路線修正，Saffron 和 Kiln 各有一條供電捷徑，撤離路標從主街延伸到 Cross Street。部分開闊地段新增錯開的掩體。
- **Practice Range** 可免費使用全套武器與投擲物。三個鋼靶位於 6、13、20 公尺。實際彈道更新發射、命中、靶心、命中率和最高連擊。練習的裝備與統計留在該次練習。
- **戰報** 顯示恢復的中繼站、時間和賺取的點數。成功撤離會在瀏覽器更新最快時間與完成次數。部署前軍械庫可直接回主選單，音量和畫質也會隨操控設定一起儲存。
- **角色** 用單一連續變形的褲型取代分離的髖與腿表面。更新站定轉身的腳步和蹲姿重心，驗證站姿、行走、橫移與落地。

練習場以現行 FPS 可直接測試裝備的流程為參考。 [Battlefield 6 練習場](https://www.ea.com/games/battlefield/battlefield-6/news/battlefield-6-season-2-free-trial-details-tips-and-tricks) · [Modern Warfare 4 練習內容](https://www.callofduty.com/patchnotes/2026/10/call-of-duty-modern-warfare-4-launch-patch-notes)

### 驗證

31 項自動檢查通過。實際鍵鼠操作從購裝、部署、啟動三座中繼站一路到撤離，並重載確認最快時間保存。兩組種子都以碰撞模擬走通四個目標和兩條捷徑。720p 中畫質的 300 幀移動戰鬥樣本中，舊版幀率中位數為 60.2 FPS，新版為 59.9 FPS，兩版第 95 百分位幀時間都是 20.4 ms。

[遊戲實拍](demo/operation-review.webp) · [自動測試](tests/smoke-report.json)
