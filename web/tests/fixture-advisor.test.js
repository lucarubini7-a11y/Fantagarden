import test from "node:test";
import assert from "node:assert/strict";
import { scoreByUpcomingFixtures } from "../src/fixture-advisor.js";

const days = (value, length = 38) => Array.from({ length }, () => value);

const player = (overrides) => ({
  id: overrides.id,
  nome: overrides.nome,
  ruolo: overrides.ruolo,
  squadra: "Test",
  fvm_scaled: overrides.fvm_scaled,
  p_gioca_per_giornata: overrides.p_gioca ?? days(0.9),
  voto_puro_mean_per_giornata: overrides.voto ?? days(6.0),
  bonus_atteso_per_giornata: overrides.bonus ?? days(0.1),
  ...overrides.extra,
});

test("ranks an easier upcoming fixture run above a harder one at equal FVM", () => {
  const easy = player({ id: 1, nome: "Easy", ruolo: "A", fvm_scaled: 50, voto: days(7.0) });
  const hard = player({ id: 2, nome: "Hard", ruolo: "A", fvm_scaled: 50, voto: days(5.5) });
  const [scored] = scoreByUpcomingFixtures([easy, hard], { fromMatchday: 1, windowSize: 5 })
    .sort((a, b) => b.combinedScore - a.combinedScore);
  assert.equal(scored.nome, "Easy");
  assert.equal(scored.fixtureLabel, "facile");
});

test("normalizes fixture and quality scores per role, not globally", () => {
  const strongGoalkeeper = player({ id: 1, nome: "GK", ruolo: "P", fvm_scaled: 20, voto: days(6.5) });
  const weakForward = player({ id: 2, nome: "FWD", ruolo: "A", fvm_scaled: 90, voto: days(5.0) });
  const [gk, fwd] = scoreByUpcomingFixtures([strongGoalkeeper, weakForward], { fromMatchday: 1, windowSize: 3 });
  // Each is alone in its role, so its own min === max -> normalized to the neutral midpoint.
  assert.equal(gk.combinedScore, fwd.combinedScore);
});

test("only considers the requested matchday window", () => {
  const voto = days(5.0);
  voto[0] = 9.0; // matchday 1: great, but out of the requested window
  voto[10] = 9.0; // matchday 11: great, inside the window starting at 10
  const early = player({ id: 1, nome: "Early", ruolo: "C", fvm_scaled: 40, voto });
  const [scored] = scoreByUpcomingFixtures([early], { fromMatchday: 10, windowSize: 3 });
  // fromMatchday 10 -> index 9..11, so the boosted index 10 is included, index 0 is not.
  assert.ok(scored.fixtureScore > 5.0);
});

test("clamps a window that runs past the last available matchday", () => {
  const scored = scoreByUpcomingFixtures(
    [player({ id: 1, nome: "Late", ruolo: "D", fvm_scaled: 30 })],
    { fromMatchday: 36, windowSize: 10 },
  );
  assert.equal(scored[0].fixtureScore, 0.9 * 6.0 + 0.1);
});

test("falls back to fvm_scaled alone when per-matchday projections are missing", () => {
  const withProjections = player({ id: 1, nome: "Has data", ruolo: "A", fvm_scaled: 50 });
  const withoutProjections = {
    id: 2,
    nome: "No data",
    ruolo: "A",
    squadra: "Test",
    fvm_scaled: 80,
  };
  const [scored] = scoreByUpcomingFixtures([withProjections, withoutProjections], { fromMatchday: 1, windowSize: 5 })
    .filter((p) => p.nome === "No data");
  assert.equal(scored.fixtureScore, null);
  assert.equal(scored.fixtureLabel, null);
  // Fallback: combinedScore equals the pure per-role quality normalization (this player has the highest FVM).
  assert.equal(scored.combinedScore, 1);
});

test("fixtureLabel buckets match the documented thresholds", () => {
  const roster = [
    player({ id: 1, nome: "A", ruolo: "A", fvm_scaled: 10, voto: days(4.0) }),
    player({ id: 2, nome: "B", ruolo: "A", fvm_scaled: 10, voto: days(6.0) }),
    player({ id: 3, nome: "C", ruolo: "A", fvm_scaled: 10, voto: days(8.0) }),
  ];
  const scored = scoreByUpcomingFixtures(roster, { fromMatchday: 1, windowSize: 5 });
  assert.equal(scored.find((p) => p.nome === "A").fixtureLabel, "duro");
  assert.equal(scored.find((p) => p.nome === "B").fixtureLabel, "medio");
  assert.equal(scored.find((p) => p.nome === "C").fixtureLabel, "facile");
});
