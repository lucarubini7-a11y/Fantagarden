import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchPlayerStatus,
  formatPlayerStatusUpdatedAt,
  playerStatusBadge,
} from "../src/player-status-client.js";

test("fetchPlayerStatus normalizes a successful response", async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, "http://api/api/player-status");
    return { ok: true, json: async () => ({ fetched_at: 1000, players: { Lautaro: { stato: "infortunato" } } }) };
  };
  const result = await fetchPlayerStatus("http://api", { fetchImpl });
  assert.deepEqual(result, { fetchedAt: 1000, players: { Lautaro: { stato: "infortunato" } } });
});

test("fetchPlayerStatus appends refresh=1 when forcing a refresh", async () => {
  let calledUrl;
  const fetchImpl = async (url) => {
    calledUrl = url;
    return { ok: true, json: async () => ({ fetched_at: 1, players: {} }) };
  };
  await fetchPlayerStatus("http://api", { fetchImpl, forceRefresh: true });
  assert.equal(calledUrl, "http://api/api/player-status?refresh=1");
});

test("fetchPlayerStatus never throws on a non-ok response or a network error", async () => {
  const notOk = await fetchPlayerStatus("http://api", { fetchImpl: async () => ({ ok: false }) });
  assert.deepEqual(notOk, { fetchedAt: null, players: {} });

  const networkError = await fetchPlayerStatus("http://api", {
    fetchImpl: async () => {
      throw new Error("down");
    },
  });
  assert.deepEqual(networkError, { fetchedAt: null, players: {} });
});

test("fetchPlayerStatus tolerates a malformed players field", async () => {
  const result = await fetchPlayerStatus("http://api", {
    fetchImpl: async () => ({ ok: true, json: async () => ({ fetched_at: 1, players: "not an object" }) }),
  });
  assert.deepEqual(result, { fetchedAt: 1, players: {} });
});

test("playerStatusBadge renders infortunato/diffidato/in_dubbio", () => {
  const players = {
    Lautaro: { stato: "infortunato", dettaglio: "Muscolare", fonte: "highlightly" },
    Barella: { stato: "diffidato" },
    Dumfries: { stato: "in_dubbio" },
  };
  assert.equal(playerStatusBadge(players, "Lautaro").label, "INF");
  assert.equal(playerStatusBadge(players, "Lautaro").title, "Muscolare · highlightly");
  assert.equal(playerStatusBadge(players, "Barella").label, "DIFF");
  assert.equal(playerStatusBadge(players, "Dumfries").label, "?");
});

test("playerStatusBadge is silent for disponibile, sconosciuto, and unknown players", () => {
  const players = { Bastoni: { stato: "disponibile" }, Acerbi: { stato: "sconosciuto" } };
  assert.equal(playerStatusBadge(players, "Bastoni"), null);
  assert.equal(playerStatusBadge(players, "Acerbi"), null);
  assert.equal(playerStatusBadge(players, "NonEsiste"), null);
  assert.equal(playerStatusBadge(null, "Bastoni"), null);
  assert.equal(playerStatusBadge(undefined, "Bastoni"), null);
});

test("formatPlayerStatusUpdatedAt formats an epoch-seconds timestamp, or null", () => {
  assert.equal(formatPlayerStatusUpdatedAt(null), null);
  assert.equal(typeof formatPlayerStatusUpdatedAt(1735689600), "string");
});
