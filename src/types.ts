export type Player = {
  id: string;
  name: string;
  active: boolean;
};

export type AppSettings = {
  scoreMultiplier: number;
  handicapMultiplier: number;
  matchupCap: number;
};

export type HandicapMatrix = Record<string, number>;

export type RoundInput = {
  date: string;
  playerIds: string[];
  scores: Record<string, number>;
  strokes: Record<string, number>;
  note?: string;
  settingsSnapshot: AppSettings;
};

export type MatchupResult = {
  opponentId: string;
  handicap: number;
  strokeDelta: number;
  rawAmount: number;
  cappedAmount: number;
};

export type PlayerRoundResult = {
  playerId: string;
  scoreAmount: number;
  handicapAmount: number;
  total: number;
  matchups: MatchupResult[];
};

export type RoundResult = {
  players: PlayerRoundResult[];
  grandTotal: number;
  valid: boolean;
};

export type RoundRecord = {
  id: string;
  input: RoundInput;
  result: RoundResult;
  createdAt: string;
};

export type LegacyRecord = {
  id: string;
  label: string;
  serial?: number;
  totals: Record<string, number>;
};

export type AppState = {
  schemaVersion: 1;
  players: Player[];
  handicap: HandicapMatrix;
  settings: AppSettings;
  rounds: RoundRecord[];
  legacyRecords: LegacyRecord[];
};
