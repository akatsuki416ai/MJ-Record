// 結算/上傳畫面：顯示最終損益 + 5 大類統計，上傳到 webhook（cors/no-cors），
// 失敗不刪本機資料，提供重試與複製 JSON。

import { el } from "./dom.js";
import { deriveState, STAT_KEYS } from "./state.js";

const STAT_LABELS = { zimo: "自摸", hujiao: "胡牌", beiZimo: "被自摸", fangChong: "放槍", liuju: "流局", meiShi: "沒事" };

function buildPayload(app) {
  const derived = deriveState(app.session);
  const players = app.session.players;
  const playerSummaries = players.map((p) => ({
    name: p.name,
    netResult: derived.totals[p.id],
    dongPaid: derived.dongPaid[p.id] || 0,
    stats: { ...derived.stats[p.id] },
  }));
  return {
    action: "upload",
    sessionId: app.session.sessionId,
    startedAt: app.session.startedAt,
    endedAt: app.session.endedAt || new Date().toISOString(),
    roundCount: derived.roundCount,
    settings: { base: app.settings.base, perTai: app.settings.perTai },
    players: playerSummaries,
    me: playerSummaries[0], // 玩家陣列第 0 位固定是我，明講出來讓 Apps Script 不用猜陣列順序
  };
}

async function postToWebhook(payload, url, mode) {
  if (!url) return { ok: false, reason: "no-url" };
  try {
    const res = await fetch(url, {
      method: "POST",
      mode,
      headers: mode === "cors" ? { "Content-Type": "application/json" } : undefined,
      body: JSON.stringify(payload),
    });
    if (mode === "no-cors") return { ok: true, unverified: true };
    return res.ok ? { ok: true } : { ok: false, reason: `http-${res.status}` };
  } catch (e) {
    return { ok: false, reason: "network-error" };
  }
}

export function renderSummary(container, app, actions) {
  container.innerHTML = "";
  if (!app.session) return;

  const derived = deriveState(app.session);
  const players = app.session.players;
  const payload = buildPayload(app);

  container.appendChild(el("h2", {}, "牌局結算"));
  container.appendChild(el("p", { class: "hint" }, `共 ${derived.roundCount} 局`));

  const showDong = app.session.dongCount > 0 || Object.values(derived.dongPaid).some((v) => v > 0);

  const table = el("table", { class: "summary-table" });
  const headRow = el("tr", {}, [
    el("th", {}, "玩家"),
    el("th", {}, "損益"),
    ...(showDong ? [el("th", {}, "繳東")] : []),
    ...STAT_KEYS.map((k) => el("th", {}, STAT_LABELS[k])),
  ]);
  table.appendChild(headRow);
  players.forEach((p) => {
    const net = derived.totals[p.id];
    table.appendChild(
      el("tr", {}, [
        el("td", {}, p.name),
        el("td", { class: net >= 0 ? "positive" : "negative" }, `${net >= 0 ? "+" : ""}${net}`),
        ...(showDong ? [el("td", {}, String(derived.dongPaid[p.id] || 0))] : []),
        ...STAT_KEYS.map((k) => el("td", {}, String(derived.stats[p.id][k] || 0))),
      ])
    );
  });
  container.appendChild(table);

  const statusBox = el("div", { class: "upload-status", id: "upload-status" });
  container.appendChild(statusBox);

  const uploadBtn = el(
    "button",
    {
      class: "primary big",
      onclick: async () => {
        uploadBtn.disabled = true;
        statusBox.textContent = "上傳中…";
        const result = await postToWebhook(payload, app.settings.webhookUrl, app.settings.webhookMode);
        uploadBtn.disabled = false;
        if (result.ok && !result.unverified) {
          statusBox.textContent = "✅ 已成功上傳到 Google Sheet";
          statusBox.className = "upload-status ok";
        } else if (result.ok && result.unverified) {
          statusBox.textContent = "📤 已送出（no-cors 模式無法確認伺服器是否成功接收，請自行到 Sheet 確認）";
          statusBox.className = "upload-status warn";
        } else if (result.reason === "no-url") {
          statusBox.textContent = "⚠️ 尚未設定 webhook 網址，請到設定畫面填寫後再上傳";
          statusBox.className = "upload-status warn";
        } else {
          statusBox.textContent = `❌ 上傳失敗（${result.reason}），本機資料仍保留，可以重試`;
          statusBox.className = "upload-status error";
        }
      },
    },
    "上傳到 Google Sheet"
  );
  container.appendChild(uploadBtn);

  container.appendChild(
    el(
      "button",
      {
        class: "small",
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            statusBox.textContent = "已複製 JSON 到剪貼簿";
            statusBox.className = "upload-status ok";
          } catch (e) {
            statusBox.textContent = "複製失敗，請手動選取下方內容";
            statusBox.className = "upload-status error";
          }
        },
      },
      "複製 JSON"
    )
  );

  container.appendChild(el("pre", { class: "json-preview" }, JSON.stringify(payload, null, 2)));

  container.appendChild(el("h3", {}, "危險區"));
  container.appendChild(
    el(
      "p",
      { class: "hint" },
      "會清空「MJ牌局紀錄」分頁的所有歷史資料列（保留表頭，不動「我的紀錄」分頁），不可復原。新聚會、參與者不同時再用。"
    )
  );
  const clearStatusBox = el("div", { class: "upload-status", id: "clear-status" });
  container.appendChild(clearStatusBox);
  const clearBtn = el(
    "button",
    {
      class: "danger big",
      onclick: async () => {
        if (!confirm("確定要清空「MJ牌局紀錄」分頁的所有歷史資料嗎？這個動作無法復原。")) return;
        clearBtn.disabled = true;
        clearStatusBox.textContent = "清除中…";
        const result = await postToWebhook(
          { action: "clear", confirmCode: app.settings.clearConfirmCode },
          app.settings.webhookUrl,
          app.settings.webhookMode
        );
        clearBtn.disabled = false;
        if (result.ok && !result.unverified) {
          clearStatusBox.textContent = "✅ 已清空 MJ牌局紀錄";
          clearStatusBox.className = "upload-status ok";
        } else if (result.ok && result.unverified) {
          clearStatusBox.textContent = "📤 已送出（no-cors 模式無法確認是否成功，請自行到 Sheet 確認；確認碼錯誤也會顯示這個訊息）";
          clearStatusBox.className = "upload-status warn";
        } else if (result.reason === "no-url") {
          clearStatusBox.textContent = "⚠️ 尚未設定 webhook 網址";
          clearStatusBox.className = "upload-status warn";
        } else {
          clearStatusBox.textContent = `❌ 清除失敗（${result.reason}）`;
          clearStatusBox.className = "upload-status error";
        }
      },
    },
    "清除 MJ 牌局紀錄"
  );
  container.appendChild(clearBtn);

  container.appendChild(
    el(
      "button",
      {
        class: "danger",
        onclick: () => {
          if (confirm("開新牌局嗎？（這場的紀錄仍會保留，可隨時回來查看/重新上傳）")) {
            actions.startNewSessionFromSummary();
          }
        },
      },
      "開新牌局"
    )
  );
}
