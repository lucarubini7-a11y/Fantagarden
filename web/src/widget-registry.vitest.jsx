import { describe, expect, test } from "vitest";
import { WIDGET_REGISTRY } from "./widget-registry.js";

describe("WIDGET_REGISTRY", () => {
  test("every entry has a component, a title, and a valid span", () => {
    for (const [id, entry] of Object.entries(WIDGET_REGISTRY)) {
      const isRenderable = typeof entry.component === "function" || typeof entry.component === "object";
      expect(isRenderable, `${id}.component should be a function or memo component`).toBe(true);
      expect(typeof entry.title, `${id}.title`).toBe("string");
      expect(entry.title.length, `${id}.title`).toBeGreaterThan(0);
      expect(["full", "half"], `${id}.defaultSpan`).toContain(entry.defaultSpan);
    }
  });

  test("the tracker and fixture advisor are full-width, the rest are half", () => {
    const spans = Object.fromEntries(
      Object.entries(WIDGET_REGISTRY).map(([id, entry]) => [id, entry.defaultSpan]),
    );
    expect(spans).toEqual({
      tracker: "full",
      aiAdvisor: "half",
      fixtureAdvisor: "full",
      watchlist: "half",
      nominationSuggestions: "half",
    });
  });
});
