import test from "node:test";
import assert from "node:assert/strict";
import { emptyAuction, legalMaxBid, rehydrateAuction, resolveUserTeamIndex, serializeAuction } from "../src/auction-state.js";

const rules = { participants: 2, teamNames: ["Mine", "Other"], startingCredits: 20, rosterSlots: { P: 1, A: 1 }, auction: { minPrice: 2, increment: 2, reserve: 2 } };
const players = [{ id: 1, ruolo: "P" }, { id: 2, ruolo: "A" }];

test("rehydrates compact transactions and preserves player references", () => {
  const saved = { version: 2, teams: [{ name: "Mine", startingCredits: 20 }, { name: "Other", startingCredits: 20 }], history: [{ playerId: 1, owner: 0, price: 4 }], undone: [] };
  const state = rehydrateAuction(saved, players, rules);
  assert.equal(state.teams[0].roster[0], players[0]);
  assert.deepEqual(serializeAuction(state).history, saved.history);
});

test("rejects corrupt or incompatible auction state", () => {
  assert.equal(rehydrateAuction({ teams: [], history: [] }, players, rules), null);
  assert.equal(rehydrateAuction({ version: 2, teams: [{ name: "Mine", startingCredits: 20 }, { name: "Other", startingCredits: 20 }], history: [{ playerId: 99, owner: 0, price: 4 }] }, players, rules), null);
});

test("reserves credits for remaining configured slots", () => {
  assert.equal(legalMaxBid(emptyAuction(rules).teams[0], rules), 18);
});

test("resolveUserTeamIndex reads the configured index, falls back to a name lookup, then to 0", () => {
  assert.equal(resolveUserTeamIndex({ ...rules, userTeam: 1 }), 1);
  assert.equal(resolveUserTeamIndex({ ...rules, userTeam: "Other" }), 1);
  assert.equal(resolveUserTeamIndex({ ...rules, userTeam: "Unknown" }), 0);
  assert.equal(resolveUserTeamIndex({ ...rules, userTeam: 99 }), 0);
});
