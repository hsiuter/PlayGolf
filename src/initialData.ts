import { DEFAULT_SETTINGS, pairKey } from "./scoring";
import type { AppState, HandicapMatrix, LegacyRecord, Player } from "./types";

export const INITIAL_PLAYERS: Player[] = [
  { id: "p01", name: "球友 A", active: true },
  { id: "p02", name: "球友 B", active: true },
  { id: "p03", name: "球友 C", active: true },
  { id: "p04", name: "球友 D", active: true },
  { id: "p05", name: "球友 E", active: true },
  { id: "p06", name: "球友 F", active: true },
  { id: "p07", name: "球友 G", active: true },
  { id: "p08", name: "球友 H", active: true }
];

const SAMPLE_HANDICAPS: Array<[string, string, number]> = [
  ["p01", "p02", -2],
  ["p01", "p03", 3],
  ["p01", "p04", -5],
  ["p01", "p05", 4],
  ["p01", "p06", -1],
  ["p01", "p07", 6],
  ["p01", "p08", -4],
  ["p02", "p03", 5],
  ["p02", "p04", -3],
  ["p02", "p05", 6],
  ["p02", "p06", 1],
  ["p02", "p07", 8],
  ["p02", "p08", -2],
  ["p03", "p04", -8],
  ["p03", "p05", 1],
  ["p03", "p06", -4],
  ["p03", "p07", 3],
  ["p03", "p08", -7],
  ["p04", "p05", 9],
  ["p04", "p06", 4],
  ["p04", "p07", 11],
  ["p04", "p08", 1],
  ["p05", "p06", -5],
  ["p05", "p07", 2],
  ["p05", "p08", -8],
  ["p06", "p07", 7],
  ["p06", "p08", -3],
  ["p07", "p08", -10]
];

export function createInitialHandicap(): HandicapMatrix {
  const matrix: HandicapMatrix = {};
  for (const [playerId, opponentId, value] of SAMPLE_HANDICAPS) {
    matrix[pairKey(playerId, opponentId)] = value;
    matrix[pairKey(opponentId, playerId)] = -value;
  }
  return matrix;
}

export function createLegacyRecords(): LegacyRecord[] {
  return [];
}

export function createInitialState(): AppState {
  return {
    schemaVersion: 1,
    players: INITIAL_PLAYERS,
    handicap: createInitialHandicap(),
    settings: DEFAULT_SETTINGS,
    rounds: [],
    legacyRecords: createLegacyRecords()
  };
}
