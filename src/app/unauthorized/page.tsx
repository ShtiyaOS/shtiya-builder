import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/rbac/current-user';
import { getAllowedApps } from '@/lib/rbac/roles';
import { SignOutButton } from '@/components/layout/SignOutButton';

/**
 * 403.
 *
 * THE ESCAPE HATCH IS THE POINT. This page used to offer a single "Back to
 * home" link to `/` — and `/` routes a user with no allowed apps straight back
 * here. A signed-in account without a profile row was therefore trapped in a
 * redirect loop with no way out short of clearing cookies, which is not
 * something to discover in front of an audience.
 *
 * It now states WHICH account is signed in and WHY it was refused, and always
 * offers sign-out. "Back to home" appears only when there is a home to go to.
 */
export default async function UnauthorizedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const profile = user ? await getCurrentProfile(user.id) : null;
  const allowedApps = getAllowedApps(profile?.platform_role);

  const reason = !user
    ? 'You are not signed in.'
    : !profile
      ? 'This account has no profile record, so it carries no role and no application access.'
      : allowedApps.length === 0
        ? `The role "${profile.platform_role}" is not mapped to any application.`
        : 'Your role does not have permission to access this application.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-4xl font-bold text-gray-900">403</h1>
        <h2 className="text-xl font-semibold text-gray-700">Access denied</h2>

        <p className="text-sm text-gray-600">{reason}</p>

        {user && (
          <p className="text-xs text-gray-500">
            Signed in as <span className="font-medium">{user.email}</span>
          </p>
        )}

        <div className="flex items-center justify-center gap-3 pt-2">
          {allowedApps[0] && (
            <a
              href={`/${allowedApps[0]}`}
              className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Go to {allowedApps[0]}
            </a>
          )}
          {user ? (
            // SignOutButton is styled for the dark LeftSidebar (w-full, slate
            // hovers). Wrapped so it reads as a button on this light page
            // rather than restyling the shared component for one caller.
            <div className="w-auto rounded-md border border-gray-300 bg-white px-1 text-gray-700 [&_button]:text-gray-700 [&_button]:hover:bg-gray-100 [&_button]:hover:text-gray-900">
              <SignOutButton />
            </div>
          ) : (
            <a
              href="/login"
              className="inline-block rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
