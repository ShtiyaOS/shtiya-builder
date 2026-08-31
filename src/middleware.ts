import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware';
import { getAllowedApps } from '@/lib/rbac/roles';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Next.js Edge Middleware — session refresh + RBAC enforcement.
 *
 * 1. Refreshes the Supabase Auth session on every request so Server Components
 *    always receive a valid, up-to-date session cookie.
 * 2. On app routes (anything matched by `config.matcher`), reads the user's
 *    `role` from `public.users` and enforces `ROLE_APP_MAP` from roles.ts.
 *    Unauthenticated users are redirected to /login.
 *    Authenticated users without access to the requested app are redirected
 *    to /unauthorized.
 */
export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);

  // IMPORTANT: always call getUser() (not getSession()) to validate the JWT
  // against Supabase Auth server and prevent session spoofing.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Resolve the user's role from the public.users table.
  //
  // TWO CORRECTIONS, both measured against the live database:
  //   - the column is `platform_role`. `users.role` does not exist, so the old
  //     query errored, profile came back null, and getAllowedApps(undefined)
  //     returned [] — sending EVERY authenticated user to /unauthorized on
  //     EVERY app route.
  //   - the row is keyed by `auth_user_id`, not `id`. users.id is a surrogate
  //     key; auth.uid() matches auth_user_id. Same bug as the copilot route.
  //
  // maybeSingle() rather than single(): a user with no profile row is a normal
  // state (redirect to /unauthorized), not an exception to throw in middleware.
  // Read on the SERVICE client. The RLS policies on users are written against
  // the row's own id, so a session client cannot read the row that states its
  // own role — measured: this lookup returned null for a valid session and sent
  // the user to /unauthorized.
  //
  // This is not a privilege escalation. The filter is the auth.uid() that
  // getUser() just verified against the Auth server, so exactly one row can
  // come back — the caller's own. The RBAC decision itself is still made below,
  // in code, from that role.
  const { data: profile } = await createAdminClient()
    .from('users')
    .select('platform_role')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // Extract the top-level app segment from the URL.
  // e.g. "/capital/draws/123" → "capital"
  const appSegment = request.nextUrl.pathname.split('/')[1] ?? '';

  const allowedApps = getAllowedApps(profile?.platform_role);

  if (!allowedApps.includes(appSegment)) {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  // Forward the resolved pathname to the Next.js server as a request header
  // so Server Components (the terminal shell's `(apps)/layout.tsx`) can read
  // it via `headers()` without needing `usePathname` client-side. Cookies
  // already staged on `response` (session refresh) are carried over onto
  // the new response so nothing from the Supabase auth flow above is lost.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-next-pathname', request.nextUrl.pathname);
  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.getAll().forEach((cookie) => finalResponse.cookies.set(cookie));

  return finalResponse;
}

export const config = {
  matcher: [
    '/owner/:path*',
    '/acquisition/:path*',
    '/legal/:path*',
    '/capital/:path*',
    '/design/:path*',
    '/contractor/:path*',
    '/property/:path*',
    '/escrow/:path*',
    '/office/:path*',
    '/marketing/:path*',
  ],
};
