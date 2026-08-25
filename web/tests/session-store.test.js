import test from "node:test";
import assert from "node:assert/strict";

// A minimal, deterministic localStorage stand-in so these tests do not depend on jsdom.
class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}
globalThis.localStorage = new MemoryStorage();

const { emptyAuction, playerIdKey, serializeAuction } = await import("../src/auction-state.js");
const {
  SESSION_SCHEMA_VERSION,
  createAutosave,
  createEnvelope,
  exportEnvelope,
  isValidEnvelopeShape,
  listSessions,
  loadActiveEnvelope,
  parseImportedEnvelope,
  saveEnvelope,
  startNewSession,
} = await import("../src/session-store.js");

const rules = {
  participants: 2,
  teamNames: ["Mine", "Other"],
  userTeam: "Mine",
  startingCredits: 20,
  rosterSlots: { P: 1, A: 1 },
  auction: { minPrice: 2, increment: 2, reserve: 2 },
};
const players = [{ id: 1, ruolo: "P" }, { id: 2, ruolo: "A" }];

test.beforeEach(() => {
  localStorage.clear();
});

test("creates a fresh, valid envelope for an empty auction", () => {
  const envelope = createEnvelope("profile-a", rules);
  assert.equal(envelope.schemaVersion, SESSION_SCHEMA_VERSION);
  assert.equal(envelope.profileId, "profile-a");
  assert.equal(isValidEnvelopeShape(envelope), true);
  assert.deepEqual(envelope.state.auction, serializeAuction(emptyAuction(rules)));
  assert.equal(envelope.state.pendingNomination, null);
});

test("saves an envelope, makes it active, and indexes it", () => {
  const envelope = createEnvelope("profile-a", rules, { name: "Prima asta" });
  const result = saveEnvelope(envelope);
  assert.equal(result.ok, true);

  const loaded = loadActiveEnvelope("profile-a");
  assert.equal(loaded.restored, true);
  assert.equal(loaded.migrated, false);
  assert.deepEqual(loaded.envelope, envelope);

  const index = listSessions("profile-a");
  assert.equal(index.length, 1);
  assert.equal(index[0].sessionId, envelope.sessionId);
  assert.equal(index[0].name, "Prima asta");
});

test("returns nothing usable, without touching disk, when no session exists", () => {
  const loaded = loadActiveEnvelope("profile-never-used");
  assert.deepEqual(loaded, { envelope: null, restored: false, migrated: false });
});

test("migrates the legacy bare auction format on first load, then leaves it upgraded", () => {
  const legacy = serializeAuction({ ...emptyAuction(rules), history: [{ playerId: 1, owner: 0, price: 2 }] });
  localStorage.setItem("fanta-auction-v2:profile-b", JSON.stringify(legacy));

  const loaded = loadActiveEnvelope("profile-b");
  assert.equal(loaded.restored, true);
  assert.equal(loaded.migrated, true);
  assert.deepEqual(loaded.envelope.state.auction, legacy);
  assert.equal(loaded.envelope.profileId, "profile-b");
});

test("a corrupt or unversioned active session is reported as nothing usable, and is not deleted", () => {
  localStorage.setItem("fanta-auction-active-v1:profile-c", "broken-session-id");
  localStorage.setItem("fanta-auction-session-v1:broken-session-id", "{not json");

  const loaded = loadActiveEnvelope("profile-c");
  assert.deepEqual(loaded, { envelope: null, restored: false, migrated: false });
  // The corrupt entry itself must still be there: we never clear data on a read failure.
  assert.equal(localStorage.getItem("fanta-auction-session-v1:broken-session-id"), "{not json");
});

test("a session from an unsupported schema version is ignored, not overwritten", () => {
  const envelope = { ...createEnvelope("profile-d", rules), schemaVersion: 99 };
  localStorage.setItem("fanta-auction-session-v1:" + envelope.sessionId, JSON.stringify(envelope));
  localStorage.setItem("fanta-auction-active-v1:profile-d", envelope.sessionId);

  const loaded = loadActiveEnvelope("profile-d");
  assert.equal(loaded.envelope, null);
  assert.equal(localStorage.getItem("fanta-auction-session-v1:" + envelope.sessionId), JSON.stringify(envelope));
});

test("starting a new session archives the old one instead of deleting it", () => {
  const first = startNewSession("profile-e", rules, { name: "Asta 1" }).envelope;
  const second = startNewSession("profile-e", rules, { name: "Asta 2" }).envelope;

  assert.notEqual(first.sessionId, second.sessionId);
  assert.equal(localStorage.getItem("fanta-auction-active-v1:profile-e"), second.sessionId);
  assert.notEqual(localStorage.getItem("fanta-auction-session-v1:" + first.sessionId), null);

  const index = listSessions("profile-e").map((entry) => entry.sessionId).sort();
  assert.deepEqual(index, [first.sessionId, second.sessionId].sort());
});

test("exports round-trip through import for the same profile and compatible rules", () => {
  const envelope = createEnvelope("profile-f", rules, { name: "Da esportare" });
  const json = exportEnvelope(envelope);

  const result = parseImportedEnvelope(json, { profileId: "profile-f", players, rules });
  assert.equal(result.ok, true);
  assert.equal(result.envelope.sessionId, envelope.sessionId);
});

test("rejects import of invalid JSON without touching anything", () => {
  const result = parseImportedEnvelope("{not json", { profileId: "profile-g", players, rules });
  assert.equal(result.ok, false);
  assert.match(result.error, /JSON valido/);
});

test("rejects import from an unsupported schema version", () => {
  const envelope = { ...createEnvelope("profile-g", rules), schemaVersion: 2 };
  const result = parseImportedEnvelope(JSON.stringify(envelope), { profileId: "profile-g", players, rules });
  assert.equal(result.ok, false);
  assert.match(result.error, /non supportata/);
});

test("rejects import belonging to a different profile", () => {
  const envelope = createEnvelope("profile-h", rules);
  const result = parseImportedEnvelope(JSON.stringify(envelope), { profileId: "profile-other", players, rules });
  assert.equal(result.ok, false);
  assert.match(result.error, /altra lega/);
});

test("rejects import incompatible with current rules (participant count changed)", () => {
  const envelope = createEnvelope("profile-i", rules);
  const smallerRules = { ...rules, participants: 1, teamNames: ["Mine"] };
  const result = parseImportedEnvelope(JSON.stringify(envelope), { profileId: "profile-i", players, rules: smallerRules });
  assert.equal(result.ok, false);
  assert.match(result.error, /compatibile/);
});

test("autosave debounces bursts into a single write and reports pending then saved", async () => {
  const statuses = [];
  const autosave = createAutosave({ delay: 10, onStatusChange: (update) => statuses.push(update.status) });
  const envelope = createEnvelope("profile-j", rules);

  autosave.schedule({ ...envelope, updatedAt: "t1" });
  autosave.schedule({ ...envelope, updatedAt: "t2" });
  autosave.schedule({ ...envelope, updatedAt: "t3" });

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.deepEqual(statuses, ["pending", "pending", "pending", "saved"]);
  const stored = JSON.parse(localStorage.getItem("fanta-auction-session-v1:" + envelope.sessionId));
  assert.equal(stored.updatedAt, "t3");
});

test("autosave.flush writes immediately and autosave.cancel discards pending writes", () => {
  const statuses = [];
  const autosave = createAutosave({ delay: 10_000, onStatusChange: (update) => statuses.push(update.status) });
  const envelope = createEnvelope("profile-k", rules);

  autosave.schedule(envelope);
  autosave.flush();
  assert.deepEqual(statuses, ["pending", "saved"]);
  assert.notEqual(localStorage.getItem("fanta-auction-session-v1:" + envelope.sessionId), null);

  const other = createEnvelope("profile-l", rules);
  autosave.schedule(other);
  autosave.cancel();
  assert.equal(localStorage.getItem("fanta-auction-session-v1:" + other.sessionId), null);
});

test("playerIdKey stays the shared identity used by both auction and session state", () => {
  assert.equal(playerIdKey(1), "1");
});
