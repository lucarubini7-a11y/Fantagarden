import test from "node:test";
import assert from "node:assert/strict";

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

const { clearDraft, draftStorageKey, readDraft, writeDraft } = await import("../src/settings-draft.js");

test.beforeEach(() => {
  localStorage.clear();
});

test("writeDraft saves a draft that readDraft can find again", () => {
  const profile = { profile_id: "league-a", name: "Lega" };
  const ok = writeDraft("league-a", profile);
  assert.equal(ok, true);

  const draft = readDraft("league-a");
  assert.deepEqual(draft.profile, profile);
  assert.equal(typeof draft.savedAt, "string");
  assert.equal(localStorage.getItem(draftStorageKey("league-a")) !== null, true);
});

test("readDraft returns null when nothing was saved for this profile", () => {
  writeDraft("league-a", { profile_id: "league-a" });
  assert.equal(readDraft("league-other"), null);
});

test("readDraft is resilient to corrupt or malformed storage", () => {
  localStorage.setItem(draftStorageKey("league-a"), "{not json");
  assert.equal(readDraft("league-a"), null);

  localStorage.setItem(draftStorageKey("league-b"), JSON.stringify({ profile: {} }));
  assert.equal(readDraft("league-b"), null, "missing savedAt is not a valid draft");
});

test("clearDraft removes a saved draft and is a no-op otherwise", () => {
  writeDraft("league-a", { profile_id: "league-a" });
  clearDraft("league-a");
  assert.equal(readDraft("league-a"), null);

  clearDraft("league-never-saved");
});

test("drafts for a missing profile id fall under a shared 'new' slot", () => {
  writeDraft(undefined, { name: "In corso" });
  assert.equal(draftStorageKey(undefined), draftStorageKey(""));
  assert.notEqual(readDraft(undefined), null);
});
