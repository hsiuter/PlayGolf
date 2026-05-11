import "./styles.css";
import { downloadText, playerName, stateToCsv, totalsByPlayer } from "./exporters";
import { createInitialState } from "./initialData";
import { calculateRound, getHandicap, setHandicap } from "./scoring";
import { loadState, saveState } from "./storage";
import type { AppState, RoundInput, RoundRecord } from "./types";

type View = "score" | "history" | "handicap" | "settings";

let state: AppState;
let view: View = "score";
let selectedIds: string[] = [];
let draftScores: Record<string, number> = {};
let draftStrokes: Record<string, number> = {};
let draftNote = "";
const SWIPE_STEP_PX = 24;

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing app root");
const app: HTMLDivElement = root;

void boot();

async function boot(): Promise<void> {
  state = await loadState();
  selectedIds = state.players.filter((player) => player.active).slice(0, 4).map((player) => player.id);
  selectedIds.forEach((id) => {
    draftScores[id] = 0;
    draftStrokes[id] = 0;
  });
  render();
  registerServiceWorker();
}

function render(): void {
  app.innerHTML = `
    <div class="app">
      <header class="topbar">
        <h1>高爾夫勝負</h1>
        <div class="sub">離線計算與本機紀錄</div>
      </header>
      <main class="main">${renderView()}</main>
      <nav class="tabs">
        ${tabButton("score", "計分")}
        ${tabButton("history", "歷史")}
        ${tabButton("handicap", "讓桿")}
        ${tabButton("settings", "設定")}
      </nav>
    </div>
  `;

  bindCommonEvents();
  if (view === "score") bindScoreEvents();
  if (view === "history") bindHistoryEvents();
  if (view === "handicap") bindHandicapEvents();
  if (view === "settings") bindSettingsEvents();
}

function tabButton(target: View, label: string): string {
  return `<button class="tab ${view === target ? "active" : ""}" data-view="${target}">${label}</button>`;
}

function renderView(): string {
  if (view === "history") return renderHistory();
  if (view === "handicap") return renderHandicap();
  if (view === "settings") return renderSettings();
  return renderScore();
}

function renderScore(): string {
  const result = currentInput() ? calculateRound(currentInput()!, state.handicap) : undefined;
  const activePlayers = state.players.filter((player) => player.active);

  return `
    <section class="section">
      <h2>本場參賽者</h2>
      <div class="panel grid">
        <label>
          <span class="label">人數</span>
          <select id="player-count">
            <option value="3" ${selectedIds.length === 3 ? "selected" : ""}>3 人</option>
            <option value="4" ${selectedIds.length === 4 ? "selected" : ""}>4 人</option>
          </select>
        </label>
        <div class="grid">
          ${selectedIds
            .map(
              (id, index) => `
                <label>
                  <span class="label">第 ${index + 1} 位</span>
                  <select class="player-select" data-index="${index}">
                    ${activePlayers
                      .map((player) => `<option value="${player.id}" ${player.id === id ? "selected" : ""}>${player.name}</option>`)
                      .join("")}
                  </select>
                </label>
              `
            )
            .join("")}
        </div>
      </div>
    </section>

    <section class="section">
      <h2>輸入成績</h2>
      <div class="player-inputs">
        ${selectedIds
          .map(
            (id) => `
              <div class="player-card">
                <h3>${playerName(state.players, id)}</h3>
                <div class="grid two">
                  <label>
                    <span class="label">分數</span>
                    ${renderSwipeNumberInput("score-input", id, draftScores[id] ?? 0)}
                  </label>
                  <label>
                    <span class="label">桿數</span>
                    ${renderSwipeNumberInput("stroke-input", id, draftStrokes[id] ?? 0)}
                  </label>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    </section>

    <section class="section">
      <h2>勝負結果</h2>
      <div class="results">
        ${result ? renderResultCards(result.players) : ""}
      </div>
      ${result && !result.valid ? `<p class="error">全場合計不是 0，請檢查輸入或讓桿表。</p>` : ""}
    </section>

    <section class="section">
      <div class="panel grid">
        <label>
          <span class="label">備註</span>
          <textarea id="round-note">${escapeHtml(draftNote)}</textarea>
        </label>
        <div class="actions">
          <button id="save-round" ${result?.valid ? "" : "disabled"}>儲存本場</button>
          <button id="reset-draft" class="secondary">清空輸入</button>
        </div>
      </div>
    </section>
  `;
}

function renderResultCards(players: ReturnType<typeof calculateRound>["players"]): string {
  return players
    .map((item) => {
      const name = playerName(state.players, item.playerId);
      return `
        <article class="result-card">
          <div class="result-head">
            <strong>${name}</strong>
            <span class="amount ${amountClass(item.total)}">${formatAmount(item.total)}</span>
          </div>
          <details>
            <summary>明細</summary>
            <div class="table-wrap">
              <table>
                <tbody>
                  <tr><th>分數勝負</th><td>${formatAmount(item.scoreAmount)}</td></tr>
                  <tr><th>讓桿勝負</th><td>${formatAmount(item.handicapAmount)}</td></tr>
                  ${item.matchups
                    .map(
                      (matchup) => `
                        <tr>
                          <th>對 ${playerName(state.players, matchup.opponentId)}（讓 ${matchup.handicap}）</th>
                          <td>${formatAmount(matchup.cappedAmount)}</td>
                        </tr>
                      `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </details>
        </article>
      `;
    })
    .join("");
}

function renderSwipeNumberInput(inputClass: string, playerId: string, value: number): string {
  return `
    <div class="swipe-number" data-player="${playerId}">
      <button type="button" class="step-button step-minus" data-delta="-1" aria-label="decrease">-</button>
      <input inputmode="numeric" type="number" class="${inputClass} swipe-input" data-player="${playerId}" value="${value}" />
      <button type="button" class="step-button step-plus" data-delta="1" aria-label="increase">+</button>
      <div class="swipe-handle" role="slider" aria-label="swipe to adjust" tabindex="0">左右滑動調整</div>
    </div>
  `;
}

function renderHistory(): string {
  const totals = totalsByPlayer(state);
  const ordered = [...state.players].sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0));

  return `
    <section class="section">
      <h2>累計勝負</h2>
      <div class="table-wrap panel">
        <table>
          <thead><tr><th>姓名</th><th>累計</th></tr></thead>
          <tbody>
            ${ordered
              .map((player) => `<tr><td>${player.name}</td><td class="amount ${amountClass(totals[player.id] ?? 0)}">${formatAmount(totals[player.id] ?? 0)}</td></tr>`)
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
    <section class="section">
      <h2>新場次</h2>
      <div class="grid">
        ${state.rounds.length === 0 ? `<p class="muted">尚未儲存新場次。</p>` : [...state.rounds].reverse().map(renderRoundRecord).join("")}
      </div>
    </section>
    <section class="section">
      <h2>Excel 歷史總表</h2>
      <div class="grid">
        ${state.legacyRecords
          .slice()
          .reverse()
          .map(
            (record) => `
              <article class="history-item">
                <div class="history-head">
                  <strong>${record.label}</strong>
                  <span class="muted">歷史匯入</span>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderRoundRecord(round: RoundRecord): string {
  return `
    <article class="history-item">
      <div class="history-head">
        <strong>${round.input.date}</strong>
        <button class="danger delete-round" data-id="${round.id}">刪除</button>
      </div>
      <p class="muted">${round.input.playerIds.map((id) => playerName(state.players, id)).join("、")}</p>
      <div class="table-wrap">
        <table>
          <tbody>
            ${round.result.players
              .map(
                (item) => `
                  <tr>
                    <td>${playerName(state.players, item.playerId)}</td>
                    <td class="amount ${amountClass(item.total)}">${formatAmount(item.total)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderHandicap(): string {
  const active = state.players.filter((player) => player.active);
  return `
    <section class="section">
      <h2>參賽者</h2>
      <div class="panel grid">
        <div class="row">
          <input id="new-player-name" placeholder="新增姓名" />
          <button id="add-player">新增</button>
        </div>
        <div class="grid">
          ${state.players
            .map(
              (player) => `
                <label class="row">
                  <input type="checkbox" class="active-toggle" data-player="${player.id}" ${player.active ? "checked" : ""} />
                  <span>${player.name}</span>
                </label>
              `
            )
            .join("")}
        </div>
      </div>
    </section>
    <section class="section">
      <h2>兩兩讓桿</h2>
      <div class="panel grid">
        <div class="grid two">
          <label>
            <span class="label">球友 A</span>
            <select id="handicap-a">${active.map((player) => `<option value="${player.id}">${player.name}</option>`).join("")}</select>
          </label>
          <label>
            <span class="label">球友 B</span>
            <select id="handicap-b">${active.map((player, index) => `<option value="${player.id}" ${index === 1 ? "selected" : ""}>${player.name}</option>`).join("")}</select>
          </label>
        </div>
        <label>
          <span class="label">A 對 B 讓桿值</span>
          <input id="handicap-value" inputmode="numeric" type="number" value="0" />
        </label>
        <button id="save-handicap">儲存讓桿</button>
        <p class="muted">儲存時會同步更新反向值，例如 A 對 B 為 6，B 對 A 會是 -6。</p>
      </div>
    </section>
  `;
}

function renderSettings(): string {
  return `
    <section class="section">
      <h2>倍率設定</h2>
      <div class="panel grid">
        <label>
          <span class="label">分數勝負倍率</span>
          <input id="score-multiplier" inputmode="numeric" type="number" value="${state.settings.scoreMultiplier}" />
        </label>
        <label>
          <span class="label">讓桿勝負倍率</span>
          <input id="handicap-multiplier" inputmode="numeric" type="number" value="${state.settings.handicapMultiplier}" />
        </label>
        <label>
          <span class="label">單一對戰封頂</span>
          <input id="matchup-cap" inputmode="numeric" type="number" value="${state.settings.matchupCap}" />
        </label>
        <button id="save-settings">儲存設定</button>
      </div>
    </section>
    <section class="section">
      <h2>備份與匯出</h2>
      <div class="panel grid">
        <div class="actions">
          <button id="export-json">匯出 JSON</button>
          <button id="export-csv" class="secondary">匯出 CSV</button>
          <button id="clear-local-data" class="danger">清空本機資料</button>
        </div>
        <label>
          <span class="label">匯入 JSON 備份</span>
          <input id="import-json" type="file" accept="application/json" />
        </label>
      </div>
    </section>
  `;
}

function bindCommonEvents(): void {
  app.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      view = button.dataset.view as View;
      render();
    });
  });
}

function bindScoreEvents(): void {
  app.querySelector<HTMLSelectElement>("#player-count")?.addEventListener("change", (event) => {
    const count = Number((event.target as HTMLSelectElement).value);
    const activeIds = state.players.filter((player) => player.active).map((player) => player.id);
    selectedIds = activeIds.slice(0, count).map((id, index) => selectedIds[index] ?? id);
    render();
  });

  app.querySelectorAll<HTMLSelectElement>(".player-select").forEach((select) => {
    select.addEventListener("change", () => {
      selectedIds[Number(select.dataset.index)] = select.value;
      render();
    });
  });

  bindNumberInputs(".score-input", draftScores);
  bindNumberInputs(".stroke-input", draftStrokes);
  bindSwipeNumberInputs(".score-input", draftScores);
  bindSwipeNumberInputs(".stroke-input", draftStrokes);

  app.querySelector<HTMLTextAreaElement>("#round-note")?.addEventListener("input", (event) => {
    draftNote = (event.target as HTMLTextAreaElement).value;
  });

  app.querySelector<HTMLButtonElement>("#reset-draft")?.addEventListener("click", () => {
    draftScores = {};
    draftStrokes = {};
    draftNote = "";
    selectedIds.forEach((id) => {
      draftScores[id] = 0;
      draftStrokes[id] = 0;
    });
    render();
  });

  app.querySelector<HTMLButtonElement>("#save-round")?.addEventListener("click", async () => {
    const input = currentInput();
    if (!input) return;
    const result = calculateRound(input, state.handicap);
    if (!result.valid) return;
    state.rounds.push({
      id: crypto.randomUUID(),
      input,
      result,
      createdAt: new Date().toISOString()
    });
    await persist();
    draftNote = "";
    view = "history";
    render();
  });
}

function bindHistoryEvents(): void {
  app.querySelectorAll<HTMLButtonElement>(".delete-round").forEach((button) => {
    button.addEventListener("click", async () => {
      state.rounds = state.rounds.filter((round) => round.id !== button.dataset.id);
      await persist();
      render();
    });
  });
}

function bindHandicapEvents(): void {
  const a = app.querySelector<HTMLSelectElement>("#handicap-a");
  const b = app.querySelector<HTMLSelectElement>("#handicap-b");
  const value = app.querySelector<HTMLInputElement>("#handicap-value");
  const syncValue = () => {
    if (!a || !b || !value) return;
    value.value = String(getHandicap(state.handicap, a.value, b.value));
  };
  a?.addEventListener("change", syncValue);
  b?.addEventListener("change", syncValue);
  syncValue();

  app.querySelector<HTMLButtonElement>("#save-handicap")?.addEventListener("click", async () => {
    if (!a || !b || !value || a.value === b.value) return;
    state.handicap = setHandicap(state.handicap, a.value, b.value, Number(value.value));
    await persist();
    render();
  });

  app.querySelector<HTMLButtonElement>("#add-player")?.addEventListener("click", async () => {
    const input = app.querySelector<HTMLInputElement>("#new-player-name");
    const name = input?.value.trim();
    if (!name) return;
    state.players.push({ id: crypto.randomUUID(), name, active: true });
    await persist();
    render();
  });

  app.querySelectorAll<HTMLInputElement>(".active-toggle").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const player = state.players.find((item) => item.id === checkbox.dataset.player);
      if (player) player.active = checkbox.checked;
      await persist();
      render();
    });
  });
}

function bindSettingsEvents(): void {
  app.querySelector<HTMLButtonElement>("#save-settings")?.addEventListener("click", async () => {
    state.settings = {
      scoreMultiplier: readInput("#score-multiplier"),
      handicapMultiplier: readInput("#handicap-multiplier"),
      matchupCap: readInput("#matchup-cap")
    };
    await persist();
    render();
  });

  app.querySelector<HTMLButtonElement>("#export-json")?.addEventListener("click", () => {
    downloadText(`play-golf-${today()}.json`, JSON.stringify(state, null, 2), "application/json");
  });

  app.querySelector<HTMLButtonElement>("#export-csv")?.addEventListener("click", () => {
    downloadText(`play-golf-${today()}.csv`, `\uFEFF${stateToCsv(state)}`, "text/csv;charset=utf-8");
  });

  app.querySelector<HTMLInputElement>("#import-json")?.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const imported = JSON.parse(await file.text()) as AppState;
    if (imported.schemaVersion !== 1) throw new Error("Unsupported backup schema");
    state = imported;
    await persist();
    render();
  });

  app.querySelector<HTMLButtonElement>("#clear-local-data")?.addEventListener("click", async () => {
    const confirmed = window.confirm("確定要清空這台裝置的本機資料？場次紀錄、修改後讓桿與設定都會重設。");
    if (!confirmed) return;
    state = createInitialState();
    selectedIds = state.players.filter((player) => player.active).slice(0, 4).map((player) => player.id);
    draftScores = {};
    draftStrokes = {};
    draftNote = "";
    selectedIds.forEach((id) => {
      draftScores[id] = 0;
      draftStrokes[id] = 0;
    });
    await persist();
    view = "score";
    render();
  });
}

function bindNumberInputs(selector: string, target: Record<string, number>): void {
  app.querySelectorAll<HTMLInputElement>(selector).forEach((input) => {
    input.addEventListener("input", () => {
      target[input.dataset.player ?? ""] = Number(input.value);
    });
    input.addEventListener("change", () => {
      render();
    });
  });
}

function bindSwipeNumberInputs(selector: string, target: Record<string, number>): void {
  app.querySelectorAll<HTMLInputElement>(selector).forEach((input) => {
    const control = input.closest<HTMLElement>(".swipe-number");
    const handle = control?.querySelector<HTMLElement>(".swipe-handle");
    if (!control || !handle) return;

    control.querySelectorAll<HTMLButtonElement>(".step-button").forEach((button) => {
      button.addEventListener("click", () => {
        const playerId = input.dataset.player ?? "";
        const next = Number(input.value || 0) + Number(button.dataset.delta ?? 0);
        setDraftNumber(input, target, playerId, next);
        render();
      });
    });

    let startX = 0;
    let startValue = 0;
    let lastValue = 0;
    let dragging = false;

    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      startX = event.clientX;
      startValue = Number(input.value || 0);
      lastValue = startValue;
      dragging = true;
      control.classList.add("dragging");
      handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      event.preventDefault();
      const playerId = input.dataset.player ?? "";
      const steps = Math.trunc((event.clientX - startX) / SWIPE_STEP_PX);
      const next = startValue + steps;
      if (next === lastValue) return;
      lastValue = next;
      setDraftNumber(input, target, playerId, next);
      updateLiveResult();
    });

    const endDrag = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      control.classList.remove("dragging");
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      render();
    };

    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
  });
}

function setDraftNumber(input: HTMLInputElement, target: Record<string, number>, playerId: string, value: number): void {
  target[playerId] = value;
  input.value = String(value);
}

function updateLiveResult(): void {
  const input = currentInput();
  if (!input) return;
  const result = calculateRound(input, state.handicap);
  const container = app.querySelector<HTMLElement>(".results");
  if (container) container.innerHTML = renderResultCards(result.players);
}

function currentInput(): RoundInput | undefined {
  const unique = new Set(selectedIds);
  if (unique.size !== selectedIds.length || selectedIds.length < 3 || selectedIds.length > 4) return undefined;

  return {
    date: today(),
    playerIds: selectedIds,
    scores: Object.fromEntries(selectedIds.map((id) => [id, Number(draftScores[id] ?? 0)])),
    strokes: Object.fromEntries(selectedIds.map((id) => [id, Number(draftStrokes[id] ?? 0)])),
    note: draftNote,
    settingsSnapshot: { ...state.settings }
  };
}

async function persist(): Promise<void> {
  await saveState(state);
}

function readInput(selector: string): number {
  return Number(app.querySelector<HTMLInputElement>(selector)?.value ?? 0);
}

function formatAmount(value: number): string {
  const abs = Math.abs(value).toLocaleString("zh-TW");
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return "0";
}

function amountClass(value: number): string {
  if (value > 0) return "win";
  if (value < 0) return "lose";
  return "neutral";
}

function today(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}

function registerServiceWorker(): void {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL
      });
    });
  }
}
