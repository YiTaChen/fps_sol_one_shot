# Cinderline 武器建模與顯示

### 原因

以原生 1280×720 和 1920×1080 在 Chrome 渲染舊版。放大同角度的 Meridian 後，仍可看到大面積的平直槍身和槍托、簡單的鏡座與彈匣。先前軍械庫只將槍畫到約 240 像素寬，讓這些區別更難辨識。

本次以《VALORANT》的武器辨識原則檢查各款裝備的輪廓，並參考《Modern Warfare 4》對金屬、聚合物、磨耗和第一人稱構圖的區分。 [Riot 武器美術](https://playvalorant.com/en-us/news/dev/how-the-valorant-arsenal-was-built/) · [Activision 槍械材質與構圖](https://www.callofduty.com/blog/2026/08/call-of-duty-modern-warfare-4-next-highlights-multiplayer-gameplay-systems)

### 實作

- Vesper 改為帶深度的散熱開口，補上內襯和外殼接縫。Flicker 與 Meridian 重做分件外殼、槍托、握把與鏡座。兩把手槍有各自的滑套與握把，Arc Cutter 改為分層斜面。
- 金屬、聚合物和手套織物各使用共享的 256×256 色彩、粗糙度與法線貼圖。第一人稱補光、軍械庫光照和縮圖統一重抓，角色持有的遠距裝備維持單次繪製。
- 軍械庫用 **+／−** 或聚焦後的滾輪縮放，拖曳旋轉。遊戲中按 **I** 可查看手上武器。開火、瞄準、換彈或切換武器可結束檢視。

[原生 1080p 前後對照](demo/weapon-detail-review.webp) · [六件裝備模型](demo/weapon-arsenal-review.webp) · [自動測試報告](tests/smoke-report.json)
