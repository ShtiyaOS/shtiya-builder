import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * OAuth callback handler.
 *
 * Supabase redirects here after a successful OAuth flow with a `code` query
 * parameter.  We exchange the code for a session and then redirect the user
 * to the app root (or a `next` redirect if provided).
 *
 * New OAuth signups trigger the `handle_new_user` database trigger which
 * inserts a row into `public.users` with the default role of `owner`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Allow callers to specify a post-auth destination, e.g. ?next=/owner
  const next = searchParams.get('next') ?? '/';

  if (!code) {
    // No code present — something went wrong with the OAuth flow.
    return NextResponse.redirect(new URL('/login?error=missing_code', origin));
  }

  // Build a response we can attach cookies to before redirecting.
  const redirectUrl = new URL(next.startsWith('/') ? next : '/', origin);
  const response = NextResponse.redirect(redirectUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errorUrl = new URL('/login', origin);
    errorUrl.searchParams.set('error', error.message);
    return NextResponse.redirect(errorUrl);
  }

  return response;
}
