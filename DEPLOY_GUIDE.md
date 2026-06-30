# 逆水寒管理系統 — 部署說明

## 📦 你拿到的東西

解壓縮 `nshuanguild-pwa.zip` 後會看到 `pwa-build/` 資料夾，結構如下：

```
pwa-build/
├── index.html              主程式入口
├── manifest.json            PWA 設定檔（圖示、名稱、顏色）
├── sw.js                     Service Worker（離線快取）
├── css/style.css             所有樣式
├── js/                       功能模組（依序載入）
│   ├── data.js               職業、技能預設清單
│   ├── store.js               本機儲存（localStorage）封裝
│   ├── app.js                  登入、模式切換、導覽列
│   ├── helpers.js              共用小工具
│   ├── player.js               玩家端畫面（首頁/報名/排表/我的資料）
│   ├── lineup.js                管理員排表（拖曳、砲手/指揮）
│   ├── members.js               管理員成員管理
│   ├── matches.js                比賽紀錄 + Excel匯入
│   ├── stats.js                   數據分析圖表
│   ├── signup.js                   報名管理
│   ├── skills.js                    絕技/群俠技能清單設定
│   └── gsync.js                      Google試算表同步
├── icons/icon-192.png, icon-512.png  App 圖示
└── google-apps-script.gs              貼到 Google 試算表用的程式碼
```

---

## 🚀 第一步：部署到 GitHub Pages（讓任何人都能用網址打開）

1. 登入你的 GitHub 帳號，點右上角 **+** → **New repository**
2. Repository name 隨意取，例如 `nshuanguild-pwa`，設為 **Public**，按 **Create repository**
3. 進入剛建立的 repository 頁面，點 **uploading an existing file**（或 Add file → Upload files）
4. 把 `pwa-build/` 資料夾**裡面的所有檔案和資料夾**（不是整個 pwa-build 資料夾本身，是裡面的 index.html、manifest.json、css/、js/、icons/ 等）拖曳上傳
   - 如果網頁介面拖資料夾有問題，也可以用 GitHub Desktop 軟體，或是 `git` 指令上傳，效果一樣
5. 上傳完成後，進入 repository 的 **Settings** → 左側選單找到 **Pages**
6. 在 **Build and deployment** 底下，Source 選擇 **Deploy from a branch**，Branch 選 **main**，資料夾選 **/ (root)**，按 **Save**
7. 等待約 1-2 分鐘，重新整理頁面，會看到一個網址，類似：
   ```
   https://你的帳號.github.io/nshuanguild-pwa/
   ```
8. 打開這個網址，確認可以看到「俱樂部 / 幫戰」選擇畫面，代表部署成功！

### 之後要更新內容怎麼辦？
之後如果要修改任何檔案，回到 repository 頁面，點進該檔案 → 點鉛筆圖示編輯 → 修改後 Commit，GitHub Pages 會自動在 1-2 分鐘內更新，不需要重新部署。

---

## 📱 第二步：安裝成手機 App（PWA 安裝）

把網址傳給任何人，他們打開後：

**iPhone（Safari）：**
點下方「分享」按鈕 → 「加入主畫面」

**Android（Chrome）：**
點右上角選單（⋮）→ 「安裝應用程式」或「加入主畫面」

安裝後桌面會出現一個 App 圖示，點開會像原生 App 一樣全螢幕顯示，沒有瀏覽器網址列。即使沒有網路，先前瀏覽過的頁面和已儲存的資料依然能查看、編輯（離線時的修改會等網路恢復後，你再手動點「同步」上傳）。

---

## ☁️ 第三步：設定 Google 試算表同步

### 3-1 建立試算表
1. 到 [Google 試算表](https://sheets.google.com) 新建一份空白試算表，取名例如「逆水寒管理系統資料」

### 3-2 安裝 Apps Script
1. 上方選單：**擴充功能** → **Apps Script**，會開啟一個新分頁的程式碼編輯器
2. 把編輯器裡預設的 `function myFunction() {}` 整段刪除
3. 打開 `google-apps-script.gs`（在你下載的壓縮包裡），全選複製
4. 貼到 Apps Script 編輯器中
5. 點上方的「儲存」圖示（或 Ctrl+S）

### 3-3 部署為網路應用程式
1. 點右上角藍色按鈕 **部署** → **新增部署作業**
2. 點齒輪圖示，類型選擇 **網路應用程式**
3. 設定：
   - 說明：可填「逆水寒同步」
   - 執行身份：**我**（你自己的帳號）
   - 誰可以存取：**任何人**
4. 點 **部署**
5. 第一次會跳出「授權存取權」，點擊後選擇你的 Google 帳號
6. 如果出現「Google 尚未驗證這個應用程式」的警告畫面，這是正常的（因為這是你自己寫的小工具，沒有送 Google 審核），點 **進階** → **前往「逆水寒同步」(不安全)** → **允許**
7. 部署完成後會顯示一個網址，格式類似：
   ```
   https://script.google.com/macros/s/AKfycb......................./exec
   ```
   複製這整串網址

### 3-4 在 PWA 中設定
1. 打開你的 PWA，用**管理員身份**登入
2. 進入「成員」分頁 → 點 **☁️ Google同步**
3. 把剛剛複製的網址貼到「Apps Script Webhook URL」欄位
4. 點「儲存設定」
5. 之後點 **🔄 立即同步到 Google 試算表**，就會把目前的成員、技能清單、活動、報名、比賽紀錄全部寫入試算表（你會看到試算表自動產生好幾個分頁，例如「共用_成員清單」「俱樂部_活動場次」「幫戰_比賽紀錄」等）

### 3-5 多人共用注意事項
- 同步是**手動**的：每個人在自己的裝置上操作完，要記得點一次「立即同步」，資料才會真正寫進雲端試算表
- 如果想要「載入別人剛同步的最新資料」，可以點「從 Google 試算表匯入（覆蓋本機）」，這會用試算表的內容覆蓋你目前裝置上的資料，請小心使用（建議只由管理員定期執行，避免互相覆蓋）
- 如果之後要修改 `google-apps-script.gs` 的內容，改完要重新「部署」→「管理部署作業」→ 點編輯（鉛筆）→ 版本選「新版本」→ 部署，網址通常會維持不變，不需要重新貼到 PWA

---

## 🔧 疑難排解

**問題：手機安裝後打開是空白畫面**
檢查瀏覽器主控台（電腦版 Chrome 可用 F12）有沒有紅色錯誤訊息，通常是某個 js 檔案路徑沒對上，確認 GitHub Pages 上的檔案結構跟 `pwa-build/` 內部結構一致（index.html 要在最外層，不能套一層資料夾）。

**問題：同步按鈕沒反應 / 一直顯示同步失敗**
1. 確認 Apps Script 網址有貼對且結尾是 `/exec`
2. 確認部署時「誰可以存取」選的是「任何人」而不是「僅自己」
3. 確認已經完成 Google 帳號授權那一步

**問題：GitHub Pages 顯示 404**
通常是等待時間不夠（首次部署約需 1-2 分鐘），或是 Settings → Pages 裡的 Branch/資料夾設定錯誤，確認選的是 `main` 分支、`/ (root)` 資料夾。

**問題：iOS 安裝後沒有圖示，顯示預設地球圖示**
確認 `icons/icon-192.png` 檔案有成功上傳到 GitHub，且 `index.html` 裡的 `<link rel="apple-touch-icon">` 路徑正確。
