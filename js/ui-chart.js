// 損益走勢圖：用 vendor 進來的 Chart.js（index.html 用一般 <script> 標籤載入，
// 掛在全域 window.Chart 上，這個模組直接參考該全域變數即可）。

import { el } from "./dom.js";
import { deriveState } from "./state.js";

const COLORS = ["#3ba7ff", "#ff4d8d", "#34d399", "#fbbf24"];

let chartInstance = null;

export function renderChart(container, app, actions) {
  container.innerHTML = "";
  if (!app.session) return;

  container.appendChild(
    el("div", { class: "nav-row" }, [
      el("button", { onclick: () => actions.goToRound() }, "← 回到記錄畫面"),
    ])
  );

  const canvas = el("canvas", { id: "pnl-chart" });
  container.appendChild(canvas);

  const derived = deriveState(app.session);
  const players = app.session.players;

  const datasets = players.map((p, i) => ({
    label: p.name,
    data: derived.history.map((h) => h.totals[p.id]),
    borderColor: COLORS[i % COLORS.length],
    backgroundColor: COLORS[i % COLORS.length],
    fill: false,
    tension: 0.2,
  }));

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  if (typeof Chart === "undefined") {
    container.appendChild(el("p", { class: "hint" }, "Chart.js 尚未載入，無法顯示走勢圖。"));
    return;
  }

  chartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: { labels: derived.history.map((h) => h.round), datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom", labels: { color: "#cfd6e4" } } },
      scales: {
        x: { title: { display: true, text: "局數", color: "#9aa3b5" }, ticks: { color: "#9aa3b5" } },
        y: { title: { display: true, text: "損益", color: "#9aa3b5" }, ticks: { color: "#9aa3b5" } },
      },
    },
  });
}
