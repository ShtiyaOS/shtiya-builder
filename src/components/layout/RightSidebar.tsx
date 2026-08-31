'use client';

import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Send } from 'lucide-react';
import { useTerminalStore } from '@/store/terminalStore';

/**
 * RightSidebar — the terminal shell's Right Pane (Agentic Co-Pilot).
 *
 * NOTE: `useChat` now ships from `@ai-sdk/react` — the installed `ai@7`
 * no longer exposes an `ai/react` subpath (that moved with the v5 SDK
 * split). Behaviour is identical to the plan: a `DefaultChatTransport` is
 * configured with `prepareSendMessagesRequest`, which reads
 * `useTerminalStore.getState()` synchronously at send-time (not at
 * hook-init time) so the Co-Pilot always sees whatever the Center Pane is
 * currently showing, even though this pane never remounts across
 * navigation. See terminal-layout-plan.md T7.5.
 *
 * WHAT IS SENT, AND WHAT IS NOT (Task 3.18)
 *
 * The request carries the structured `subject` — a subject kind and an id —
 * and NOT the prose `context` string it used to send. The route resolves the
 * subject into a server-computed scope set (I-H15); prose describing the
 * screen would arrive as untrusted text in the same transcript as the user's
 * own words, which is the injection I-A6 closes. The prose context still
 * exists, and still renders in the empty-state hint below, but it stays in the
 * browser.
 *
 * A page that has not called `usePageContext(description, subject)` sends no
 * subject, and the Co-Pilot answers with the scope_denied fallback rather than
 * guessing. That is intended: an agent with nothing in scope has nothing it is
 * entitled to say.
 */
export function RightSidebar() {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stable transport instance — created once, not on every render.
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: '/api/copilot',
        prepareSendMessagesRequest: ({ messages }) => {
          const subject = useTerminalStore.getState().subject;
          return { body: { messages, subject } };
        },
      }),
  );

  const { messages, sendMessage, status } = useChat({ transport });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || status !== 'ready') return;
    sendMessage({ text });
    setInput('');
  }

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-50">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex h-14 flex-shrink-0 items-center border-b border-slate-800 px-4">
        <span className="text-sm font-bold tracking-wide text-white">⚡ Co-Pilot</span>
      </div>

      {/* ── Messages ─────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.length === 0 && (
          <p className="px-1 text-xs text-slate-500">
            Ask about what you&apos;re looking at — the Co-Pilot sees your current screen context.
          </p>
        )}

        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} />
        ))}

        {status === 'submitted' && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-400">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {/* ── Input ────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="flex-shrink-0 border-t border-slate-800 p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            rows={2}
            placeholder="Ask the Co-Pilot…"
            className="flex-1 resize-none rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={status !== 'ready' || !input.trim()}
            aria-label="Send message"
            className="flex-shrink-0 rounded-md bg-indigo-600 p-2.5 text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function ChatBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';
  const text = message.parts
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');

  if (!text) return null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
          isUser ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100'
        }`}
      >
        {text}
      </div>
    </div>
  );
}
