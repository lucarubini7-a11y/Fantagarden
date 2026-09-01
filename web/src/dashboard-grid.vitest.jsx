import { describe, expect, test } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DashboardGrid } from "./dashboard-grid.jsx";

const registry = {
  widgetA: { component: () => <p>Content A</p>, title: "Widget A", defaultSpan: "full" },
  widgetB: { component: () => <p>Content B</p>, title: "Widget B", subtitle: "Sub B", defaultSpan: "half" },
  widgetC: { component: () => <p>Content C</p>, title: "Widget C", defaultSpan: "half" },
};

describe("DashboardGrid", () => {
  test("renders every widget passed in items, with its title and content", () => {
    render(
      <DashboardGrid
        registry={registry}
        items={[
          { id: "widgetA", props: {} },
          { id: "widgetB", props: {} },
        ]}
      />,
    );
    expect(screen.getByText("Widget A")).toBeInTheDocument();
    expect(screen.getByText("Content A")).toBeInTheDocument();
    expect(screen.getByText("Widget B")).toBeInTheDocument();
    expect(screen.getByText("Sub B")).toBeInTheDocument();
    expect(screen.getByText("Content B")).toBeInTheDocument();
  });

  test("a full-span widget spans the full grid row", () => {
    render(<DashboardGrid registry={registry} items={[{ id: "widgetA", props: {} }]} />);
    const panel = screen.getByText("Widget A").closest(".dashboard-panel");
    expect(panel).toHaveAttribute("data-span", "full");
  });

  test("half-span widgets sit side by side with matching span attributes", () => {
    render(
      <DashboardGrid
        registry={registry}
        items={[
          { id: "widgetB", props: {} },
          { id: "widgetC", props: {} },
        ]}
      />,
    );
    const panelB = screen.getByText("Widget B").closest(".dashboard-panel");
    const panelC = screen.getByText("Widget C").closest(".dashboard-panel");
    expect(panelB).toHaveAttribute("data-span", "half");
    expect(panelC).toHaveAttribute("data-span", "half");
  });

  test("a panel collapses and expands on header click", () => {
    render(<DashboardGrid registry={registry} items={[{ id: "widgetA", props: {} }]} />);
    const toggle = screen.getByRole("button", { name: /Widget A/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Content A")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Content A")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Content A")).toBeInTheDocument();
  });
});
