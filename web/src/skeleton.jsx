/**
 * Placeholder block shown while a panel's data is still loading, shaped
 * like the content it stands in for instead of a bare "Caricamento..."
 * line. Purely decorative (aria-hidden) - the panel itself should carry
 * whatever aria-busy/status semantics apply while loading.
 */
export function Skeleton({ width = "100%", height = 16, radius, className = "", style }) {
  return (
    <span
      className={`skeleton${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      style={{ width, height, ...(radius ? { borderRadius: radius } : {}), ...style }}
    />
  );
}
