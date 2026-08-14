/**
 * ROLE_APP_MAP — mirrors Plan.md §1.2.
 *
 * Keys are the `users.role` enum values stored in the database.
 * Values are the URL path segments under /(apps)/ that each role may access.
 */
export const ROLE_APP_MAP: Record<string, string[]> = {
  owner:            ['owner', 'property', 'escrow'],
  investor:         ['acquisition', 'capital', 'escrow'],
  attorney:         ['legal', 'escrow'],
  lender:           ['capital', 'escrow'],
  contractor:       ['contractor', 'design', 'escrow'],
  architect:        ['design', 'escrow'],
  property_manager: ['property', 'escrow'],
  tenant:           ['property'],
  admin:            [
    'office', 'owner', 'acquisition', 'legal', 'capital',
    'design', 'contractor', 'property', 'escrow', 'marketing',
  ],
  marketer:         ['marketing', 'acquisition'],
} as const;

export type AppRole = keyof typeof ROLE_APP_MAP;

/** Returns the list of apps accessible to a given role (empty array = none). */
export function getAllowedApps(role: string | null | undefined): string[] {
  return ROLE_APP_MAP[role ?? ''] ?? [];
}
