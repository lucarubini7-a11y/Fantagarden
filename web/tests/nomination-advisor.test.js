import test from "node:test";
import assert from "node:assert/strict";
import { suggestNominations } from "../src/nomination-advisor.js";

const player = (id, ruolo, fvm) => ({ id, ruolo, nome: `Player ${id}`, fvm_scaled: fvm });

test("signal A: a thinning-out watchlist target scores as a ready target", () => {
  const target = player(1, "A", 50);
  const filler = player(2, "A", 40);
  const result = suggestNominations({
    watchlist: { 1: { priority: "alta", maxBid: 40, note: "" } },
    availablePlayers: [target, filler],
    myTeam: { slotsByRole: { P: 1, D: 1, C: 1, A: 1 } },
    budgetPlan: { A: { budgetRemaining: 100 } },
    opponentTeams: [
      { name: "Squadra 2", budgetResidual: 300, slotsByRole: { P: 0, D: 0, C: 0, A: 2 } },
      { name: "Squadra 3", budgetResidual: 50, slotsByRole: { P: 0, D: 0, C: 0, A: 1 } },
      { name: "Squadra 4", budgetResidual: 60, slotsByRole: { P: 0, D: 0, C: 0, A: 0 } },
    ],
  });
  const suggestion = result.find((entry) => entry.player.id === 1);
  assert.ok(suggestion, "the watchlist target should be suggested");
  assert.equal(suggestion.primarySignal, "readyTarget");
  assert.equal(suggestion.score, 60);
  assert.match(suggestion.reasons[0], /obiettivo/i);
});

test("signal A does not fire once too many opponents can still fight for the role", () => {
  const target = player(1, "A", 50);
  const result = suggestNominations({
    watchlist: { 1: { priority: "alta", maxBid: 40, note: "" } },
    availablePlayers: [target],
    myTeam: { slotsByRole: { P: 1, D: 1, C: 1, A: 1 } },
    opponentTeams: [
      { name: "Squadra 2", budgetResidual: 300, slotsByRole: { P: 0, D: 0, C: 0, A: 2 } },
      { name: "Squadra 3", budgetResidual: 290, slotsByRole: { P: 0, D: 0, C: 0, A: 1 } },
      { name: "Squadra 4", budgetResidual: 10, slotsByRole: { P: 0, D: 0, C: 0, A: 0 } },
    ],
  });
  assert.equal(result.find((entry) => entry.player.id === 1), undefined);
});

test("signal B: a non-target that would drain two well-funded opponents is a decoy", () => {
  const decoy = player(3, "D", 20);
  const result = suggestNominations({
    watchlist: {},
    availablePlayers: [decoy],
    opponentTeams: [
      { name: "Squadra A", budgetResidual: 400, slotsByRole: { P: 0, D: 3, C: 0, A: 0 } },
      { name: "Squadra B", budgetResidual: 350, slotsByRole: { P: 0, D: 2, C: 0, A: 0 } },
      { name: "Squadra C", budgetResidual: 30, slotsByRole: { P: 0, D: 0, C: 0, A: 0 } },
    ],
  });
  const suggestion = result.find((entry) => entry.player.id === 3);
  assert.ok(suggestion, "the decoy should be suggested");
  assert.equal(suggestion.primarySignal, "decoy");
  assert.equal(suggestion.score, 45);
  assert.match(suggestion.reasons[0], /Squadra A e Squadra B/);
});

test("signal B does not fire for a player who is already a real priority target", () => {
  const player1 = player(3, "D", 20);
  const result = suggestNominations({
    watchlist: { 3: { priority: "media", maxBid: 20, note: "" } },
    availablePlayers: [player1],
    myTeam: { slotsByRole: { P: 1, D: 1, C: 1, A: 1 } },
    opponentTeams: [
      { name: "Squadra A", budgetResidual: 400, slotsByRole: { P: 0, D: 3, C: 0, A: 0 } },
      { name: "Squadra B", budgetResidual: 350, slotsByRole: { P: 0, D: 2, C: 0, A: 0 } },
    ],
  });
  const suggestion = result.find((entry) => entry.player.id === 3);
  assert.equal(suggestion.primarySignal, "readyTarget");
});

test("signal C: a strong FVM player nobody needs anymore is a hidden gem", () => {
  const gem = player(4, "C", 90);
  const filler1 = player(5, "C", 30);
  const filler2 = player(6, "C", 20);
  const result = suggestNominations({
    watchlist: {},
    availablePlayers: [gem, filler1, filler2],
    opponentTeams: [
      { name: "Squadra A", budgetResidual: 200, slotsByRole: { P: 0, D: 0, C: 0, A: 0 } },
      { name: "Squadra B", budgetResidual: 150, slotsByRole: { P: 0, D: 0, C: 0, A: 0 } },
    ],
  });
  const suggestion = result.find((entry) => entry.player.id === 4);
  assert.ok(suggestion, "the hidden gem should be suggested");
  assert.equal(suggestion.primarySignal, "hiddenGem");
  assert.match(suggestion.reasons[0], /Nessuno lo cerca/);
});

test("signal C does not fire while some opponent still needs the role", () => {
  const gem = player(4, "C", 90);
  const filler = player(5, "C", 30);
  const result = suggestNominations({
    availablePlayers: [gem, filler],
    opponentTeams: [{ name: "Squadra A", budgetResidual: 200, slotsByRole: { P: 0, D: 0, C: 1, A: 0 } }],
  });
  assert.equal(result.find((entry) => entry.player.id === 4), undefined);
});

test("combines every matching signal instead of picking just one", () => {
  const both = player(7, "A", 95);
  const filler = player(8, "A", 20);
  const result = suggestNominations({
    watchlist: { 7: { priority: "alta", maxBid: 60, note: "" } },
    availablePlayers: [both, filler],
    myTeam: { slotsByRole: { P: 1, D: 1, C: 1, A: 1 } },
    budgetPlan: { A: { budgetRemaining: 100 } },
    opponentTeams: [
      // No opponent still needs role A, so hiddenGem fires too, alongside readyTarget.
      { name: "Squadra A", budgetResidual: 200, slotsByRole: { P: 0, D: 0, C: 0, A: 0 } },
      { name: "Squadra B", budgetResidual: 150, slotsByRole: { P: 0, D: 0, C: 0, A: 0 } },
    ],
  });
  const suggestion = result.find((entry) => entry.player.id === 7);
  assert.ok(suggestion);
  assert.equal(suggestion.reasons.length, 2);
  assert.equal(suggestion.score, 60 + 30);
});

test("returns at most 5 suggestions, sorted by score", () => {
  const players = Array.from({ length: 8 }, (_, index) => player(index + 1, "A", 10 + index));
  const watchlist = Object.fromEntries(players.map((p) => [p.id, { priority: "alta", maxBid: 10, note: "" }]));
  const result = suggestNominations({
    watchlist,
    availablePlayers: players,
    myTeam: { slotsByRole: { P: 1, D: 1, C: 1, A: 1 } },
    opponentTeams: [{ name: "Squadra A", budgetResidual: 10, slotsByRole: { P: 0, D: 0, C: 0, A: 0 } }],
  });
  assert.equal(result.length, 5);
  for (let i = 1; i < result.length; i++) assert.ok(result[i - 1].score >= result[i].score);
});

test("returns nothing when no player matches any signal", () => {
  const bland = player(1, "A", 10);
  const result = suggestNominations({
    availablePlayers: [bland],
    opponentTeams: [{ name: "Squadra A", budgetResidual: 100, slotsByRole: { P: 0, D: 0, C: 0, A: 1 } }],
  });
  assert.deepEqual(result, []);
});
