import crypto from 'crypto';
import {
  verifyMicrovmProof, proofIncludesPiiScan, assertPathWithinOrg,
  orgRootPath, sniffMime, sha256,
} from './microvm';

const FILE_HASH = 'a'.repeat(64);

function encode(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function makeProof(overrides: Record<string, unknown> = {}): string {
  return encode({
    file_sha256: FILE_HASH,
    provider: 'firecracker',
    steps: [{ type: 'pii_scan', status: 'passed' }, { type: 'malware_scan', status: 'passed' }],
    signature: 'mocksig',
    signed_payload: `sandbox=firecracker;file=${FILE_HASH}`,
    ...overrides,
  });
}

describe('proofIncludesPiiScan (I-H3)', () => {
  it('is true when the pii_scan step passed', () => {
    expect(proofIncludesPiiScan(makeProof())).toBe(true);
  });

  it('is false when the pii_scan step is absent', () => {
    expect(proofIncludesPiiScan(makeProof({ steps: [{ type: 'malware_scan', status: 'passed' }] }))).toBe(false);
  });

  it('is false when the pii_scan step ran but did not pass', () => {
    expect(proofIncludesPiiScan(makeProof({ steps: [{ type: 'pii_scan', status: 'failed' }] }))).toBe(false);
  });

  it('is false for an unreadable proof', () => {
    expect(proofIncludesPiiScan('!!not base64!!')).toBe(false);
  });
});

describe('assertPathWithinOrg (I-H21)', () => {
  const orgId  = '12345678-1234-1234-1234-123456789abc';
  const root   = orgRootPath(orgId);

  it('accepts the org root itself and its descendants', async () => {
    expect(await assertPathWithinOrg({ path: root, orgId })).toBe(true);
    expect(await assertPathWithinOrg({ path: `${root}.Playbooks`, orgId })).toBe(true);
    expect(await assertPathWithinOrg({ path: `${root}.Playbooks.Concrete`, orgId })).toBe(true);
  });

  it('rejects a shared branch', async () => {
    expect(await assertPathWithinOrg({ path: 'ROOT.Law.US.NY', orgId })).toBe(false);
  });

  it('rejects another org subtree', async () => {
    const other = orgRootPath('87654321-4321-4321-4321-cba987654321');
    expect(await assertPathWithinOrg({ path: `${other}.Playbooks`, orgId })).toBe(false);
  });

  it('rejects a label that merely starts with the org root label', async () => {
    // `o_<hex>evil` is a DIFFERENT ltree label. A bare startsWith() accepts it.
    expect(await assertPathWithinOrg({ path: `${root}evil.Playbooks`, orgId })).toBe(false);
  });

  it('rejects a path with characters an ltree label cannot hold', async () => {
    expect(await assertPathWithinOrg({ path: `${root}.Play books`, orgId })).toBe(false);
    expect(await assertPathWithinOrg({ path: `${root}.Play-books`, orgId })).toBe(false);
    expect(await assertPathWithinOrg({ path: `${root}..Playbooks`, orgId })).toBe(false);
  });
});

describe('verifyMicrovmProof (I-H6)', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  function sign(payload: string): string {
    const s = crypto.createSign('SHA256');
    s.update(payload);
    s.end();
    return s.sign(privateKey, 'base64');
  }

  beforeEach(() => { process.env.MICROVM_PUBKEY_FIRECRACKER = pubPem; });
  afterEach(() => { delete process.env.MICROVM_PUBKEY_FIRECRACKER; });

  it('accepts a correctly signed proof bound to the file hash', async () => {
    const signed_payload = `sandbox=firecracker;file=${FILE_HASH}`;
    const proof = makeProof({ signed_payload, signature: sign(signed_payload) });
    expect(await verifyMicrovmProof({ proof, provider: 'firecracker', fileHash: FILE_HASH })).toBe(true);
  });

  it('rejects a proof whose hash does not match the uploaded bytes', async () => {
    const signed_payload = `sandbox=firecracker;file=${FILE_HASH}`;
    const proof = makeProof({ signed_payload, signature: sign(signed_payload) });
    expect(await verifyMicrovmProof({ proof, provider: 'firecracker', fileHash: 'b'.repeat(64) })).toBe(false);
  });

  it('rejects a signature that does not verify', async () => {
    const signed_payload = `sandbox=firecracker;file=${FILE_HASH}`;
    const proof = makeProof({ signed_payload, signature: sign('a different payload') });
    expect(await verifyMicrovmProof({ proof, provider: 'firecracker', fileHash: FILE_HASH })).toBe(false);
  });

  it('rejects when the signed payload does not commit to the file hash', async () => {
    // file_sha256 is an unsigned envelope field; if the signature does not
    // cover the hash, editing the envelope would be enough to pass.
    const signed_payload = 'sandbox=firecracker;file=SOMETHING_ELSE';
    const proof = makeProof({ signed_payload, signature: sign(signed_payload) });
    expect(await verifyMicrovmProof({ proof, provider: 'firecracker', fileHash: FILE_HASH })).toBe(false);
  });

  it('fails closed for an unknown provider', async () => {
    const proof = makeProof();
    expect(await verifyMicrovmProof({ proof, provider: 'nitro', fileHash: FILE_HASH })).toBe(false);
  });

  it('fails closed when the provider key is not configured', async () => {
    delete process.env.MICROVM_PUBKEY_FIRECRACKER;
    const signed_payload = `sandbox=firecracker;file=${FILE_HASH}`;
    const proof = makeProof({ signed_payload, signature: sign(signed_payload) });
    expect(await verifyMicrovmProof({ proof, provider: 'firecracker', fileHash: FILE_HASH })).toBe(false);
  });

  it('rejects a provider mismatch between envelope and request', async () => {
    const signed_payload = `sandbox=gvisor;file=${FILE_HASH}`;
    const proof = makeProof({ provider: 'gvisor', signed_payload, signature: sign(signed_payload) });
    expect(await verifyMicrovmProof({ proof, provider: 'firecracker', fileHash: FILE_HASH })).toBe(false);
  });
});

describe('sniffMime (I-H18)', () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0]).buffer;

  it('identifies content from magic bytes, not from a declared type', () => {
    expect(sniffMime(bytes(0x25, 0x50, 0x44, 0x46))).toBe('application/pdf');
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47))).toBe('image/png');
    expect(sniffMime(bytes(0xff, 0xd8, 0xff))).toBe('image/jpeg');
    expect(sniffMime(bytes(0x50, 0x4b, 0x03, 0x04))).toBe('application/zip');
  });

  it('falls back to octet-stream rather than trusting anything', () => {
    expect(sniffMime(bytes(0x00, 0x01, 0x02, 0x03))).toBe('application/octet-stream');
  });
});

describe('sha256', () => {
  it('hashes the received bytes', async () => {
    const buf = new TextEncoder().encode('hello').buffer as ArrayBuffer;
    expect(await sha256(buf)).toBe(crypto.createHash('sha256').update('hello').digest('hex'));
  });
});
