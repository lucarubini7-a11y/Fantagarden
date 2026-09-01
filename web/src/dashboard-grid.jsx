import { useState } from "react";

/** One card in the grid: consistent title/subtitle chrome plus a collapse toggle, regardless of what widget it wraps. */
function DashboardPanel({ title, subtitle, span, children }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section className="dashboard-panel" data-span={span}>
      <button
        type="button"
        className="dashboard-panel-header"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
      >
        <span className={"dashboard-panel-caret" + (collapsed ? " collapsed" : "")} aria-hidden="true">
          ▾
        </span>
        <span className="dashboard-panel-heading">
          <span className="dashboard-panel-title">{title}</span>
          {subtitle && <span className="dashboard-panel-subtitle">{subtitle}</span>}
        </span>
      </button>
      {!collapsed && <div className="dashboard-panel-body">{children}</div>}
    </section>
  );
}

/**
 * Composes WIDGET_REGISTRY entries into a responsive grid instead of a
 * tall vertical stack. `items` is [{ id, span?, props }]; `id` looks up
 * the component/title/subtitle/default span in `registry`, `span`
 * overrides the default for that instance (e.g. a caller collapsing a
 * "full" widget to "half" in a denser context), and `props` are passed
 * straight through to the widget component.
 */
export function DashboardGrid({ registry, items }) {
  return (
    <div className="dashboard-grid">
      {items.map(({ id, span, props }) => {
        const entry = registry[id];
        if (!entry) return null;
        const Component = entry.component;
        return (
          <DashboardPanel
            key={id}
            title={entry.title}
            subtitle={entry.subtitle}
            span={span || entry.defaultSpan}
          >
            <Component {...props} />
          </DashboardPanel>
        );
      })}
    </div>
  );
}
