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

/**
 * PLATFORM_ROLE_APP_MAP — the v3 role vocabulary.
 *
 * ROLE_APP_MAP above is keyed on the v1 `users.role` enum ('owner',
 * 'investor', …). That column NO LONGER EXISTS: the live users table carries
 * `platform_role`, holding one of 27 values ('owner_investor',
 * 'contractor_gc', …). Every one of those missed ROLE_APP_MAP, resolved to the
 * empty list, and sent the user to /unauthorized — measured against the live
 * database, on every app route.
 *
 * The groupings mirror ROLE_AGENT_MAP in src/lib/agent/type-resolver.ts, so a
 * user's apps and their Co-Pilot agent are derived from the same reading of
 * their role rather than from two lists that can disagree.
 */
export const PLATFORM_ROLE_APP_MAP: Record<string, string[]> = {
  // owners
  owner_occupant:           ['owner', 'property', 'escrow'],
  owner_investor:           ['owner', 'property', 'escrow', 'acquisition', 'capital'],
  owner_distressed:         ['owner', 'property', 'escrow'],
  // tenants
  tenant_market:            ['property'],
  tenant_section8:          ['property'],
  tenant_commercial:        ['property'],
  // lenders
  lender_mortgage:          ['capital', 'escrow'],
  lender_bridge:            ['capital', 'escrow'],
  lender_mezzanine:         ['capital', 'escrow'],
  // contractors
  contractor_gc:            ['contractor', 'design', 'escrow'],
  contractor_sub:           ['contractor', 'design', 'escrow'],
  contractor_owner_builder: ['contractor', 'design', 'escrow', 'property'],
  // architects
  architect_licensed:       ['design', 'escrow'],
  architect_intern:         ['design'],
  architect_owner_designer: ['design', 'property'],
  // managers
  property_manager:         ['property', 'escrow'],
  asset_manager:            ['property', 'capital', 'escrow'],
  facility_manager:         ['property'],
  // attorneys
  attorney_re:              ['legal', 'escrow'],
  attorney_liti:            ['legal', 'escrow'],
  attorney_corp:            ['legal', 'escrow'],
  // brokers
  broker_buyers:            ['acquisition', 'marketing'],
  broker_sellers:           ['acquisition', 'marketing'],
  broker_dual:              ['acquisition', 'marketing'],
  // gig / billing actors
  per_diem:                 ['office'],
  process_server:           ['office'],
  gig_worker:               ['office'],
};

/**
 * Returns the list of apps accessible to a given role (empty array = none).
 *
 * Accepts either vocabulary. The v3 map is consulted FIRST so that a value
 * present in both resolves to the current definition, and an unknown role still
 * yields [] — the deny path is unchanged.
 */
export function getAllowedApps(role: string | null | undefined): string[] {
  const key = role ?? '';
  return PLATFORM_ROLE_APP_MAP[key] ?? ROLE_APP_MAP[key] ?? [];
}
