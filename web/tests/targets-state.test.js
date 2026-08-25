import test from "node:test";
import assert from "node:assert/strict";
import {
  addTarget,
  emptyTargets,
  isTargeted,
  rehydrateTargets,
  removeTarget,
  serializeTargets,
  setTargetMaxBid,
  setTargetNote,
  targetsStorageKey,
} from "../src/targets-state.js";

const players = [{ id: 1, ruolo: "P" }, { id: 2, ruolo: "A" }];

test("adds, notes, prices, and removes a target", () => {
  let targets = addTarget(emptyTargets(), 1);
  assert.equal(isTargeted(targets, 1), true);
  assert.deepEqual(targets["1"], { note: "", maxBid: null });

  targets = setTargetNote(targets, 1, "solo se libero un posto");
  targets = setTargetMaxBid(targets, 1, "45");
  assert.deepEqual(targets["1"], { note: "solo se libero un posto", maxBid: 45 });

  targets = removeTarget(targets, 1);
  assert.equal(isTargeted(targets, 1), false);
});

test("adding an already-targeted player is a no-op", () => {
  const targets = addTarget(emptyTargets(), 1);
  assert.equal(addTarget(targets, 1), targets);
});

test("rejects a non-positive or non-integer max bid", () => {
  let targets = addTarget(emptyTargets(), 1);
  targets = setTargetMaxBid(targets, 1, "0");
  assert.equal(targets["1"].maxBid, null);
  targets = setTargetMaxBid(targets, 1, "12.5");
  assert.equal(targets["1"].maxBid, null);
  targets = setTargetMaxBid(targets, 1, "20");
  assert.equal(targets["1"].maxBid, 20);
});

test("rehydrates only entries for players still in the dataset", () => {
  const saved = serializeTargets({
    1: { note: "top target", maxBid: 30 },
    99: { note: "stale", maxBid: 10 },
  });
  const targets = rehydrateTargets(saved, players);
  assert.deepEqual(targets, { 1: { note: "top target", maxBid: 30 } });
});

test("rejects corrupt or unversioned storage", () => {
  assert.deepEqual(rehydrateTargets(null, players), {});
  assert.deepEqual(rehydrateTargets({ targets: {} }, players), {});
  assert.deepEqual(rehydrateTargets({ version: 1, targets: null }, players), {});
});

test("storage key is namespaced per profile", () => {
  assert.equal(targetsStorageKey("league-a"), "fanta-targets-v1:league-a");
  assert.equal(targetsStorageKey(), "fanta-targets-v1:default");
});
