# MJ 專案 Log（2026-07-19 收尾整理）

給「之後回來修 bug / 加功能」的自己看的筆記。看這份之前先假設你已經完全忘記這個專案。

## 分級與狀態（依 D:\AI\CLAUDE.md 開發憲法）

- **分級：工具級**（使用者日常在用的記帳工具；不碰錢的實際轉移、不自動排程執行，未達關鍵級）
- **狀態：營運中**，已登記於 `D:\AI\PROJECTS.md`
- **驗收紀錄（2026-07-19 收尾時補跑）**：功能實測過（headless Chrome e2e + 使用者實際使用數日）✓；PROJECT_LOG 已建 ✓；部署後實際連線確認（使用者手機開過）✓；秘密未進 git（webhook 網址/確認碼只存 localStorage，repo 裡的 `google-apps-script.gs` 是範例碼、常數留空要使用者自填）✓；PROJECTS.md 已登記 ✓
- **憲法偏離備註**：託管用 GitHub Pages 而非憲法預設的 Cloudflare Pages——本專案建於憲法定案之前；使用者要測試公司網路是否擋 `github.io`，若被擋再評估搬 Cloudflare Pages

## 這是什麼

台灣麻將 16 張計台的即時記帳網頁 App。單一記帳者（通常是「我」）在牌桌旁用手機即時記錄每一局結果，App 自動處理莊家連莊、算錢、東（場地費），牌局結束可以上傳結算到自己的 Google Sheet。純靜態網頁，沒有帳號系統、沒有自己的後端伺服器。

## 功能清單

- **記錄畫面**：桌面視覺化，東南西北排 4 位玩家（我固定南方/下方，下家東、對家北、上家西）。點頭像跳底部選單選「自摸」或「胡牌」；選胡牌後直接點另一位頭像指定放槍者；輸入台數用底部滑出面板確認；桌子中央「流局」按鈕。每位玩家頭像旁即時顯示損益、自摸/被摸/胡牌/放槍次數，莊家頭像有「莊連N」標記，數字/名字用發光文字效果、依正負變色（贏綠輸紅）。
- **自動算錢**（`js/scoring.js` `computeRoundResult()`）：
  - 自摸：三家各自付，不是均攤。
  - 食胡：只有放槍者付。
  - 莊家連莊加成：`dealerStreak * 2 + 1` 台，只有莊家是這局的付款方之一時才加（贏/自摸被扣/放槍/或單純還是莊家但沒被自摸=不受影響 這四種情境都驗證過，見對話歷史）。
  - 東（場地費）：全域設定「每次金額」+「全場前幾次自摸收」，超過次數＝東滿，不再收。錢是離開牌桌的（不是三家分），只有自摸的贏家額外多付。
  - 沒事：食胡局裡「既不是贏家也不是放槍者」的兩人各自 +1，用來算個人「閃避率」。
- **玩家名單 + 座位制開局**：常駐玩家名單（不含我，可新增/刪除，跨牌局保留，即時存檔）。開新牌局時「我」是結構性固定（玩家陣列第 0 位），下家/對家/上家從名單下拉選。莊家輪替是既有的 `players[(index+1) % 4]` 邏輯，因為陣列建立順序就是逆時針座位順序，完全沒改過這段邏輯。
- **走勢圖**：Chart.js 畫每個玩家的損益折線（`js/ui-chart.js`，`vendor/chart.umd.min.js` 是本地 vendor 進來的，不吃 CDN）。
- **結算畫面**：損益 + 6 類統計表格（自摸/胡牌/被摸/放槍/流局/沒事）。三個等寬按鈕一列：藍色漸層「上傳到 Google Sheet」、紅框「清除 MJ 牌局紀錄」（要跟 Apps Script 裡的確認碼相符才會真的清空）、綠色漸層「開新牌局」。
- **設定畫面**：玩家名單 box（隨時可編輯）、牌局設定 box（只有沒有進行中牌局時顯示，選座位+初始莊家+開始新牌局）、計分設定 box（全域，底/每台單價同一列、東金額/次數同一列、webhook 網址與模式、清除確認碼，都要按「儲存設定」才存檔，會有「已儲存」提示）。

## 系統設計

- **純靜態 vanilla JS，ES modules，無建置流程、無框架、無自己的後端。** 部署到任何靜態網頁主機都能跑，唯一外部依賴是使用者自己架的 Google Apps Script webhook。
- **資料流核心**：`session.rounds[]` 是唯一事實來源（append-only）。所有「現在誰是莊家」「現在誰輸贏多少」「東收了幾次」都是 `state.js` 的 `deriveState(session)` 從頭 replay `rounds[]` 算出來的，從來不另外存派生狀態。好處：「復原上一局」就是 `rounds.pop()`，不用另外寫回滾邏輯。
- **每局結果在確認當下就凍結**：`RoundRecord` 存的是當時算好的 `deltas`/`statDeltas`，不是「規則」本身。之後在設定畫面改了底/台/東的數字，不會回頭改到已經記錄的歷史局，只影響之後新記錄的局。
- **狀態集中在 `main.js`**：`app = { settings, session }` 是唯一的全域狀態物件，`actions` 是所有畫面共用的操作介面（`confirmRound`/`undoLastRound`/`startSession`/`endSession`/`updateSettings`…）。每個 action 做完事都呼叫 `renderAll()` 整個重繪四個畫面（沒有用任何前端框架，重繪成本可以接受，因為資料量很小）。
- **`js/ui-round.js` 的互動狀態機**：`draft`（模組層級變數，不進 localStorage）用 `mode: idle|menu|awaiting-discarder|tai-sheet` 驅動點頭像 → 底部滑出面板的流程。**重入安全的關鍵寫法**：呼叫 `actions.confirmRound()` 之前一定要先把 `draft` reset 掉，因為 `confirmRound` 會同步觸發 `renderAll()`，如果 reset 放在呼叫之後，重入的那次 render 會看到還沒清空的舊 draft（這個坑在最早的按鈕式流程就踩過一次，現在的桌面版沿用同樣的寫法）。
- **`localStorage` 三個 key**（定義在 `state.js`）：
  - `mj.settings.v1`：全域設定，載入時用 `{...defaultSettings(), ...loadJSON(...)}` merge，讓舊資料補新欄位不會炸。
  - `mj.session.v1`：進行中的牌局，每次 confirmRound/undoLastRound/startSession 後立刻寫回。
  - `mj.lastCompletedSession.v1`：結束牌局時的備份（給結算畫面用，上傳失敗也不會不見）。
  - 只有「結束牌局」會清掉 `mj.session.v1`（先搬到 lastCompleted 再清），**不是**「開始新牌局」清的（那個按鈕在有進行中牌局時根本不會出現）。
- **`google-apps-script.gs`**：`doPost(e)` 依 `payload.action`（`upload`/`clear`，沒帶視同 `upload`）分流。`upload` 寫兩個分頁：「MJ牌局紀錄」（每次上傳都往下累加 4 列）跟「我的紀錄」（永遠只累加 `payload.me` 這一列，不會被清除功能動到）。`clear` 要 `CLEAR_CONFIRM_CODE`（常數本身不能是空字串，且必須跟前端送的 `confirmCode` 完全相符）才會清空「MJ牌局紀錄」的資料列（`LockService` 包住、`clearContent()` 保留表頭跟列結構）。**改完 `.gs` 程式碼存檔不會自動生效，要「管理部署作業 > 編輯 > 新版本 > 部署」才會更新已經在跑的 Web App URL**——這個坑實際發生過一次（「我的紀錄」遲遲不出現，後來重新部署就好了）。

## 檔案結構

```
index.html              -- 骨架，4 個 <section class="screen">
css/style.css
js/
  main.js                -- app 全域狀態 + actions + renderAll + showScreen
  state.js                -- defaultSettings()/newSession()/deriveState()，STAT_KEYS
  scoring.js               -- computeRoundResult()，純函式，核心算錢邏輯
  storage.js               -- localStorage 讀寫（try/catch 包一層）
  dom.js                   -- el(tag, attrs, children) DOM builder，所有 ui-*.js 共用
  ui-setup.js              -- 設定畫面（玩家名單/牌局設定/計分設定）
  ui-round.js              -- 記錄畫面（桌面 + 底部滑出面板互動狀態機）
  ui-chart.js              -- 走勢圖
  ui-summary.js            -- 結算/上傳畫面
vendor/chart.umd.min.js   -- Chart.js，本地 vendor，不吃 CDN
google-apps-script.gs      -- Google Sheet 接收端範例程式碼
README.md                  -- 使用者視角的操作說明（部署方式、設定畫面說明、webhook payload 格式）
```

## 用到的 Skill

無。這個專案的實作都是直接用 Read/Edit/Write/Bash/PowerShell 工具做的，沒有呼叫任何 Claude Code Skill。架構討論的部分有用到 Plan Mode（`EnterPlanMode`/`ExitPlanMode`），設計選擇的分岔點有用 `AskUserQuestion` 跟使用者確認（例如座位方位、放槍者選取方式、台數輸入形式這些）——這兩個是 agent 工具，不是「skill」。

## 測試方式（這台 Windows 機器沒有 Node.js，所以是這樣測的）

- **金額邏輯**：早期用 Python 鏡像腳本重新實作一次 `computeRoundResult` 的算法，跟預期手算結果比對。
- **UI/互動**：`python -m http.server <port>` 起本機靜態伺服器，搭配 headless Chrome（`chrome.exe --headless=new --dump-dom` 或 `--screenshot`）+ 臨時 `_e2e_*.html` 測試頁（用 iframe 內嵌真正的 app，透過合成 DOM 事件模擬點擊/輸入）跑完整流程。截圖時記得加 `--run-all-compositor-stages-before-draw`，不然可能截到還沒畫完的畫面（曾經因為這樣抓到一個「DOM 對但視覺全空白」的真 bug，是 CSS `display:none` 沒被正確覆蓋掉）。
- 測試完的暫存檔案（`_e2e_*.html`、截圖 png）跟本機伺服器都會清掉，**這個 repo 裡目前沒有留任何自動化測試**，之後要驗證改動需要重新用同一套手法現場測。

## 已知的坑（踩過的雷，之後遇到類似症狀先想到這裡）

1. **`file://` 直接開 `index.html` 會整個空白**：ES module 在 `file://` 協定下被瀏覽器 CORS 擋掉，一定要用 http server 開。
2. **`el.style.display = ""` 不會讓元素顯示出來**：CSS 裡 `.screen { display: none }` 是用 class 設的，inline style 設空字串只是清掉 inline override，會 fallback 回 class 規則繼續隱藏。要顯示必須明確設 `"block"`。
3. **`ui-round.js` 的 `draft` 一定要在呼叫 `confirmRound()` 之前 reset**，不能之後才 reset（見上面「互動狀態機」段落，重入安全的問題）。
4. **改了 `google-apps-script.gs` 的程式碼記得要重新部署**（管理部署作業 > 編輯 > 新版本 > 部署），單純存檔不會讓已經在跑的 Web App URL 生效新程式碼。
5. **`git push` 出現 403 permission denied**：通常是這台電腦快取的 git 帳號（`maboroshi416`）跟 repo 擁有帳號（`akatsuki416ai`）對不上。解法：`printf "protocol=https\nhost=github.com\n" | git credential reject` 清掉快取憑證，重新 push 會跳登入視窗，選對帳號登入即可。

## 部署狀態

- **GitHub repo**：https://github.com/akatsuki416ai/MJ-Record （public，GitHub Pages 免費方案需要 public repo）
- **GitHub Pages 網址**：https://akatsuki416ai.github.io/MJ-Record/ （Settings > Pages > Deploy from branch `main` / root，push 到 `main` 就會自動重新部署，通常 1-2 分鐘生效）
- **Google Apps Script webhook**：使用者自己架設，網址跟清除確認碼存在瀏覽器本機的「計分設定」裡（不在 repo 裡，`google-apps-script.gs` 只是範例程式碼，`SHEET_ID`/`CLEAR_CONFIRM_CODE` 要使用者自己填）
- 本機開發資料夾：`D:\AI\MJ`，git 已初始化，目前在 `main` branch，4 個 commit（見 `git log`）

## 如果之後要回來修 bug / 加功能，建議這樣開始

1. 先看這份 log 抓整體脈絡，再看 `README.md`（使用者視角操作說明，跟這份不重複，是給「怎麼用」不是「怎麼改」）。
2. `git log --oneline` 看功能演進順序跟每次改動的動機（commit message 有寫「為什麼」）。
3. 記帳邏輯有疑慮，先看 `js/scoring.js` 的 `computeRoundResult()`（純函式，最容易單獨驗證），不要一開始就跳進 UI 層。
4. UI 互動有疑慮，先看 `js/ui-round.js` 開頭的 `draft` 狀態機註解，理解 `idle/menu/awaiting-discarder/tai-sheet` 這四個 mode 再動手改。
5. 這台機器沒有 Node.js：驗證改動要用「已知的坑」段落提到的 headless Chrome + 本機 http server 手法，测完記得清暫存檔（`_e2e_*` 開頭的檔案已經在 `.gitignore` 裡，不會不小心 commit 進去）。
6. 改完要讓網站更新，記得 `git add` + `git commit` + `git push origin main`（GitHub Pages 會自動重新部署）。
