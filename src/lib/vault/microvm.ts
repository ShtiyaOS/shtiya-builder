import crypto from 'crypto';

/**
 * MicroVM ingest proof verification.
 *
 * A tenant upload is parsed inside a disposable sandbox, and the sandbox signs
 * an attestation of what it did. This module is the only thing that decides
 * whether that attestation is real; nothing downstream re-opens the question.
 */

export interface MicrovmProofStep {
  type:   string;
  status: string;
}

export interface MicrovmProof {
  file_sha256:    string;
  provider:       string;
  steps:          MicrovmProofStep[];
  signature:      string;
  signed_payload: string;
}

/** One env var per provider. An unknown provider has no key and so cannot pass. */
const PROVIDER_PUBKEY_ENV: Record<string, string> = {
  firecracker: 'MICROVM_PUBKEY_FIRECRACKER',
  gvisor:      'MICROVM_PUBKEY_GVISOR',
  kata:        'MICROVM_PUBKEY_KATA',
};

export async function sha256(buffer: ArrayBuffer): Promise<string> {
  return crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');
}

function decodeProof(proof: string): MicrovmProof | null {
  try {
    const json = Buffer.from(proof, 'base64').toString('utf-8');
    const parsed = JSON.parse(json) as MicrovmProof;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.steps)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * -- I-H6: the proof must bind to THIS file and be signed by a known provider.
 *
 * Fails closed at every branch: an unknown provider, an unset key, a malformed
 * envelope and a hash mismatch are all `false`, never "assume fine".
 */
export async function verifyMicrovmProof(params: {
  proof:    string;
  provider: string;
  fileHash: string;
}): Promise<boolean> {
  const { proof, provider, fileHash } = params;

  const decoded = decodeProof(proof);
  if (!decoded) return false;

  // The proof must be about the bytes actually received, and must not disagree
  // with itself about which sandbox produced it.
  if (decoded.file_sha256 !== fileHash) return false;
  if (decoded.provider && decoded.provider !== provider) return false;
  if (typeof decoded.signature !== 'string' || typeof decoded.signed_payload !== 'string') {
    return false;
  }

  // The signed payload must itself commit to the file hash. Without this the
  // signature could cover an unrelated payload while file_sha256 — an unsigned
  // field of the envelope — is edited to match whatever was uploaded.
  if (!decoded.signed_payload.includes(fileHash)) return false;

  const pubkeyEnv = PROVIDER_PUBKEY_ENV[provider];
  if (!pubkeyEnv) return false;
  const pubkey = process.env[pubkeyEnv];
  if (!pubkey) return false;                    // env not configured — fail closed

  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(decoded.signed_payload);
    verify.end();
    return verify.verify(pubkey, decoded.signature, 'base64');
  } catch {
    return false;
  }
}

/** -- I-H3: the sandbox must attest that it ran a PII scan and that it passed. */
export function proofIncludesPiiScan(proof: string): boolean {
  const decoded = decodeProof(proof);
  if (!decoded) return false;
  return decoded.steps.some(s => s?.type === 'pii_scan' && s?.status === 'passed');
}

/** Steps the sandbox reports, for the custody log. Empty when the proof is unreadable. */
export function proofSteps(proof: string): MicrovmProofStep[] {
  return decodeProof(proof)?.steps ?? [];
}

/** An ltree label admits only [A-Za-z0-9_]; labels are joined by dots. */
const LTREE_PATH_RE = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/;

export function orgRootPath(orgId: string): string {
  return `ROOT.Org.o_${orgId.replace(/-/g, '')}`;
}

/**
 * -- I-H21: a tenant upload may only be filed inside its own org subtree.
 *
 * Mirrors ltree `<@` semantics: equal to the org root, or a descendant of it.
 * A bare startsWith() would accept `ROOT.Org.o_<victimhex>evil`, which is a
 * different, valid ltree label that merely begins with the same characters —
 * the label boundary is what makes this a containment test rather than a
 * string test.
 */
export async function assertPathWithinOrg(params: {
  path:  string;
  orgId: string;
}): Promise<boolean> {
  const { path, orgId } = params;
  if (typeof path !== 'string' || !LTREE_PATH_RE.test(path)) return false;

  const root = orgRootPath(orgId);
  return path === root || path.startsWith(`${root}.`);
}

/**
 * -- I-H18: the server decides what a file is. `declared_mime` is recorded and
 * never routes parsing, because a content type chosen by the uploader is a
 * parser chosen by the uploader.
 */
export function sniffMime(buffer: ArrayBuffer): string {
  const b = Buffer.from(buffer.slice(0, 12));
  if (b.length >= 4) {
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)                  return 'image/jpeg';
    if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05)) {
      // OOXML and ODF are both ZIP containers; the sandbox distinguishes them.
      return 'application/zip';
    }
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46)                  return 'image/gif';
    if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) ||
        (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00))                return 'image/tiff';
  }
  return 'application/octet-stream';
}
