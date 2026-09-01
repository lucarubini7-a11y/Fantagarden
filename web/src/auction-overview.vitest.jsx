import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuctionOverview } from "./auction-overview.jsx";

const overview = {
  summary: { spendableCredits: 120, reservedCredits: 30, marketInflation: 1.1 },
  priorities: [{ role: "A", urgency: "ALTA", reason: "Manca un titolare" }],
  rolePlan: { A: { budgetTarget: 80 } },
};

describe("AuctionOverview skeleton loading", () => {
  test("shows skeleton placeholders while overview is not yet available", () => {
    render(<AuctionOverview overview={null} />);
    expect(screen.getByLabelText("Piano strategico in calcolo")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Budget spendibile")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  test("replaces the skeleton with real content once overview arrives", () => {
    render(<AuctionOverview overview={overview} />);
    expect(screen.queryByLabelText("Piano strategico in calcolo")).not.toBeInTheDocument();
    expect(screen.getByText("Budget spendibile")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(document.querySelectorAll(".skeleton").length).toBe(0);
  });
});
