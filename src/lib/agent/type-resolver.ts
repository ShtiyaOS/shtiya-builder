import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentType } from './prompts/index';
import type { ScopeSet } from './scope-set';

/**
 * -- I-A1: the role → agent map is a compile-time constant. It is never derived
 * from user input, and an override never widens it.
 *
 * Keyed on the FULL platform_role, not on a prefix. The spec's
 * platform_role.split('_')[0] silently drops five of the twenty-seven live
 * roles: 'asset_manager' and 'facility_manager' split to 'asset'/'facility',
 * and 'per_diem', 'process_server' and 'gig_worker' split to 'per'/'process'/
 * 'gig' — none of which are map keys, so those users resolve to no agent at
 * all. The groupings below mirror the database's own current_user_role_group().
 */
const ROLE_AGENT_MAP: Record<string, AgentType> = {
  // owner
  owner_occupant:           'owner_advisor',
  owner_investor:           'owner_advisor',
  owner_distressed:         'owner_advisor',
  // tenant
  tenant_market:            'tenant_services',
  tenant_section8:          'tenant_services',
  tenant_commercial:        'tenant_services',
  // lender
  lender_mortgage:          'lender_underwriter',
  lender_bridge:            'lender_underwriter',
  lender_mezzanine:         'lender_underwriter',
  // contractor
  contractor_gc:            'contractor_ops',
  contractor_sub:           'contractor_ops',
  contractor_owner_builder: 'contractor_ops',
  // architect
  architect_licensed:       'design_reviewer',
  architect_intern:         'design_reviewer',
  architect_owner_designer: 'design_reviewer',
  // property_manager
  property_manager:         'tenant_services',
  asset_manager:            'tenant_services',
  facility_manager:         'tenant_services',
  // attorney
  attorney_re:              'legal_researcher',
  attorney_liti:            'legal_researcher',
  attorney_corp:            'legal_researcher',
  // broker
  broker_buyers:            'broker_assistant',
  broker_sellers:           'broker_assistant',
  broker_dual:              'broker_assistant',
  // billing / gig
  per_diem:                 'platform_support',
  process_server:           'platform_support',
  gig_worker:               'platform_support',
};

/**
 * Matter roles that make the caller a NEUTRAL rather than an advocate. A
 * neutral must not be handed the advocate's prompt: the two have opposite
 * duties, and arbitration_neutral is otherwise unreachable because no
 * platform_role denotes a neutral — the capacity is per-matter, not per-person.
 */
const NEUTRAL_MATTER_ROLES = ['arbitrator', 'mediator'];

export async function resolveAgentType(params: {
  userId:        string;
  scopeSet:      ScopeSet;
  requestedType: AgentType | undefined;
  supabase:      SupabaseClient;
}): Promise<AgentType | null> {
  const { userId, scopeSet, requestedType, supabase } = params;

  // A denied scope has no agent. Resolving one would mean building a prompt for
  // a subject the caller cannot read.
  if (scopeSet.denied) return null;

  const { data: user } = await supabase
    .from('users').select('platform_role').eq('id', userId).maybeSingle();

  const platformRole = (user as { platform_role: string } | null)?.platform_role;
  if (!platformRole) return null;

  let defaultType = ROLE_AGENT_MAP[platformRole];
  if (!defaultType) return null;

  // Capacity beats identity: an attorney sitting as the arbitrator on THIS
  // matter is a neutral for this conversation.
  if (scopeSet.subjectKind === 'matter') {
    const { data: mp } = await supabase
      .from('matter_parties')
      .select('party_role')
      .eq('matter_id', scopeSet.subjectId)
      .eq('user_id', userId)
      .maybeSingle();

    const partyRole = (mp as { party_role: string } | null)?.party_role;
    if (partyRole && NEUTRAL_MATTER_ROLES.includes(partyRole)) {
      defaultType = 'arbitration_neutral';
    }
  }

  // An override is a UX preference, never an escalation. No platform_role in
  // the live CHECK constraint denotes an administrator, so there is no role
  // that may cross-select; a mismatched request is refused rather than honoured.
  if (requestedType && requestedType !== defaultType) return null;

  return defaultType;
}
