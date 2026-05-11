import type { AppSettings, HandicapMatrix, RoundInput, RoundResult } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  scoreMultiplier: 20,
  handicapMultiplier: 100,
  matchupCap: 1000
};

export function pairKey(playerId: string, opponentId: string): string {
  return `${playerId}|${opponentId}`;
}

export function getHandicap(matrix: HandicapMatrix, playerId: string, opponentId: string): number {
  if (playerId === opponentId) return 0;
  const direct = matrix[pairKey(playerId, opponentId)];
  if (Number.isFinite(direct)) return direct;
  const reverse = matrix[pairKey(opponentId, playerId)];
  return Number.isFinite(reverse) ? -reverse : 0;
}

export function setHandicap(matrix: HandicapMatrix, playerId: string, opponentId: string, value: number): HandicapMatrix {
  return {
    ...matrix,
    [pairKey(playerId, opponentId)]: value,
    [pairKey(opponentId, playerId)]: -value
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function calculateRound(input: RoundInput, matrix: HandicapMatrix): RoundResult {
  const ids = input.playerIds;
  const settings = input.settingsSnapshot;
  const scoreSum = ids.reduce((sum, id) => sum + readNumber(input.scores[id]), 0);

  const players = ids.map((playerId) => {
    const ownScore = readNumber(input.scores[playerId]);
    const scoreAmount = (ownScore * (ids.length - 1) - (scoreSum - ownScore)) * settings.scoreMultiplier;

    const matchups = ids
      .filter((opponentId) => opponentId !== playerId)
      .map((opponentId) => {
        const handicap = getHandicap(matrix, playerId, opponentId);
        const strokeDelta = readNumber(input.strokes[opponentId]) + handicap - readNumber(input.strokes[playerId]);
        const rawAmount = strokeDelta * settings.handicapMultiplier;
        const cappedAmount = clamp(rawAmount, -settings.matchupCap, settings.matchupCap);

        return {
          opponentId,
          handicap,
          strokeDelta,
          rawAmount,
          cappedAmount
        };
      });

    const handicapAmount = matchups.reduce((sum, item) => sum + item.cappedAmount, 0);

    return {
      playerId,
      scoreAmount,
      handicapAmount,
      total: scoreAmount + handicapAmount,
      matchups
    };
  });

  const grandTotal = players.reduce((sum, player) => sum + player.total, 0);

  return {
    players,
    grandTotal,
    valid: Math.abs(grandTotal) < 0.0001
  };
}

function readNumber(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}
