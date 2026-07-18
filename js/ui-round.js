// 記錄畫面：東南西北桌面視覺化操作。點頭像跳出功能選單記錄這一局的結果，
// 胡牌後直接點另一位頭像指定放槍者，台數用底部滑出面板輸入。
// draft 是模組層級的暫存互動狀態（不進 localStorage，只是這一局還沒送出前的草稿）。

import { el } from "./dom.js";
import { deriveState } from "./state.js";

function emptyDraft() {
  return { mode: "idle", menuPlayerId: null, outcomeType: null, winnerId: null, discarderId: null, taiTotal: 0 };
}

let draft = emptyDraft();
let lastSessionId = null;

export function renderRound(container, app, actions) {
  container.innerHTML = "";
  if (!app.session) return;

  if (app.session.sessionId !== lastSessionId) {
    draft = emptyDraft();
    lastSessionId = app.session.sessionId;
  }

  const derived = deriveState(app.session);

  const headerBadges = [
    el("span", { class: "badge" }, `第 ${derived.roundCount + 1} 局`),
    el("span", { class: "badge" }, `莊家：${nameOfPlayer(app, derived.dealerId)}（連${derived.dealerStreak}）`),
  ];
  if (app.settings.dongCount > 0) {
    const dongDone = derived.zimoCount >= app.settings.dongCount;
    headerBadges.push(
      el(
        "span",
        { class: "badge" },
        dongDone ? "東滿" : `東 ${derived.zimoCount}/${app.settings.dongCount}`
      )
    );
  }
  container.appendChild(el("div", { class: "round-header" }, headerBadges));

  const body = el("div", { class: "round-body" });
  container.appendChild(body);
  renderInteractive(body, app, actions, derived);

  const undoBtn = el(
    "button",
    {
      class: "small danger",
      disabled: app.session.rounds.length === 0,
      onclick: () => actions.undoLastRound(),
    },
    "復原上一局"
  );
  container.appendChild(el("div", { class: "undo-row" }, [undoBtn]));

  const navRow = el("div", { class: "nav-row" }, [
    el("button", { onclick: () => actions.goToChart() }, "查看走勢圖"),
    el(
      "button",
      {
        class: "danger",
        onclick: () => {
          if (confirm("確定要結束這場牌局嗎？結束後可以在結算畫面上傳結果。")) {
            actions.endSession();
          }
        },
      },
      "結束牌局"
    ),
  ]);
  container.appendChild(navRow);
}

function nameOfPlayer(app, id) {
  return app.session.players.find((p) => p.id === id)?.name ?? id;
}

function renderInteractive(body, app, actions, derived) {
  body.innerHTML = "";
  const players = app.session.players;
  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? id;

  if (draft.mode === "awaiting-discarder") {
    body.appendChild(
      el("div", { class: "awaiting-banner" }, [
        el("span", {}, `請點選放槍者（${nameOf(draft.winnerId)} 胡牌）`),
        el(
          "button",
          {
            class: "small",
            onclick: () => {
              draft = emptyDraft();
              renderInteractive(body, app, actions, derived);
            },
          },
          "取消"
        ),
      ])
    );
  }

  const table = el("div", { class: "mj-table" });
  const seatMap = [
    [players[0], "south"],
    [players[1], "east"],
    [players[2], "north"],
    [players[3], "west"],
  ];
  seatMap.forEach(([p, area]) => {
    table.appendChild(renderSeat(body, app, actions, derived, p, area));
  });
  table.appendChild(
    el(
      "button",
      {
        class: "center-action",
        disabled: draft.mode !== "idle",
        onclick: () => actions.confirmRound({ outcomeType: "liuju" }),
      },
      "流局"
    )
  );
  body.appendChild(table);

  if (draft.mode === "menu") {
    body.appendChild(renderMenuSheet(body, app, actions, derived));
  } else if (draft.mode === "tai-sheet") {
    body.appendChild(renderTaiSheet(body, app, actions, derived));
  }
}

function seatExtraClass(player) {
  if (draft.mode === "menu") {
    return player.id === draft.menuPlayerId ? "seat-selected" : "";
  }
  if (draft.mode === "awaiting-discarder") {
    return player.id === draft.winnerId ? "seat-disabled" : "seat-pickable";
  }
  if (draft.mode === "tai-sheet") {
    if (player.id === draft.winnerId) return "seat-selected";
    if (player.id === draft.discarderId) return "seat-selected-secondary";
  }
  return "";
}

function renderSeat(body, app, actions, derived, player, area) {
  const isDealer = player.id === derived.dealerId;
  const total = derived.totals[player.id];
  const stats = derived.stats[player.id];
  const totalClass = total > 0 ? "positive" : total < 0 ? "negative" : "";
  const extra = seatExtraClass(player);

  const clickable =
    draft.mode === "idle" || (draft.mode === "awaiting-discarder" && player.id !== draft.winnerId);

  const classes = ["seat", `seat-${area}`];
  if (extra) classes.push(extra);

  return el(
    "div",
    {
      class: classes.join(" "),
      onclick: clickable
        ? () => {
            if (draft.mode === "idle") {
              draft.mode = "menu";
              draft.menuPlayerId = player.id;
            } else if (draft.mode === "awaiting-discarder") {
              draft.discarderId = player.id;
              draft.mode = "tai-sheet";
            }
            renderInteractive(body, app, actions, derived);
          }
        : undefined,
    },
    [
      isDealer ? el("span", { class: "seat-dealer-badge" }, `莊連${derived.dealerStreak}`) : null,
      el("div", { class: "seat-name" }, player.name),
      el("div", { class: `seat-total ${totalClass}` }, `${total >= 0 ? "+" : ""}${total}`),
      el("div", { class: "seat-stats" }, [
        el("span", {}, `自摸 ${stats.zimo}`),
        el("span", {}, `被摸 ${stats.beiZimo}`),
        el("span", {}, `胡牌 ${stats.hujiao}`),
        el("span", {}, `放槍 ${stats.fangChong}`),
      ]),
    ]
  );
}

function renderMenuSheet(body, app, actions, derived) {
  const players = app.session.players;
  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? id;
  const name = nameOf(draft.menuPlayerId);

  const cancel = () => {
    draft = emptyDraft();
    renderInteractive(body, app, actions, derived);
  };

  const backdrop = el("div", { class: "sheet-backdrop", onclick: cancel });
  const sheet = el("div", { class: "bottom-sheet" }, [
    el("h3", {}, `${name} 這一局`),
    el("div", { class: "choice-row" }, [
      el(
        "button",
        {
          class: "big",
          onclick: () => {
            draft.outcomeType = "zimo";
            draft.winnerId = draft.menuPlayerId;
            draft.mode = "tai-sheet";
            renderInteractive(body, app, actions, derived);
          },
        },
        "自摸"
      ),
      el(
        "button",
        {
          class: "big",
          onclick: () => {
            draft.outcomeType = "hujiao";
            draft.winnerId = draft.menuPlayerId;
            draft.mode = "awaiting-discarder";
            renderInteractive(body, app, actions, derived);
          },
        },
        "胡牌"
      ),
    ]),
    el("button", { class: "small", onclick: cancel }, "取消"),
  ]);

  return el("div", { class: "sheet-wrapper" }, [backdrop, sheet]);
}

function renderTaiSheet(body, app, actions, derived) {
  const players = app.session.players;
  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? id;

  const cancel = () => {
    draft = emptyDraft();
    renderInteractive(body, app, actions, derived);
  };

  const title =
    draft.outcomeType === "zimo"
      ? `${nameOf(draft.winnerId)} 自摸`
      : `${nameOf(draft.winnerId)} 胡牌（放槍：${nameOf(draft.discarderId)}）`;

  const taiInput = el("input", {
    type: "number",
    id: "tai-total-input",
    value: draft.taiTotal || "",
    min: "0",
    placeholder: "輸入台數",
  });

  const previewP = el("p", { class: "tai-preview" }, "");
  const dongP = el("p", { class: "tai-preview dong-note", style: "display:none" }, "");

  const winnerIsDealer = draft.winnerId === derived.dealerId;
  const dealerBonus = derived.dealerStreak * 2 + 1;

  function updatePreview() {
    const taiTotal = draft.taiTotal || 0;
    let bonusNote = "";
    if (draft.outcomeType === "hujiao" && (winnerIsDealer || draft.discarderId === derived.dealerId)) {
      bonusNote = `（莊家連莊加成 +${dealerBonus} 台，套用在這局的付款金額上）`;
    } else if (draft.outcomeType === "zimo" && winnerIsDealer) {
      bonusNote = `（莊家自摸，三家都要多付連莊加成 +${dealerBonus} 台）`;
    } else if (draft.outcomeType === "zimo" && !winnerIsDealer) {
      bonusNote = `（非莊家自摸，莊家那份要多付連莊加成 +${dealerBonus} 台，其他兩家不受影響）`;
    }
    previewP.textContent = `台數合計：${taiTotal} 台${bonusNote}`;

    if (draft.outcomeType === "zimo" && app.settings.dongCount > 0) {
      const zimoIndex = derived.zimoCount + 1;
      if (zimoIndex <= app.settings.dongCount) {
        dongP.textContent = `這是全場第 ${zimoIndex} 次自摸，${nameOf(draft.winnerId)} 要另外付 ${app.settings.dongAmount} 元場地費（東）`;
        dongP.style.display = "";
        return;
      }
    }
    dongP.style.display = "none";
  }

  taiInput.addEventListener("input", () => {
    draft.taiTotal = Number(taiInput.value) || 0;
    updatePreview();
  });
  updatePreview();
  setTimeout(() => taiInput.focus(), 0);

  const backdrop = el("div", { class: "sheet-backdrop", onclick: cancel });
  const sheet = el("div", { class: "bottom-sheet" }, [
    el("h3", {}, title),
    taiInput,
    previewP,
    dongP,
    el("div", { class: "sheet-actions" }, [
      el("button", { class: "small", onclick: cancel }, "取消"),
      el(
        "button",
        {
          class: "primary big",
          onclick: () => {
            const input = {
              outcomeType: draft.outcomeType,
              winnerId: draft.winnerId,
              discarderId: draft.discarderId,
              taiTotal: draft.taiTotal || 0,
            };
            draft = emptyDraft();
            actions.confirmRound(input);
          },
        },
        "確認"
      ),
    ]),
  ]);

  return el("div", { class: "sheet-wrapper" }, [backdrop, sheet]);
}
