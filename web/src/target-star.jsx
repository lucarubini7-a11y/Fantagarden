import { useEffect, useRef, useState } from "react";
import { playerIdKey } from "./auction-state.js";
import { TARGET_PRIORITIES, addTarget, removeTarget, setTargetMaxBid, setTargetPriority } from "./targets-state.js";

const PRIORITY_LABELS = { alta: "Alta", media: "Media", bassa: "Bassa" };
const POPOVER_WIDTH = 220;
const POPOVER_HEIGHT_ESTIMATE = 200;

/**
 * Star/favorite toggle for adding a player to Obiettivi from wherever
 * they show up with a possible action (fixture-advisor rows, the auction
 * search results). Rendered as a sibling of the row's own <button>, never
 * nested inside it - the popover holds real form controls, and a
 * button/select/input can't safely live inside another <button>.
 *
 * The popover is fixed-positioned from the star's own bounding rect
 * rather than CSS-anchored (position:absolute) to it, because several of
 * the lists this renders in (the auction search results) are themselves
 * inside a scrolling, overflow-clipped container that would otherwise cut
 * the popover off.
 */
export function TargetStar({ player, targets, setTargets }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const buttonRef = useRef(null);
  const id = playerIdKey(player.id);
  const meta = targets[id];
  const targeted = Boolean(meta);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const openPopover = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const opensUpward = rect.bottom + POPOVER_HEIGHT_ESTIMATE > window.innerHeight;
      setCoords({
        top: opensUpward ? Math.max(8, rect.top - POPOVER_HEIGHT_ESTIMATE - 4) : rect.bottom + 4,
        left: Math.max(8, Math.min(rect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8)),
      });
    }
    setOpen(true);
  };

  const toggle = () => {
    if (!targeted) {
      setTargets((current) => addTarget(current, player.id));
      openPopover();
    } else if (open) {
      setOpen(false);
    } else {
      openPopover();
    }
  };

  return (
    <span className="target-star-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={"target-star" + (targeted ? " active" : "")}
        onClick={toggle}
        aria-label={
          targeted
            ? `${player.nome} è tra i tuoi obiettivi: modifica priorità e prezzo`
            : `Aggiungi ${player.nome} agli obiettivi`
        }
        aria-expanded={targeted ? open : undefined}
      >
        {targeted ? "★" : "☆"}
      </button>
      {open && targeted && coords && (
        <div
          className="target-star-popover"
          role="dialog"
          aria-label={`Obiettivo: ${player.nome}`}
          style={{ top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
          onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
        >
          <label>
            Priorità
            <select
              value={meta.priority}
              onChange={(event) =>
                setTargets((current) => setTargetPriority(current, player.id, event.target.value))
              }
            >
              {TARGET_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prezzo max personale
            <input
              type="number"
              min="1"
              inputMode="numeric"
              value={meta.maxBid ?? ""}
              onChange={(event) =>
                setTargets((current) => setTargetMaxBid(current, player.id, event.target.value))
              }
              placeholder="cr."
            />
          </label>
          <div className="target-star-actions">
            <button
              type="button"
              className="target-star-remove"
              onClick={() => {
                setTargets((current) => removeTarget(current, player.id));
                setOpen(false);
              }}
            >
              Rimuovi
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Fatto
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
