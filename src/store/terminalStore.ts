import { create } from 'zustand';
import type { SubjectKind } from '@/lib/agent/scope-set';

/**
 * useTerminalStore — the terminal shell's Context Registry.
 *
 * Micro-app pages (Center Pane) write their current semantic context here
 * on mount; the Co-Pilot (Right Pane) reads it — via `getState()`, not a
 * subscription — just before each request goes out, so it always reflects
 * whatever the user is looking at right now regardless of when the Right
 * Pane last rendered. See terminal-layout-plan.md T7.3/T7.5.
 *
 * TWO FIELDS, TWO PURPOSES — do not collapse them.
 *
 *   `context` is prose, for the human. It renders in the empty-state hint and
 *   nowhere else. It is NOT sent to /api/copilot: prose describing the screen
 *   is indistinguishable from the user's own words once it lands in a
 *   transcript, which is the injection surface I-A6 exists to close.
 *
 *   `subject` is a structured reference — a subject kind and an id — and it is
 *   the ONLY thing the route accepts. The server resolves it into a closed
 *   scope set with resolve_scope_set() (I-H15); the client cannot widen it, and
 *   a page that sets no subject gets an agent with nothing in scope, which is
 *   the correct answer to "answer questions about a screen you have not told me
 *   you are entitled to read".
 */
export interface TerminalSubject {
  kind: SubjectKind;
  id:   string;
}

interface TerminalState {
  context: string;
  subject: TerminalSubject | null;
  setContext: (ctx: string) => void;
  setSubject: (subject: TerminalSubject | null) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  context: '',
  subject: null,
  setContext: (ctx) => set({ context: ctx }),
  setSubject: (subject) => set({ subject }),
}));
