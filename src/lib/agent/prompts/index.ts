import {
  OWNER_ADVISOR_PROMPT, LENDER_UNDERWRITER_PROMPT, LEGAL_RESEARCHER_PROMPT,
  ARBITRATION_NEUTRAL_PROMPT, CONTRACTOR_OPS_PROMPT, DESIGN_REVIEWER_PROMPT,
  TENANT_SERVICES_PROMPT, BROKER_ASSISTANT_PROMPT, ADMIN_OPS_PROMPT, PLATFORM_SUPPORT_PROMPT,
} from './prompts';

export type AgentType =
  | 'owner_advisor' | 'lender_underwriter' | 'legal_researcher'
  | 'arbitration_neutral' | 'contractor_ops' | 'design_reviewer'
  | 'tenant_services' | 'broker_assistant' | 'admin_ops' | 'platform_support';

export const AGENT_PROMPTS: Record<AgentType, string> = {
  owner_advisor:       OWNER_ADVISOR_PROMPT,
  lender_underwriter:  LENDER_UNDERWRITER_PROMPT,
  legal_researcher:    LEGAL_RESEARCHER_PROMPT,
  arbitration_neutral: ARBITRATION_NEUTRAL_PROMPT,
  contractor_ops:      CONTRACTOR_OPS_PROMPT,
  design_reviewer:     DESIGN_REVIEWER_PROMPT,
  tenant_services:     TENANT_SERVICES_PROMPT,
  broker_assistant:    BROKER_ASSISTANT_PROMPT,
  admin_ops:           ADMIN_OPS_PROMPT,
  platform_support:    PLATFORM_SUPPORT_PROMPT,
};

export const AGENT_TYPES = Object.keys(AGENT_PROMPTS) as AgentType[];

export function isAgentType(value: unknown): value is AgentType {
  return typeof value === 'string' && value in AGENT_PROMPTS;
}
