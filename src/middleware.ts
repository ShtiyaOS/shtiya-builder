import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware';
import { getAllowedApps } from '@/lib/rbac/roles';

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
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  // Extract the top-level app segment from the URL.
  // e.g. "/capital/draws/123" → "capital"
  const appSegment = request.nextUrl.pathname.split('/')[1] ?? '';

  const allowedApps = getAllowedApps(profile?.role);

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
