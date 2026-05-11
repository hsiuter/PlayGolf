import type { AppState, Player } from "./types";

export function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function stateToCsv(state: AppState): string {
  const header = ["日期", "類型", ...state.players.map((player) => player.name), "備註"];
  const lines = [header.map(csvCell).join(",")];

  for (const record of state.legacyRecords) {
    lines.push(
      [
        record.label,
        "歷史匯入",
        ...state.players.map((player) => String(record.totals[player.id] ?? "")),
        "Excel 歷史總表"
      ]
        .map(csvCell)
        .join(",")
    );
  }

  for (const round of state.rounds) {
    lines.push(
      [
        round.input.date,
        "新場次",
        ...state.players.map((player) => {
          const result = round.result.players.find((item) => item.playerId === player.id);
          return result ? String(result.total) : "";
        }),
        round.input.note ?? ""
      ]
        .map(csvCell)
        .join(",")
    );
  }

  return lines.join("\n");
}

export function totalsByPlayer(state: AppState): Record<string, number> {
  const totals = Object.fromEntries(state.players.map((player) => [player.id, 0])) as Record<string, number>;

  for (const record of state.legacyRecords) {
    for (const [playerId, amount] of Object.entries(record.totals)) totals[playerId] = (totals[playerId] ?? 0) + amount;
  }

  for (const round of state.rounds) {
    for (const item of round.result.players) totals[item.playerId] = (totals[item.playerId] ?? 0) + item.total;
  }

  return totals;
}

export function playerName(players: Player[], id: string): string {
  return players.find((player) => player.id === id)?.name ?? id;
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
