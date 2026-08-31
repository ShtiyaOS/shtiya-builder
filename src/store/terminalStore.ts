import { create } from 'zustand';

/**
 * useTerminalStore — the terminal shell's Context Registry.
 *
 * Micro-app pages (Center Pane) write their current semantic context here
 * on mount; the Co-Pilot (Right Pane) reads it — via `getState()`, not a
 * subscription — just before each request goes out, so it always reflects
 * whatever the user is looking at right now regardless of when the Right
 * Pane last rendered. See terminal-layout-plan.md T7.3/T7.5.
 */
interface TerminalState {
  context: string;
  setContext: (ctx: string) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  context: '',
  setContext: (ctx) => set({ context: ctx }),
}));
