import { stripExfil } from './exfil-strip';

/**
 * -- I-A16, Gate 4. Deliberately over-inclusive: a reader who loses a
 * legitimate number asks again, a reader who receives someone's SSN cannot
 * un-receive it. These tests pin that asymmetry, so a later "reduce false
 * positives" edit has to break one of them on purpose.
 */
describe('stripExfil — email', () => {
  it.each([
    'counsel@example.com',
    'first.last@sub.domain.co.uk',
    'first+tag@example.org',
    'a_b-c%d@example-host.io',
  ])('redacts %s', address => {
    const result = stripExfil(`Contact ${address} for the file.`);
    expect(result.content).not.toContain(address);
    expect(result.content).toContain('[REDACTED]');
    expect(result.triggered).toBe(true);
    expect(result.labels).toContain('email');
  });

  it('redacts every address in a message, not only the first', () => {
    const result = stripExfil('Cc a@example.com and b@example.com on the notice.');
    expect(result.content).not.toMatch(/@example\.com/);
    expect(result.match_count).toBe(2);
  });
});

describe('stripExfil — phone', () => {
  it.each([
    '(212) 555-0147',
    '212-555-0147',
    '212.555.0147',
    '+1 212 555 0147',
    '+1-212-555-0147',
  ])('redacts %s', number => {
    const result = stripExfil(`Reach the office at ${number} before noon.`);
    expect(result.content).not.toContain(number);
    expect(result.content).toContain('[REDACTED]');
    expect(result.labels).toContain('phone');
  });

  it('redacts a bare ten-digit run', () => {
    const result = stripExfil('Their direct line is 2125550147 today.');
    expect(result.content).not.toContain('2125550147');
    expect(result.labels).toContain('phone_bare');
  });

  it('does not mistake an SSN for a phone number', () => {
    const result = stripExfil('SSN 123-45-6789 on the intake form.');
    expect(result.content).not.toContain('123-45-6789');
    expect(result.labels).toContain('ssn');
    expect(result.labels).not.toContain('phone');
  });
});

describe('stripExfil — UUID', () => {
  it.each([
    '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
  ])('redacts %s', uuid => {
    const result = stripExfil(`The chunk is filed as ${uuid} in the vault.`);
    expect(result.content).not.toContain(uuid);
    expect(result.labels).toContain('uuid');
  });

  it('redacts a UUID embedded in a sentence without spaces around it', () => {
    const result = stripExfil('See(3f2504e0-4f89-11d3-9a0c-0305e82c3301)for detail.');
    expect(result.content).not.toContain('3f2504e0');
  });

  it('leaves a short hex token that is not a UUID alone', () => {
    const result = stripExfil('Commit af00ca1 changed the policy.');
    expect(result.content).toContain('af00ca1');
    expect(result.triggered).toBe(false);
  });
});

describe('stripExfil — combinations and non-matches', () => {
  it('redacts several distinct families in one pass and reports each', () => {
    const result = stripExfil(
      'Mail counsel@example.com, call 212-555-0147, chunk ' +
      '3f2504e0-4f89-11d3-9a0c-0305e82c3301, SSN 123-45-6789, ' +
      'file at /vault-raw/org-1/secret.pdf.',
    );

    expect(result.content).not.toContain('counsel@example.com');
    expect(result.content).not.toContain('212-555-0147');
    expect(result.content).not.toContain('3f2504e0');
    expect(result.content).not.toContain('123-45-6789');
    expect(result.content).not.toContain('/vault-raw/');
    expect(result.labels).toEqual(
      expect.arrayContaining(['email', 'uuid', 'ssn', 'phone', 'vault_raw_path']),
    );
  });

  it('leaves clean prose untouched', () => {
    const clean = 'CPLR 3212 governs summary judgment in New York.';
    const result = stripExfil(clean);

    expect(result.content).toBe(clean);
    expect(result.triggered).toBe(false);
    expect(result.match_count).toBe(0);
    expect(result.labels).toEqual([]);
  });

  it('does not redact a citation year or a section number', () => {
    const result = stripExfil('Enacted in 2019, amended 2024; see section 3212(b).');
    expect(result.triggered).toBe(false);
  });

  it('is order-independent across calls (the /g regexes carry no state)', () => {
    const text = 'Call 212-555-0147 or write counsel@example.com.';
    expect(stripExfil(text)).toEqual(stripExfil(text));
  });
});
