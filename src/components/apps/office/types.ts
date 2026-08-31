/**
 * Shared row shapes for the Agent Observability Command Center (T5.2).
 *
 * These mirror the columns each panel needs after the server component in
 * `office/page.tsx` joins/decodes the raw table rows — kept in one place so
 * the server-side fetch and the client-side panels never drift apart.
 */

export interface ViolationRow {
  id: string;
  property_id: string | null;
  property_address: string | null;
  source: string; // violation_source enum: DOB | HPD | ECB | 311
  external_id: string;
  description: string | null;
  issued_date: string | null;
  status: string;
  created_at: string;
}

export interface VisionInspectionRow {
  id: string;
  document_id: string | null;
  property_id: string | null;
  property_address: string | null;
  contractor_id: string | null;
  contractor_name: string;
  ai_summary: string | null;
  flagged_issues: { issue: string; severity: string }[];
  confidence: number | null;
  blocks_draw: boolean;
  created_at: string;
}

export interface ComplianceCheckRow {
  id: string;
  contractor_id: string | null;
  contractor_name: string;
  license_number: string | null;
  insurance_policy_number: string | null;
  expiration_date: string | null;
  status: string; // compliance_status enum: valid | expiring_soon | lapsed
  last_verified_at: string | null;
  source: string;
}

export interface DealRoomEventRow {
  id: string;
  block_committee_id: string | null;
  committee_name: string | null;
  financial_ledger_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface MatchedLeadRow {
  id: string;
  name: string;
  email: string;
  description: string;
  source: string;
  submitted_at: string;
  related_property_id: string | null;
  related_property_address: string | null;
  match_score: number | null;
  created_at: string;
}
