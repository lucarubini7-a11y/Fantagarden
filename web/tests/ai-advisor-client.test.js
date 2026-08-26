import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdvisorContext,
  contextFromAuctionState,
  fetchAdvisorAdvice,
  topAlternatives,
} from "../src/ai-advisor-client.js";

const rules = { rosterSlots: { P: 1, D: 1, C: 1, A: 2 } };

const players = [
  { id: 1, nome: "Osimhen", ruolo: "A", squadra: "Napoli", fvm_scaled: 90 },
  { id: 2, nome: "Lucca", ruolo: "A", squadra: "Udinese", fvm_scaled: 60 },
  { id: 3, nome: "Piccoli", ruolo: "A", squadra: "Cagliari", fvm_scaled: 45 },
  { id: 4, nome: "Retegui", ruolo: "A", squadra: "Atalanta", fvm_scaled: 40 },
  { id: 5, nome: "Colombo", ruolo: "A", squadra: "Empoli", fvm_scaled: 30 },
  { id: 6, nome: "Gyasi", ruolo: "A", squadra: "Empoli", fvm_scaled: 20 },
  { id: 7, nome: "Consigli", ruolo: "P", squadra: "Genoa", fvm_scaled: 15 },
];

const state = {
  teams: [
    { name: "Mine", credits: 200, roster: [{ nome: "Colombo" }] },
    { name: "Rivale", credits: 150, roster: [] },
  ],
  assigned: { 5: { owner: 0, price: 10 } },
};

test("topAlternatives excludes the candidate, assigned players, and other roles", () => {
  const alternatives = topAlternatives(players, "A", state.assigned, 1);
  assert.deepEqual(
    alternatives.map((p) => p.nome),
    ["Lucca", "Piccoli", "Retegui", "Gyasi"],
  );
});

test("topAlternatives respects the limit and is sorted by fvm_scaled descending", () => {
  const alternatives = topAlternatives(players, "A", {}, 1, 2);
  assert.deepEqual(
    alternatives.map((p) => p.nome),
    ["Lucca", "Piccoli"],
  );
});

test("buildAdvisorContext never includes an opponent's roster", () => {
  const context = buildAdvisorContext({
    player: players[0],
    maxBid: 55,
    currentBid: 40,
    myTeam: { credits: 200, slotsLeft: { A: 1 }, roster: [{ nome: "Colombo" }] },
    otherTeams: [{ name: "Rivale", credits: 150, slotsLeft: { A: 2 } }],
    alternatives: [players[1]],
  });
  assert.deepEqual(context.other_teams, [
    { nome_squadra: "Rivale", budget_residuo: 150, slot_rimasti_per_ruolo: { A: 2 } },
  ]);
  assert.equal(JSON.stringify(context).includes("roster"), false);
  assert.equal(context.player.prezzo_max_consigliato, 55);
  assert.equal(context.my_team.giocatori_gia_presi.length, 1);
});

test("contextFromAuctionState assembles a full context from live component state", () => {
  const context = contextFromAuctionState({
    player: players[0],
    state,
    owner: 0,
    price: "45",
    advice: { maxBid: 55 },
    players,
    rules,
  });
  assert.equal(context.player.nome, "Osimhen");
  assert.equal(context.current_bid, 45);
  assert.equal(context.my_team.budget_residuo, 200);
  assert.equal(context.other_teams.length, 1);
  assert.equal(context.other_teams[0].nome_squadra, "Rivale");
  assert.equal(context.top_alternative_players.length, 4);
});

test("contextFromAuctionState treats an empty price as no current bid", () => {
  const context = contextFromAuctionState({
    player: players[0],
    state,
    owner: 0,
    price: "",
    advice: null,
    players,
    rules,
  });
  assert.equal(context.current_bid, null);
  assert.equal(context.player.prezzo_max_consigliato, null);
});

test("fetchAdvisorAdvice resolves to success on an available response", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ available: true, advice: "Consigliato.", model: "claude-sonnet-4-6" }),
  });
  const result = await fetchAdvisorAdvice("http://api", {}, { fetchImpl });
  assert.deepEqual(result, { status: "success", advice: "Consigliato.", model: "claude-sonnet-4-6" });
});

test("fetchAdvisorAdvice surfaces a server-reported unavailability", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ available: false, reason: "missing_api_key" }),
  });
  const result = await fetchAdvisorAdvice("http://api", {}, { fetchImpl });
  assert.deepEqual(result, { status: "unavailable", reason: "missing_api_key", detail: undefined });
});

test("fetchAdvisorAdvice maps a non-2xx response to an http_error", async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });
  const result = await fetchAdvisorAdvice("http://api", {}, { fetchImpl });
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "http_error");
});

test("fetchAdvisorAdvice never rejects on a network failure", async () => {
  const fetchImpl = async () => {
    throw new TypeError("network down");
  };
  const result = await fetchAdvisorAdvice("http://api", {}, { fetchImpl });
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "network_error");
});

test("fetchAdvisorAdvice never rejects when the request is aborted (timeout)", async () => {
  const fetchImpl = async (url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  const result = await fetchAdvisorAdvice("http://api", {}, { fetchImpl, timeoutMs: 5 });
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "network_error");
  assert.equal(result.detail, "timeout");
});
