import test from "node:test";
import assert from "node:assert/strict";
import { initialsFor, resolveTeamBadge } from "../src/team-badge.js";

test("resolveTeamBadge renders the logo when the team is in the map", () => {
  const badges = { Atalanta: "/team-badges/atalanta.png" };
  const badge = resolveTeamBadge({ team: "Atalanta", size: 32, badges });
  assert.equal(badge.kind, "image");
  assert.equal(badge.src, "/team-badges/atalanta.png");
  assert.equal(badge.alt, "Logo Atalanta");
  assert.equal(badge.width, 32);
  assert.equal(badge.height, 32);
});

test("resolveTeamBadge falls back to initials when the team is missing from the map", () => {
  const badge = resolveTeamBadge({ team: "Venezia", size: 24, badges: {} });
  assert.equal(badge.kind, "fallback");
  assert.equal(badge.initials, "VEN");
  assert.equal(badge.alt, "Logo Venezia");
});

test("resolveTeamBadge falls back gracefully for an unknown/blank team", () => {
  assert.equal(resolveTeamBadge({ team: "", badges: {} }).alt, "Logo squadra sconosciuta");
  assert.equal(resolveTeamBadge({ team: undefined, badges: {} }).alt, "Logo squadra sconosciuta");
});

test("initialsFor uses first letters of up to three words, or the first three letters of a single word", () => {
  assert.equal(initialsFor("Inter"), "INT");
  assert.equal(initialsFor("AC Milan"), "AM");
  assert.equal(initialsFor("Hellas Verona FC"), "HVF");
  assert.equal(initialsFor("  "), "?");
  assert.equal(initialsFor(null), "?");
});
