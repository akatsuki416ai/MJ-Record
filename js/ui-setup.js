// 設定畫面：玩家名單（常駐，隨時可編輯）+ 牌局設定（座位制，僅在沒有進行中牌局時可用）
// + 計分設定（底/台/東/webhook/清除確認碼，隨時可編輯，不影響已記錄的歷史局）

import { el } from "./dom.js";

function newRosterId() {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function renderSetup(container, app, actions) {
  container.innerHTML = "";
  const hasSession = !!app.session;

  container.appendChild(el("h2", {}, "設定"));

  // ---- 玩家名單（常駐，我以外的人，隨時可編輯） ----
  const rosterBox = el("div", { class: "box" });
  rosterBox.appendChild(el("h3", {}, "玩家名單"));
  rosterBox.appendChild(el("p", { class: "hint" }, "常駐名單（不含「我」），開新牌局時從這裡選下家/對家/上家。新增、刪除會立即存檔。"));

  const rosterList = el("div", { class: "roster-list" });
  app.settings.roster.forEach((p) => {
    rosterList.appendChild(
      el("div", { class: "roster-row" }, [
        el("span", {}, p.name),
        el(
          "button",
          {
            class: "danger small",
            onclick: () => {
              actions.updateSettings({
                ...app.settings,
                roster: app.settings.roster.filter((r) => r.id !== p.id),
              });
            },
          },
          "刪除"
        ),
      ])
    );
  });
  rosterBox.appendChild(rosterList);

  const newRosterInput = el("input", { type: "text", placeholder: "新玩家名字" });
  rosterBox.appendChild(
    el("div", { class: "roster-add-row" }, [
      newRosterInput,
      el(
        "button",
        {
          onclick: () => {
            const name = newRosterInput.value.trim();
            if (!name) return;
            actions.updateSettings({
              ...app.settings,
              roster: [...app.settings.roster, { id: newRosterId(), name }],
            });
          },
        },
        "+ 新增"
      ),
    ])
  );
  container.appendChild(rosterBox);

  // ---- 牌局設定 ----
  const gameBox = el("div", { class: "box" });
  gameBox.appendChild(el("h3", {}, "牌局設定"));

  if (hasSession) {
    gameBox.appendChild(
      el("p", { class: "hint" }, "目前有進行中的牌局，請先在「記錄」畫面按「結束牌局」才能開新的一局。")
    );
    gameBox.appendChild(el("button", { onclick: () => actions.goToRound() }, "回到記錄畫面"));
  } else {
    gameBox.appendChild(
      el("p", { class: "hint" }, "座位依逆時針排：我 → 下家 → 對家 → 上家 → 我，莊家輪替方向照這個順序走。")
    );

    const myNameInput = el("input", { type: "text", id: "my-name", value: app.settings.myName });
    gameBox.appendChild(el("label", {}, "我"));
    gameBox.appendChild(myNameInput);

    function buildSeatSelect(id) {
      const select = el("select", { id });
      select.appendChild(el("option", { value: "", disabled: true, selected: true }, "請選擇"));
      app.settings.roster.forEach((p) => {
        select.appendChild(el("option", { value: p.id }, p.name));
      });
      return select;
    }
    const xiajiaSelect = buildSeatSelect("seat-xiajia");
    const duijiaSelect = buildSeatSelect("seat-duijia");
    const shangjiaSelect = buildSeatSelect("seat-shangjia");
    gameBox.appendChild(el("label", {}, "下家"));
    gameBox.appendChild(xiajiaSelect);
    gameBox.appendChild(el("label", {}, "對家"));
    gameBox.appendChild(duijiaSelect);
    gameBox.appendChild(el("label", {}, "上家"));
    gameBox.appendChild(shangjiaSelect);

    const errorBox = el("p", { class: "hint dong-note", id: "setup-error" }, "");
    gameBox.appendChild(errorBox);

    gameBox.appendChild(el("label", {}, "初始莊家"));
    const dealerSelect = el("select", { id: "initial-dealer" });
    gameBox.appendChild(dealerSelect);

    const startBtn = el("button", { class: "primary" }, "開始新牌局");

    function nameOfRoster(id) {
      return app.settings.roster.find((r) => r.id === id)?.name || "";
    }

    function validate() {
      const errors = [];
      if (!myNameInput.value.trim()) errors.push("「我」的名字不能空白");
      if (app.settings.roster.length < 3) errors.push("請先在上面新增至少 3 位玩家");
      const seatIds = [xiajiaSelect.value, duijiaSelect.value, shangjiaSelect.value];
      if (seatIds.some((v) => !v)) errors.push("下家/對家/上家都要選過");
      else if (new Set(seatIds).size !== 3) errors.push("下家/對家/上家不能選到同一個人");
      if (seatIds.every((v) => v) && new Set(seatIds).size === 3) {
        const names = seatIds.map(nameOfRoster);
        if (names.includes(myNameInput.value.trim())) {
          errors.push("提醒：有玩家名字跟「我」相同，如果是同名不同人可以忽略");
        }
      }
      const blocking = errors.filter((e) => !e.startsWith("提醒"));
      errorBox.textContent = errors.join("；");
      startBtn.disabled = blocking.length > 0;

      // 同步更新初始莊家下拉選單（重建選項前先記住目前選的值，重建後還原回去，
      // 否則每次 validate() 觸發都會把使用者選好的莊家重置回第一個選項「我」）
      const previousDealerValue = dealerSelect.value;
      dealerSelect.innerHTML = "";
      const seatLabels = [
        ["p1", "我", myNameInput.value.trim() || "我"],
        ["p2", "下家", nameOfRoster(xiajiaSelect.value) || "下家"],
        ["p3", "對家", nameOfRoster(duijiaSelect.value) || "對家"],
        ["p4", "上家", nameOfRoster(shangjiaSelect.value) || "上家"],
      ];
      seatLabels.forEach(([id, role, name]) => {
        dealerSelect.appendChild(el("option", { value: id }, `${role}（${name}）`));
      });
      if (previousDealerValue && seatLabels.some(([id]) => id === previousDealerValue)) {
        dealerSelect.value = previousDealerValue;
      }
    }

    myNameInput.addEventListener("input", validate);
    xiajiaSelect.addEventListener("change", validate);
    duijiaSelect.addEventListener("change", validate);
    shangjiaSelect.addEventListener("change", validate);
    validate();

    startBtn.addEventListener("click", () => {
      validate();
      if (startBtn.disabled) return;
      const players = [
        { id: "p1", name: myNameInput.value.trim() },
        { id: "p2", name: nameOfRoster(xiajiaSelect.value) },
        { id: "p3", name: nameOfRoster(duijiaSelect.value) },
        { id: "p4", name: nameOfRoster(shangjiaSelect.value) },
      ];
      actions.updateSettings({ ...app.settings, myName: myNameInput.value.trim() });
      actions.startSession(players, dealerSelect.value);
    });
    gameBox.appendChild(startBtn);
  }
  container.appendChild(gameBox);

  // ---- 全域設定 ----
  const settingsBox = el("div", { class: "box" });
  settingsBox.appendChild(el("h3", {}, "計分設定"));

  const baseInput = el("input", { type: "number", id: "setting-base", value: app.settings.base });
  const perTaiInput = el("input", { type: "number", id: "setting-perTai", value: app.settings.perTai });
  settingsBox.appendChild(
    el("div", { class: "field-row" }, [
      el("div", { class: "field-col" }, [el("label", {}, "底"), baseInput]),
      el("div", { class: "field-col" }, [el("label", {}, "每台單價"), perTaiInput]),
    ])
  );
  settingsBox.appendChild(
    el("p", { class: "hint" }, "台數改在記錄畫面直接輸入（不含莊家連莊加成，那部分 App 會自動算），這裡不用設定台數清單。")
  );

  settingsBox.appendChild(el("h4", {}, "東（場地費）"));
  settingsBox.appendChild(
    el("p", { class: "hint" }, "全場前幾次自摸，贏家要額外付這筆場地費；超過次數（東滿）就不用再付了。設 0 代表不收東。")
  );
  const dongAmountInput = el("input", { type: "number", id: "dong-amount", value: app.settings.dongAmount });
  const dongCountInput = el("input", { type: "number", id: "dong-count", value: app.settings.dongCount });
  settingsBox.appendChild(
    el("div", { class: "field-row" }, [
      el("div", { class: "field-col" }, [el("label", {}, "每次東多少錢"), dongAmountInput]),
      el("div", { class: "field-col" }, [el("label", {}, "全場收幾次東"), dongCountInput]),
    ])
  );

  settingsBox.appendChild(el("h4", {}, "Google Sheet 上傳設定"));
  const webhookInput = el("input", {
    type: "text",
    id: "setting-webhook",
    value: app.settings.webhookUrl,
    placeholder: "https://script.google.com/macros/s/.../exec",
  });
  settingsBox.appendChild(el("label", {}, "Webhook 網址"));
  settingsBox.appendChild(webhookInput);

  const modeSelect = el("select", { id: "setting-webhook-mode" });
  modeSelect.appendChild(el("option", { value: "cors" }, "cors（一般，可讀取回應）"));
  modeSelect.appendChild(el("option", { value: "no-cors" }, "no-cors（Google Apps Script 常用）"));
  modeSelect.value = app.settings.webhookMode;
  settingsBox.appendChild(el("label", {}, "傳送模式"));
  settingsBox.appendChild(modeSelect);

  const clearCodeInput = el("input", {
    type: "text",
    id: "setting-clear-code",
    value: app.settings.clearConfirmCode,
  });
  settingsBox.appendChild(el("label", {}, "清除確認碼"));
  settingsBox.appendChild(clearCodeInput);
  settingsBox.appendChild(
    el("p", { class: "hint" }, "要跟 google-apps-script.gs 裡的 CLEAR_CONFIRM_CODE 常數設一樣的值，「清除 MJ 牌局紀錄」才會生效。")
  );

  const saveStatus = el("span", { id: "save-status", class: "save-status" }, "");

  settingsBox.appendChild(
    el(
      "button",
      {
        class: "primary",
        onclick: () => {
          actions.updateSettings({
            ...app.settings,
            base: Number(baseInput.value) || 0,
            perTai: Number(perTaiInput.value) || 0,
            dongAmount: Number(dongAmountInput.value) || 0,
            dongCount: Number(dongCountInput.value) || 0,
            webhookUrl: webhookInput.value.trim(),
            webhookMode: modeSelect.value,
            clearConfirmCode: clearCodeInput.value,
          });
          // actions.updateSettings() 已經同步觸發 renderAll() 重建整個畫面，
          // container 這個 <section> 節點本身沒變，重新抓一次剛建好的狀態文字元素來顯示提示。
          const status = container.querySelector("#save-status");
          if (status) {
            status.textContent = `✓ 已儲存（${new Date().toLocaleTimeString("zh-TW", { hour12: false })}）`;
            clearTimeout(status._clearTimer);
            status._clearTimer = setTimeout(() => {
              status.textContent = "";
            }, 3000);
          }
        },
      },
      "儲存設定"
    )
  );
  settingsBox.appendChild(saveStatus);

  container.appendChild(settingsBox);
}
