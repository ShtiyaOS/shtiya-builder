# Terminal Layout Plan — Bloomberg Three-Pane Interface

## Top-Level Overview

Phase 7 migrates the Shtiya Builder frontend from a page-by-page routing model with a top-nav `AppShell` to a persistent "Bloomberg Terminal" three-pane interface. The layout never remounts across navigation — the Left Pane (role-scoped directory), Center Pane (dynamic arena for all micro-apps), and Right Pane (Agentic Co-Pilot) are all mounted once in `src/app/(apps)/layout.tsx` and remain alive for the session.

This requires:
1. **Two new dependencies** — `zustand` (cross-pane state) and `ai` + `@ai-sdk/google` (Vercel AI SDK for the Co-Pilot)
2. **One middleware change** — inject `x-next-pathname` header so the Left Pane can compute active link states server-side without `usePathname`
3. **Three new components** — `LeftSidebar` (RSC), `RightSidebar` (Client Component), `useTerminalStore` (Zustand store)
4. **One layout replacement** — `src/app/(apps)/layout.tsx` swapped from the current `AppShell` wrapper to the three-pane CSS Grid shell
5. **One API route** — `src/app/api/copilot/route.ts` streaming Gemini 2.5 Pro via the AI SDK
6. **Per-page context broadcasts** — each micro-app page calls `useTerminalStore.setState({ context: '...' })` in a `useEffect` so the Co-Pilot always knows what the user is looking at

The existing `AppShell` and `AppSwitcher` components are retired from the layout but their session/role-fetch logic is absorbed into `LeftSidebar`. The existing `src/middleware.ts` RBAC enforcement is preserved — only one line is added to inject the pathname header.

---

## Sub-Tasks

---

### T7.1 — Install Dependencies

**Intent**
Add `zustand`, `ai` (Vercel AI SDK core), and `@ai-sdk/google` to the project. These are absent from `package.json` and all subsequent tasks depend on them.

**Expected Outcomes**
- `package.json` lists `zustand`, `ai`, `@ai-sdk/google` as dependencies
- `node_modules` contains all three
- `tsc --noEmit` still clean after install

**Todo List**
1. Run `npm install zustand ai @ai-sdk/google` inside WSL
2. Confirm `tsc --noEmit` passes (no type conflicts with existing code)

**Relevant Context**
- Current `package.json` has no AI SDK or state-management library
- Must be installed inside WSL (not PowerShell) to get Linux-native binaries

**Status:** `[x] complete`

---

### T7.2 — Middleware: Inject `x-next-pathname` Header

**Intent**
Add one line to the existing `src/middleware.ts` to forward the request pathname as an HTTP header. The Left Pane Server Component reads this header to apply active-link styling without `usePathname` — keeping the Left Pane a pure RSC with no `'use client'` boundary.

**Expected Outcomes**
- Every matched request has an `x-next-pathname` header equal to `request.nextUrl.pathname`
- Existing RBAC redirect logic is completely unchanged
- `tsc --noEmit` clean

**Todo List**
1. In `middleware.ts`, clone the existing `response` and set `x-next-pathname` on the request headers before passing to the server
2. Verify the header is injected on both allow and redirect paths (it only needs to be on the allow path — redirects never reach the layout)

**Relevant Context**
- `src/middleware.ts` — existing file; only one line changes (header injection on the `response` object)
- Pattern from BOB.md §"Server-Side Pathname Resolution via Edge Middleware"
- Must not break the existing `supabase.auth.getUser()` + RBAC redirect flow

**Status:** `[x] complete`

---

### T7.3 — Zustand Terminal Store

**Intent**
Create the global Context Registry store. The Center Pane micro-apps write their semantic context into this store on mount; the Right Pane reads it just before dispatching each AI request. Because Zustand operates outside the React rendering cycle, sibling components in the CSS Grid can share state without prop drilling or context re-renders.

**Expected Outcomes**
- `src/store/terminalStore.ts` exports `useTerminalStore` with shape `{ context: string; setContext: (ctx: string) => void }`
- `tsc --noEmit` clean

**Todo List**
1. Create `src/store/terminalStore.ts`
2. Define store with `zustand/vanilla` or `create`: `{ context: '', setContext: (ctx) => set({ context: ctx }) }`
3. Export typed `useTerminalStore` hook

**Relevant Context**
- BOB.md §"Global Context Synchronization via the Context Registry Pattern"
- Zustand docs: `create` from `zustand`
- Store is imported by both `RightSidebar` (read) and individual page components (write via `setContext`)

**Status:** `[x] complete`

---

### T7.4 — `LeftSidebar` Server Component

**Intent**
Build the Left Pane as a React Server Component. It receives `currentPath` and the Supabase `user` object as props from the layout, maps over `ROLE_APP_MAP` to build the nav tree, and applies active-link styling purely from the `currentPath` prop — no `usePathname`, no `'use client'`.

**Expected Outcomes**
- `src/components/layout/LeftSidebar.tsx` — RSC, no `'use client'` directive
- Renders only nav items the user's role allows (via `getAllowedApps`)
- Active item styled with `bg-slate-800` or equivalent when `currentPath` starts with the item's href
- App name/logo at top, sign-out button at bottom
- `tsc --noEmit` clean

**Todo List**
1. Create `src/components/layout/LeftSidebar.tsx`
2. Accept props: `{ currentPath: string; user: User | null }`
3. Fetch user's role from `public.users` using the service client (passed user.id) — or accept `role` as a prop from the layout which already fetches it
4. Map `getAllowedApps(role)` to a nav item list with labels and hrefs
5. For each item: render a Next.js `<Link>` with `prefetch` enabled; apply active class if `currentPath.startsWith(href)`
6. Add "Shtiya Builder" wordmark at top
7. Add sign-out button at bottom using a small `'use client'` sub-component (`SignOutButton.tsx`) that calls `supabase.auth.signOut()` — this is the only client boundary in the Left Pane

**Relevant Context**
- `src/lib/rbac/roles.ts` — `ROLE_APP_MAP`, `getAllowedApps()`
- `src/lib/supabase/server.ts` — server client factory
- BOB.md §"Edge-to-Core Token Verification via Supabase SSR"
- Existing `AppSwitcher.tsx` — reference for app label/icon mapping

**Status:** `[x] complete`

---

### T7.5 — `RightSidebar` Client Component + AI SDK Integration

**Intent**
Build the Right Pane as a `'use client'` component containing the Agentic Co-Pilot chat interface. It uses the Vercel AI SDK `useChat` hook, but solves the stale-closure problem by injecting the current context string via `prepareSendMessagesRequest` rather than the hook's initial config — guaranteeing the AI always receives the user's current screen context regardless of when the layout last mounted.

**Expected Outcomes**
- `src/components/layout/RightSidebar.tsx` — `'use client'`, uses `useChat` from `ai/react`
- Scrolling message history area (flex-1, overflow-y-auto)
- Bottom-anchored input + send button
- Reads `context` from `useTerminalStore` inside `prepareSendMessagesRequest` — NOT at hook init time
- `tsc --noEmit` clean

**Todo List**
1. Create `src/components/layout/RightSidebar.tsx` with `'use client'`
2. Import `useChat` from `ai/react` and `useTerminalStore` from `@/store/terminalStore`
3. Call `useChat({ api: '/api/copilot' })` — no body/context at hook level
4. Implement `prepareSendMessagesRequest`: reads `useTerminalStore.getState().context` synchronously and appends `{ context }` to the request body
5. Render: header ("Co-Pilot"), scrolling messages list, bottom input form
6. Auto-scroll to bottom on new messages using a `useEffect` + ref

**Relevant Context**
- BOB.md §"Resolving Vercel AI SDK Stale State Anomalies" — the `prepareSendMessagesRequest` pattern
- AI SDK docs: `useChat` hook, `prepareSendMessagesRequest` callback
- `src/store/terminalStore.ts` — created in T7.3

**Status:** `[x] complete`

---

### T7.6 — `/api/copilot` Route Handler

**Intent**
Build the server-side API route that the `useChat` hook posts to. It extracts the `messages` array and the injected `context` string from the request body, assembles a dynamic system prompt embedding the context, and streams the Gemini 2.5 Pro response back using the AI SDK's streaming protocol.

**Expected Outcomes**
- `src/app/api/copilot/route.ts` — POST handler using `streamText` from `ai` and `google` provider from `@ai-sdk/google`
- Parses `{ messages, context }` from request body
- System prompt: `"You are an enterprise financial co-pilot for the Shtiya Builder platform. The user is currently viewing: ${context}. Answer questions about what they see and help them take action."`
- Streams response via `result.toDataStreamResponse()`
- Authenticated — returns 401 if no session
- `tsc --noEmit` clean

**Todo List**
1. Create `src/app/api/copilot/route.ts`
2. Authenticate with `createClient()` — return 401 if no user
3. Parse body: `const { messages, context } = await request.json()`
4. Build system prompt embedding context string
5. Call `streamText({ model: google('gemini-2.5-pro'), system: systemPrompt, messages })`
6. Return `result.toDataStreamResponse()`
7. Set `export const runtime = 'nodejs'`

**Relevant Context**
- BOB.md §"Directive for the Backend Sub-Agent (Gemini)"
- Vercel AI SDK: `streamText`, `toDataStreamResponse`
- `@ai-sdk/google`: `google()` provider factory, requires `GOOGLE_GENERATIVE_AI_API_KEY` env var (same key as `GEMINI_API_KEY` — alias in `.env.local`)
- `src/lib/supabase/server.ts` — auth check pattern

**Status:** `[x] complete`

---

### T7.7 — Terminal Layout Shell (`(apps)/layout.tsx` replacement)

**Intent**
Replace the current `src/app/(apps)/layout.tsx` (which wraps `AppShell`) with the three-pane CSS Grid shell from BOB.md. This is the single most impactful change — once applied, every page in `(apps)` renders inside the terminal layout.

**Expected Outcomes**
- `src/app/(apps)/layout.tsx` — async Server Component, three-column CSS Grid
- Grid: `grid-cols-[250px_1fr_350px] h-screen overflow-hidden bg-slate-950`
- Left `<aside>`: renders `<LeftSidebar currentPath={currentPath} user={user} role={role} />`
- Center `<main>`: `min-h-0 min-w-0 overflow-y-auto` (grid-blowout prevention)
- Right `<aside>`: renders `<RightSidebar />`
- Reads `x-next-pathname` from `headers()`
- Fetches session + role from Supabase
- `tsc --noEmit` and `next build` clean (all existing routes still resolve)

**Todo List**
1. Read current `src/app/(apps)/layout.tsx` and the existing `AppShell` import
2. Replace the file entirely with the BOB.md blueprint, adapted for the existing `createClient` factory signature (`await createClient()` not `createServerClient()`)
3. Pass `currentPath`, `user`, and `role` to `LeftSidebar`
4. Confirm no existing page imports `AppShell` directly (it was used only in this layout and the individual role-group layouts)
5. Update the three role-group layouts (`(admin)`, `(owner)`, `(contractor)`) — they currently render `<AppShell>` wrapping children; remove that wrapper since the terminal layout now owns the chrome. Keep only the role-gate redirect logic.
6. Run `next build` and confirm all routes generate

**Relevant Context**
- `src/app/(apps)/layout.tsx` — file being replaced
- `src/app/(apps)/(admin)/layout.tsx`, `(owner)/layout.tsx`, `(contractor)/layout.tsx` — role-gate layouts that wrap children; `AppShell` import must be removed from these too
- `src/components/shared/AppShell.tsx` — will become unused after this task; can be deleted or kept for reference
- BOB.md Component 2: Master Layout Blueprint

**Status:** `[x] complete`

---

### T7.8 — Per-Page Context Broadcasts

**Intent**
Wire each primary micro-app page to broadcast its semantic context to the Zustand store on mount. This is what makes the Co-Pilot context-aware — when a user navigates to the Capital draws page, the Co-Pilot knows it and responds accordingly.

**Expected Outcomes**
- A shared `usePageContext(description: string)` hook in `src/hooks/usePageContext.ts` that calls `setContext` in a `useLayoutEffect`
- Applied to the 5 highest-value pages for the hackathon demo: `/office`, `/owner`, `/acquisition`, `/contractor/vision`, `/capital`
- Each page shows a meaningful context string, e.g. `"Viewing: Agent Command Center — Watchdog, Vision, Sentinel, Pulse, Match feeds"`

**Todo List**
1. Create `src/hooks/usePageContext.ts` — a thin `'use client'` hook that calls `useTerminalStore(s => s.setContext)` in a `useLayoutEffect` with the provided string
2. Add the hook call to the top of each target page's client component (or create a small `PageContextProvider` wrapper for server-component pages that need it)
3. Write a context string for each page that tells the Co-Pilot what the user is looking at

**Relevant Context**
- `src/store/terminalStore.ts` — T7.3
- Target pages: `office/page.tsx`, `owner/page.tsx`, `acquisition/page.tsx`, `contractor/vision/page.tsx`, `capital/page.tsx`
- BOB.md §"Global Context Synchronization via the Context Registry Pattern"

**Status:** `[x] complete`

---

## Environment Variable Note

`@ai-sdk/google` reads `GOOGLE_GENERATIVE_AI_API_KEY`. The project currently stores the Gemini key as `GEMINI_API_KEY`. Add this alias to `.env.local` and Vercel environment variables:

```env
GOOGLE_GENERATIVE_AI_API_KEY=<same value as GEMINI_API_KEY>
```

---

## What Does NOT Change

- All 10 migration files — no DB schema changes
- All existing API routes — `/api/connections`, `/api/milestone-upload`, etc.
- The `src/middleware.ts` RBAC redirect logic — T7.2 only adds one line
- `ROLE_APP_MAP` and all RLS policies
- The three role-group layouts' security logic — only the `AppShell` wrapper is removed
