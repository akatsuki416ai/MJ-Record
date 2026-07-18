// 核心算錢邏輯：純函式，不碰 DOM/localStorage，方便單獨測試。
//
// 規則（已跟使用者用具體情境核對過）：
// - 莊家連莊：流局、或莊家自己胡牌（自摸/食胡）時連莊；任何閒家胡牌就換莊。
// - 莊家連莊台數加成 = 連莊數 * 2 + 1，是固定加成台數（不是倍率）。
//   - 莊家自己贏：莊家台數 = 一般台數 + 加成，所有付錢的人都照這個台數算。
//   - 莊家是別人自摸時的付款者之一：莊家付「贏家台數 + 加成」，其他兩家付「贏家台數」。
//   - 莊家放槍賠給食胡的閒家：莊家賠「贏家台數 + 加成」。
//   - 莊家是旁觀者（閒家食胡、放槍者是另一閒家）：完全不受加成影響。
// - 自摸：其他三家各自獨立付一份。食胡：只有放槍者一人付。
// - 金額 = 底 + 台數 * 每台單價。
// - 沒事：食胡局裡，既不是贏家也不是放槍者的旁觀玩家（每家各自累計自己的次數，
//   用來統計個人「閃避率」）。自摸局沒有旁觀者（其他三家都要付），流局另外算。
// - 東（場地費）：全場累計自摸次數中，第 1~dongCount 次自摸，贏家除了正常贏錢外
//   還要額外付 dongAmount 的場地費（這筆錢離開牌桌，不是分給其他三家，所以
//   這種局的 deltas 加總會是負的 dongAmount，不再是零和）。超過 dongCount 次之後
//   （「東滿」）就不用再付。

export function computeRoundResult({ outcomeType, winnerId, discarderId, taiTotal: inputTaiTotal }, ctx) {
  const { dealerId, dealerStreak, players, settings, dongAmount = 0, dongCount = 0, priorZimoCount = 0 } = ctx;
  const dealerBonusTai = dealerStreak * 2 + 1;
  const amountFor = (tai) => settings.base + tai * settings.perTai;

  const deltas = {};
  const statDeltas = {};
  for (const p of players) deltas[p.id] = 0;

  function bump(pid, key) {
    if (!statDeltas[pid]) statDeltas[pid] = {};
    statDeltas[pid][key] = (statDeltas[pid][key] || 0) + 1;
  }

  if (outcomeType === "liuju") {
    for (const p of players) bump(p.id, "liuju");
    return {
      deltas,
      statDeltas,
      taiTotal: 0,
      dealerBonusTai: 0,
      dongFee: 0,
      dealerIdAfter: dealerId,
      dealerStreakAfter: dealerStreak + 1,
    };
  }

  const taiTotal = Number(inputTaiTotal) || 0;

  const winnerIsDealer = winnerId === dealerId;

  let dongFee = 0;

  if (outcomeType === "zimo") {
    let received = 0;
    for (const p of players) {
      if (p.id === winnerId) continue;
      const isDealerPayer = p.id === dealerId;
      const tai = winnerIsDealer || isDealerPayer ? taiTotal + dealerBonusTai : taiTotal;
      const amt = amountFor(tai);
      deltas[p.id] -= amt;
      received += amt;
      bump(p.id, "beiZimo");
    }
    deltas[winnerId] += received;
    bump(winnerId, "zimo");

    const zimoIndex = priorZimoCount + 1; // 這是全場第幾次自摸
    if (dongAmount > 0 && zimoIndex <= dongCount) {
      dongFee = dongAmount;
      deltas[winnerId] -= dongFee;
    }
  } else if (outcomeType === "hujiao") {
    const bonusApplies = winnerIsDealer || discarderId === dealerId;
    const tai = bonusApplies ? taiTotal + dealerBonusTai : taiTotal;
    const amt = amountFor(tai);
    deltas[discarderId] -= amt;
    deltas[winnerId] += amt;
    bump(winnerId, "hujiao");
    bump(discarderId, "fangChong");
    for (const p of players) {
      if (p.id !== winnerId && p.id !== discarderId) bump(p.id, "meiShi");
    }
  } else {
    throw new Error(`Unknown outcomeType: ${outcomeType}`);
  }

  const dealerStays = winnerIsDealer;
  const dealerIndex = players.findIndex((p) => p.id === dealerId);
  const dealerIdAfter = dealerStays ? dealerId : players[(dealerIndex + 1) % players.length].id;
  const dealerStreakAfter = dealerStays ? dealerStreak + 1 : 0;

  return {
    deltas,
    statDeltas,
    taiTotal,
    dealerBonusTai,
    dongFee,
    dealerIdAfter,
    dealerStreakAfter,
  };
}
