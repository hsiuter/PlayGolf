import * as XLSX from "xlsx";
import { DEFAULT_SETTINGS, pairKey } from "./scoring";
import type { AppSettings, AppState, HandicapMatrix, LegacyRecord, Player } from "./types";

const PLAYER_HEADER_ROW = 1;
const PLAYER_FIRST_COLUMN = 1;
const PLAYER_NAME_COLUMN = 0;
const PLAYER_FIRST_ROW = 2;
const MAX_PLAYERS = 80;

export async function parseTemplateWorkbook(file: File, currentSettings: AppSettings): Promise<AppState> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("找不到第一張工作表。");

  const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
    header: 1,
    raw: true,
    blankrows: false
  });

  const players = parsePlayers(rows);
  if (players.length < 3) throw new Error("Excel 內至少需要 3 位球友。");

  return {
    schemaVersion: 1,
    players,
    handicap: parseHandicap(rows, players),
    settings: currentSettings ?? DEFAULT_SETTINGS,
    rounds: [],
    legacyRecords: parseLegacyRecords(rows, players)
  };
}

function parsePlayers(rows: Array<Array<string | number | null>>): Player[] {
  const header = rows[PLAYER_HEADER_ROW] ?? [];
  const names: string[] = [];

  for (let column = PLAYER_FIRST_COLUMN; column < header.length && names.length < MAX_PLAYERS; column++) {
    const name = cleanName(header[column]);
    if (!name) break;
    names.push(name);
  }

  return names.map((name, index) => ({
    id: `p${String(index + 1).padStart(2, "0")}`,
    name,
    active: true
  }));
}

function parseHandicap(rows: Array<Array<string | number | null>>, players: Player[]): HandicapMatrix {
  const matrix: HandicapMatrix = {};

  for (let rowIndex = PLAYER_FIRST_ROW; rowIndex < PLAYER_FIRST_ROW + players.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    const rowName = cleanName(row[PLAYER_NAME_COLUMN]);
    const rowPlayer = players.find((player) => player.name === rowName);
    if (!rowPlayer) continue;

    for (let columnIndex = PLAYER_FIRST_COLUMN; columnIndex < PLAYER_FIRST_COLUMN + players.length; columnIndex++) {
      const columnPlayer = players[columnIndex - PLAYER_FIRST_COLUMN];
      if (!columnPlayer || columnPlayer.id === rowPlayer.id) continue;
      const value = toNumber(row[columnIndex]);
      if (value === undefined) continue;
      matrix[pairKey(columnPlayer.id, rowPlayer.id)] = value;
      matrix[pairKey(rowPlayer.id, columnPlayer.id)] = -value;
    }
  }

  for (const player of players) {
    for (const opponent of players) {
      if (player.id !== opponent.id && matrix[pairKey(player.id, opponent.id)] === undefined) {
        matrix[pairKey(player.id, opponent.id)] = 0;
      }
    }
  }

  return matrix;
}

function parseLegacyRecords(rows: Array<Array<string | number | null>>, players: Player[]): LegacyRecord[] {
  const records: LegacyRecord[] = [];

  for (let rowIndex = PLAYER_FIRST_ROW + players.length; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    const firstCell = row[0];
    const label = formatLegacyLabel(firstCell);
    if (!label) continue;

    const totals: Record<string, number> = {};
    for (let columnIndex = PLAYER_FIRST_COLUMN; columnIndex < PLAYER_FIRST_COLUMN + players.length; columnIndex++) {
      const amount = toNumber(row[columnIndex]);
      if (amount !== undefined && amount !== 0) totals[players[columnIndex - PLAYER_FIRST_COLUMN].id] = amount;
    }

    if (Object.keys(totals).length > 0) {
      records.push({
        id: `legacy-${records.length + 1}`,
        label,
        serial: typeof firstCell === "number" ? firstCell : undefined,
        totals
      });
    }
  }

  return records;
}

function cleanName(value: string | number | null | undefined): string {
  return String(value ?? "").trim();
}

function toNumber(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function formatLegacyLabel(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && value > 30000) return excelSerialToDateLabel(value);
  return String(value).trim();
}

function excelSerialToDateLabel(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}
