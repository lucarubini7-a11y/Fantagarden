import { AuctionTracker } from "./auction-tracker.jsx";
import { AiAdvisorPanel } from "./ai-advisor.jsx";
import { FixtureAdvisor } from "./fixture-advisor.jsx";
import { WatchlistPanel } from "./watchlist-panel.jsx";
import { NominationSuggestions } from "./nomination-suggestions.jsx";

/**
 * Every widget the Asta tab's dashboard grid can show, driven by
 * dashboard-grid.jsx. Component names here are the actual exports (see
 * each file) rather than the auction-tracker.jsx/watchlist-panel.jsx
 * naming used when this registry was first sketched - fixture-advisor.jsx
 * and nomination-suggestions.jsx already existed under those exact names.
 */
export const WIDGET_REGISTRY = {
  tracker: {
    component: AuctionTracker,
    title: "Tracker Asta",
    subtitle: "Budget, slot e rose di tutte le squadre",
    defaultSpan: "full",
  },
  aiAdvisor: {
    component: AiAdvisorPanel,
    title: "AI Advisor",
    subtitle: "Chiedi un parere su misura",
    defaultSpan: "half",
  },
  fixtureAdvisor: {
    component: FixtureAdvisor,
    title: "Consigli per reparto",
    subtitle: "Chi conviene per calendario e ruolo",
    // full, not half: its table (nome/squadra/FVM/difficoltà + opponent
    // list) is too dense for a half-width card without horizontal scrolling.
    defaultSpan: "full",
  },
  watchlist: {
    component: WatchlistPanel,
    title: "I miei obiettivi",
    subtitle: "Chi stai puntando, per priorità",
    defaultSpan: "half",
  },
  nominationSuggestions: {
    component: NominationSuggestions,
    title: "Chi chiamo adesso?",
    subtitle: "Suggerimenti sempre aggiornati",
    defaultSpan: "half",
  },
};
