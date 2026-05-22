import "./styles.css";
import { downloadText, playerName, stateToCsv, totalsByPlayer } from "./exporters";
import { parseTemplateWorkbook } from "./excelImport";
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
const STROKE_SWIPE_STEP_PX = 8;
const HANDICAP_SWIPE_STEP_PX = 16;
const DEFAULT_STROKE_VALUE = 80;

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing app root");
const app: HTMLDivElement = root;

void boot();

async function boot(): Promise<void> {
  state = await loadState();
  selectedIds = state.players.filter((player) => player.active).slice(0, 4).map((player) => player.id);
  resetDraftInputs();
  render();
  preventDoubleTapZoom();
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
  const canCreateRound = activePlayers.length >= 3;

  return `
    <section class="section">
      <h2>本場參賽者</h2>
      <div class="panel grid">
        ${canCreateRound ? "" : `<p class="error">至少需要 3 位啟用中的參賽者才能建立場次。</p>`}
        <label>
          <span class="label">人數</span>
          <select id="player-count" ${canCreateRound ? "" : "disabled"}>
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
                  <select class="player-select" data-index="${index}" ${canCreateRound ? "" : "disabled"}>
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
            <div class="result-details">
              <div class="result-detail-row">
                <span>分數勝負</span>
                <strong class="amount ${amountClass(item.scoreAmount)}">${formatAmount(item.scoreAmount)}</strong>
              </div>
              <div class="result-detail-row">
                <span>讓桿勝負</span>
                <strong class="amount ${amountClass(item.handicapAmount)}">${formatAmount(item.handicapAmount)}</strong>
              </div>
              ${item.matchups
                .map(
                  (matchup) => `
                    <div class="result-detail-row">
                      <span>對 ${playerName(state.players, matchup.opponentId)}（讓 ${matchup.handicap}）</span>
                      <strong class="amount ${amountClass(matchup.cappedAmount)}">${formatAmount(matchup.cappedAmount)}</strong>
                    </div>
                  `
                )
                .join("")}
            </div>
          </details>
        </article>
      `;
    })
    .join("");
}

function renderSwipeNumberInput(inputClass: string, playerId: string, value: number, stepPx?: number, id?: string): string {
  const resolvedStepPx = stepPx ?? (inputClass === "stroke-input" ? STROKE_SWIPE_STEP_PX : SWIPE_STEP_PX);
  const idAttr = id ? ` id="${id}"` : "";
  return `
    <div class="swipe-number" data-player="${playerId}" data-step-px="${resolvedStepPx}">
      <button type="button" class="step-button step-minus" data-delta="-1" aria-label="decrease">-</button>
      <input${idAttr} inputmode="numeric" type="number" class="${inputClass} swipe-input" data-player="${playerId}" value="${value}" />
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
      <div class="history-total-list panel">
        ${ordered
          .map(
            (player) => `
              <div class="history-total-row">
                <strong>${player.name}</strong>
                <span class="amount ${amountClass(totals[player.id] ?? 0)}">${formatAmount(totals[player.id] ?? 0)}</span>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
    <section class="section">
      <h2>新場次</h2>
      <div class="grid">
        ${state.rounds.length === 0 ? `<p class="muted">尚未儲存新場次。</p>` : [...state.rounds].reverse().map(renderRoundRecord).join("")}
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
      <div class="history-results">
        ${round.result.players
          .map(
            (item) => `
              <div class="history-result-row">
                <div>
                  <strong>${playerName(state.players, item.playerId)}</strong>
                  <span class="muted">分數 ${round.input.scores[item.playerId] ?? 0} / 桿數 ${round.input.strokes[item.playerId] ?? 0}</span>
                </div>
                <span class="amount ${amountClass(item.total)}">${formatAmount(item.total)}</span>
              </div>
            `
          )
          .join("")}
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
                <div class="player-toggle-row">
                  <label class="player-toggle">
                    <input type="checkbox" class="active-toggle" data-player="${player.id}" ${player.active ? "checked" : ""} />
                    <span>${player.name}</span>
                  </label>
                  <span class="muted">${player.active ? "啟用中" : "已停用"}</span>
                  ${player.active ? `<button class="danger remove-player" data-player="${player.id}">移除</button>` : ""}
                </div>
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
          ${renderSwipeNumberInput("handicap-value-input", "handicap", 0, HANDICAP_SWIPE_STEP_PX, "handicap-value")}
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
          <span class="label">匯入 Excel 範本</span>
          <input id="import-excel" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        </label>
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
    selectedIds.forEach(ensureDraftInput);
    render();
  });

  app.querySelectorAll<HTMLSelectElement>(".player-select").forEach((select) => {
    select.addEventListener("change", () => {
      selectedIds[Number(select.dataset.index)] = select.value;
      ensureDraftInput(select.value);
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
    selectedIds.forEach(ensureDraftInput);
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
  bindStandaloneSwipeInput(".handicap-value-input");

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

    const existing = state.players.find((player) => player.name.trim() === name);
    if (existing?.active) {
      window.alert(`已經有啟用中的參賽者「${name}」。`);
      return;
    }

    if (existing && !existing.active) {
      const confirmed = window.confirm(`已有已停用的參賽者「${name}」，是否重新啟用？`);
      if (!confirmed) return;
      existing.active = true;
      normalizeSelectedPlayers();
      await persist();
      render();
      return;
    }

    state.players.push({ id: crypto.randomUUID(), name, active: true });
    normalizeSelectedPlayers();
    await persist();
    render();
  });

  app.querySelectorAll<HTMLInputElement>(".active-toggle").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const player = state.players.find((item) => item.id === checkbox.dataset.player);
      if (player) player.active = checkbox.checked;
      normalizeSelectedPlayers();
      await persist();
      render();
    });
  });

  app.querySelectorAll<HTMLButtonElement>(".remove-player").forEach((button) => {
    button.addEventListener("click", async () => {
      const player = state.players.find((item) => item.id === button.dataset.player);
      if (!player) return;
      const confirmed = window.confirm(`確定要移除 ${player.name}？歷史紀錄會保留，但不再出現在選人與讓桿選單。`);
      if (!confirmed) return;
      player.active = false;
      normalizeSelectedPlayers();
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

  app.querySelector<HTMLInputElement>("#import-excel")?.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const imported = await parseTemplateWorkbook(file, state.settings);
      state = imported;
      selectedIds = state.players.filter((player) => player.active).slice(0, 4).map((player) => player.id);
      resetDraftInputs();
      await persist();
      downloadText(`play-golf-imported-${today()}.json`, JSON.stringify(state, null, 2), "application/json");
      view = "score";
      render();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Excel 匯入失敗。");
    }
  });

  app.querySelector<HTMLButtonElement>("#clear-local-data")?.addEventListener("click", async () => {
    const confirmed = window.confirm("確定要清空這台裝置的本機資料？場次紀錄、修改後讓桿與設定都會重設。");
    if (!confirmed) return;
    state = createInitialState();
    selectedIds = state.players.filter((player) => player.active).slice(0, 4).map((player) => player.id);
    resetDraftInputs();
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
      const stepPx = Number(control.dataset.stepPx ?? SWIPE_STEP_PX);
      const steps = Math.trunc((event.clientX - startX) / stepPx);
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

function bindStandaloneSwipeInput(selector: string): void {
  app.querySelectorAll<HTMLInputElement>(selector).forEach((input) => {
    const control = input.closest<HTMLElement>(".swipe-number");
    const handle = control?.querySelector<HTMLElement>(".swipe-handle");
    if (!control || !handle) return;

    control.querySelectorAll<HTMLButtonElement>(".step-button").forEach((button) => {
      button.addEventListener("click", () => {
        input.value = String(Number(input.value || 0) + Number(button.dataset.delta ?? 0));
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
      const stepPx = Number(control.dataset.stepPx ?? SWIPE_STEP_PX);
      const steps = Math.trunc((event.clientX - startX) / stepPx);
      const next = startValue + steps;
      if (next === lastValue) return;
      lastValue = next;
      input.value = String(next);
    });

    const endDrag = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      control.classList.remove("dragging");
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
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

function normalizeSelectedPlayers(): void {
  const activeIds = state.players.filter((player) => player.active).map((player) => player.id);
  const targetCount = Math.min(Math.max(selectedIds.length, 3), 4, activeIds.length);
  const kept = selectedIds.filter((id, index, ids) => activeIds.includes(id) && ids.indexOf(id) === index).slice(0, targetCount);

  for (const id of activeIds) {
    if (kept.length >= targetCount) break;
    if (!kept.includes(id)) kept.push(id);
  }

  selectedIds = kept;
  selectedIds.forEach(ensureDraftInput);
}

function resetDraftInputs(): void {
  draftScores = {};
  draftStrokes = {};
  draftNote = "";
  selectedIds.forEach(ensureDraftInput);
}

function ensureDraftInput(id: string): void {
  draftScores[id] = draftScores[id] ?? 0;
  draftStrokes[id] = draftStrokes[id] ?? DEFAULT_STROKE_VALUE;
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

function preventDoubleTapZoom(): void {
  let lastTouchEnd = 0;

  document.addEventListener(
    "touchend",
    (event) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) event.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );
}
