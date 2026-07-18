// 預設 settings / session 結構，以及從 rounds 推算目前狀態的 deriveState()

export const SETTINGS_KEY = "mj.settings.v1";
export const SESSION_KEY = "mj.session.v1";
export const LAST_COMPLETED_KEY = "mj.lastCompletedSession.v1";

export const STAT_KEYS = ["zimo", "hujiao", "beiZimo", "fangChong", "liuju", "meiShi"];

export function defaultSettings() {
  return {
    schemaVersion: 2,
    webhookUrl: "",
    webhookMode: "cors", // "cors" | "no-cors"
    base: 30, // 底
    perTai: 10, // 每台單價
    dongAmount: 0, // 東：每次場地費金額
    dongCount: 0, // 東：全場前幾次自摸要收場地費（超過就是「東滿」），設 0 代表不收東
    myName: "瓜瓜", // 我的名字，玩家陣列第 0 位固定是我
    roster: [], // 常駐玩家名單（我以外的人），{id, name}[]，開新牌局時從這裡選下家/對家/上家
    clearConfirmCode: "", // 清除 MJ 牌局紀錄要帶的確認碼，要跟 google-apps-script.gs 裡的常數一致
  };
}

export function newSession({ players, initialDealerId }) {
  return {
    schemaVersion: 1,
    sessionId: String(Date.now()),
    startedAt: new Date().toISOString(),
    players,
    initialDealerId,
    rounds: [],
  };
}

function emptyStats() {
  const s = {};
  for (const k of STAT_KEYS) s[k] = 0;
  return s;
}

// 從 session.rounds（append-only,已凍結的每局結果）推算目前狀態。
// 不依賴目前的 settings,因為每筆 RoundRecord 已經存了當時算好的 deltas/statDeltas。
export function deriveState(session) {
  let dealerId = session.initialDealerId;
  let dealerStreak = 0;
  let zimoCount = 0; // 全場累計自摸次數（不分是誰），東滿判斷用

  const totals = {};
  const stats = {};
  const dongPaid = {};
  for (const p of session.players) {
    totals[p.id] = 0;
    stats[p.id] = emptyStats();
    dongPaid[p.id] = 0;
  }

  const history = [{ round: 0, totals: { ...totals } }];

  for (const r of session.rounds) {
    for (const p of session.players) {
      totals[p.id] += r.deltas[p.id] || 0;
    }
    for (const [pid, deltaMap] of Object.entries(r.statDeltas || {})) {
      for (const [k, v] of Object.entries(deltaMap)) {
        stats[pid][k] = (stats[pid][k] || 0) + v;
      }
    }
    if (r.outcomeType === "zimo") zimoCount += 1;
    if (r.dongFee) dongPaid[r.winnerId] = (dongPaid[r.winnerId] || 0) + r.dongFee;
    dealerId = r.dealerIdAfter;
    dealerStreak = r.dealerStreakAfter;
    history.push({ round: r.index, totals: { ...totals } });
  }

  return {
    dealerId,
    dealerStreak,
    zimoCount,
    totals,
    stats,
    dongPaid,
    history,
    roundCount: session.rounds.length,
  };
}
