import {
  defaultSettings,
  newSession,
  deriveState,
  SETTINGS_KEY,
  SESSION_KEY,
  LAST_COMPLETED_KEY,
} from "./state.js";
import { loadJSON, saveJSON, removeKey } from "./storage.js";
import { computeRoundResult } from "./scoring.js";
import { renderSetup } from "./ui-setup.js";
import { renderRound } from "./ui-round.js";
import { renderChart } from "./ui-chart.js";
import { renderSummary } from "./ui-summary.js";

const app = {
  // 用 merge 方式載入：舊版存在 localStorage 裡缺少的新欄位（roster/myName/clearConfirmCode）
  // 會補上預設值，使用者原本設好的 webhookUrl/base/perTai 不受影響。
  settings: { ...defaultSettings(), ...loadJSON(SETTINGS_KEY, {}) },
  session: loadJSON(SESSION_KEY, null),
};

function saveSettings() {
  saveJSON(SETTINGS_KEY, app.settings);
}
function saveSession() {
  if (app.session) saveJSON(SESSION_KEY, app.session);
}

const screens = {
  setup: document.getElementById("screen-setup"),
  round: document.getElementById("screen-round"),
  chart: document.getElementById("screen-chart"),
  summary: document.getElementById("screen-summary"),
};

const navButtons = {
  setup: document.getElementById("nav-setup"),
  round: document.getElementById("nav-round"),
  chart: document.getElementById("nav-chart"),
};

function showScreen(name) {
  for (const [key, elNode] of Object.entries(screens)) {
    elNode.style.display = key === name ? "block" : "none";
  }
  for (const [key, btn] of Object.entries(navButtons)) {
    if (btn) btn.classList.toggle("active", key === name);
  }
}

const actions = {
  updateSettings(newSettings) {
    app.settings = newSettings;
    saveSettings();
    renderAll();
  },
  startSession(players, initialDealerId) {
    app.session = newSession({ players, initialDealerId });
    saveSession();
    renderAll();
    showScreen("round");
  },
  confirmRound(input) {
    const derived = deriveState(app.session);
    const result = computeRoundResult(input, {
      dealerId: derived.dealerId,
      dealerStreak: derived.dealerStreak,
      players: app.session.players,
      settings: app.settings,
      dongAmount: app.settings.dongAmount,
      dongCount: app.settings.dongCount,
      priorZimoCount: derived.zimoCount,
    });
    const round = {
      index: app.session.rounds.length + 1,
      dealerIdBefore: derived.dealerId,
      dealerStreakBefore: derived.dealerStreak,
      outcomeType: input.outcomeType,
      winnerId: input.winnerId ?? null,
      discarderId: input.discarderId ?? null,
      taiTotal: result.taiTotal,
      dealerBonusTai: result.dealerBonusTai,
      dongFee: result.dongFee,
      deltas: result.deltas,
      statDeltas: result.statDeltas,
      dealerIdAfter: result.dealerIdAfter,
      dealerStreakAfter: result.dealerStreakAfter,
      timestamp: new Date().toISOString(),
    };
    app.session.rounds.push(round);
    saveSession();
    renderAll();
  },
  undoLastRound() {
    if (!app.session || app.session.rounds.length === 0) return;
    app.session.rounds.pop();
    saveSession();
    renderAll();
  },
  goToChart() {
    renderAll();
    showScreen("chart");
  },
  goToRound() {
    renderAll();
    showScreen("round");
  },
  goToSetup() {
    renderAll();
    showScreen("setup");
  },
  endSession() {
    app.session.endedAt = new Date().toISOString();
    saveJSON(LAST_COMPLETED_KEY, app.session);
    removeKey(SESSION_KEY);
    renderAll();
    showScreen("summary");
  },
  startNewSessionFromSummary() {
    app.session = null;
    renderAll();
    showScreen("setup");
  },
};

function renderAll() {
  renderSetup(screens.setup, app, actions);
  if (app.session) {
    renderRound(screens.round, app, actions);
    renderChart(screens.chart, app, actions);
    renderSummary(screens.summary, app, actions);
  } else {
    screens.round.innerHTML = "";
    screens.chart.innerHTML = "";
    screens.summary.innerHTML = "";
  }
  for (const [key, btn] of Object.entries(navButtons)) {
    if (btn) btn.disabled = key !== "setup" && !app.session;
  }
}

if (navButtons.setup) navButtons.setup.addEventListener("click", () => actions.goToSetup());
if (navButtons.round) navButtons.round.addEventListener("click", () => actions.goToRound());
if (navButtons.chart) navButtons.chart.addEventListener("click", () => actions.goToChart());

renderAll();

if (app.session) {
  showScreen("round");
} else {
  const last = loadJSON(LAST_COMPLETED_KEY, null);
  if (last) {
    app.session = last;
    renderAll();
    showScreen("summary");
  } else {
    showScreen("setup");
  }
}
