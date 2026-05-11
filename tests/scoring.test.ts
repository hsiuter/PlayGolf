import assert from "node:assert/strict";
import { createInitialHandicap } from "../src/initialData";
import { calculateRound, DEFAULT_SETTINGS, getHandicap, setHandicap } from "../src/scoring";
import type { RoundInput } from "../src/types";

const matrix = createInitialHandicap();

const sampleCase: RoundInput = {
  date: "2026/05/11",
  playerIds: ["p01", "p02", "p03", "p04"],
  scores: { p01: 8, p02: 20, p03: 40, p04: 30 },
  strokes: { p01: 97, p02: 86, p03: 96, p04: 89 },
  settingsSnapshot: DEFAULT_SETTINGS
};

const sampleResult = calculateRound(sampleCase, matrix);
assert.equal(sampleResult.valid, true);
assert.deepEqual(
  Object.fromEntries(sampleResult.players.map((player) => [player.playerId, player.total])),
  { p01: -3120, p02: 1640, p03: -960, p04: 2440 }
);

const threePlayer = calculateRound(
  {
    date: "2026/05/11",
    playerIds: ["a", "b", "c"],
    scores: { a: 10, b: 20, c: 30 },
    strokes: { a: 80, b: 90, c: 100 },
    settingsSnapshot: DEFAULT_SETTINGS
  },
  {}
);
assert.equal(threePlayer.valid, true);
assert.deepEqual(
  Object.fromEntries(threePlayer.players.map((player) => [player.playerId, player.scoreAmount])),
  { a: -600, b: 0, c: 600 }
);

const capped = calculateRound(
  {
    date: "2026/05/11",
    playerIds: ["a", "b", "c"],
    scores: { a: 0, b: 0, c: 0 },
    strokes: { a: 60, b: 90, c: 100 },
    settingsSnapshot: DEFAULT_SETTINGS
  },
  {}
);
assert.equal(capped.players.find((player) => player.playerId === "a")?.handicapAmount, 2000);
assert.equal(capped.valid, true);

const changed = setHandicap({}, "a", "b", 6);
assert.equal(getHandicap(changed, "a", "b"), 6);
assert.equal(getHandicap(changed, "b", "a"), -6);

console.log("scoring tests passed");
