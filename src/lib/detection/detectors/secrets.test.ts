import { describe, expect, it } from 'vitest';
import { expectSingleDetection, runDetector, subtypesOf } from '../../../tests/detection-helpers';

describe('secrets detector', () => {
  it('detects AWS access keys via documented format', () => {
    const d = expectSingleDetection('secrets', 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE');
    expect(d.subtype).toBe('aws-access-key');
    expect(d.severity).toBe('critical');
    expect(d.confidence).toBe('high');
    // Preview may show the structural prefix but never the rest of the key.
    expect(d.preview.startsWith('AKIA')).toBe(true);
    expect(d.preview).not.toContain('IOSFODNN7');
  });

  it('detects GitHub tokens', () => {
    expect(subtypesOf('secrets', 'token ghp_0123456789abcdefABCDEF0123456789abcd')).toContain(
      'github-token',
    );
  });

  it('detects Slack tokens', () => {
    expect(subtypesOf('secrets', 'xoxb-123456789012-abcdef')).toContain('slack-token');
  });

  it('detects Stripe live secret keys', () => {
    expect(subtypesOf('secrets', 'sk_live_0123456789abcdef012345')).toContain('stripe-secret');
    expect(subtypesOf('secrets', 'whsec_0123456789abcdef01234567')).toContain('stripe-webhook');
    expect(subtypesOf('secrets', 'pk_live_0123456789abcdef')).toContain('stripe-publishable');
  });

  it('detects Google API keys', () => {
    expect(subtypesOf('secrets', 'AIza0123456789abcdefghijklmnopqrstuvwxq')).toContain(
      'google-api-key',
    );
  });

  it('detects JWT structure', () => {
    const d = expectSingleDetection(
      'secrets',
      'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZXJ2aWNlLTAxIn0.abcdef0123456789abcdef',
    );
    expect(d.subtype).toBe('jwt');
    expect(d.severity).toBe('critical');
    expect(d.confidence).toBe('high');
  });

  it('detects Bearer tokens', () => {
    const d = expectSingleDetection('secrets', 'Authorization: Bearer abcdef1234567890abcdef');
    expect(d.subtype).toBe('bearer-token');
  });

  it('requires provider-shape precision — partial prefixes do not fire', () => {
    expect(runDetector('secrets', 'AKIa short prefix')).toHaveLength(0);
    expect(runDetector('secrets', 'ghp_short')).toHaveLength(0);
    expect(runDetector('secrets', 'xoxb-1')).toHaveLength(0);
  });

  it('high-entropy candidate needs secret context nearby', () => {
    const token = '8f3a91be42d9c0e5a6b8d4e2f1c3b9a7ddc2';
    expect(runDetector('secrets', `value ${token} end`)).toHaveLength(0);
    const withCtx = runDetector('secrets', `api_key = ${token} (from vault)`);
    expect(withCtx.length).toBeGreaterThan(0);
    expect(withCtx[0]?.subtype).toBe('high-entropy-candidate');
  });
});

describe('credentials detector', () => {
  it('detects explicitly labeled passwords', () => {
    const d = expectSingleDetection('credentials', 'login with password=hunter2fake ok');
    expect(d.subtype).toBe('labeled-password');
    expect(d.severity).toBe('critical');
    expect(d.confidence).toBe('high');
    expect(d.preview).not.toContain('hunter2fake');
    expect(d.preview).toMatch(/^password/i);
  });

  it('does not flag ordinary text without a password label', () => {
    expect(runDetector('credentials', 'the password policy requires 12 chars')).toHaveLength(0);
    // "password is X" IS an explicit label — the word after it is a candidate value.
    const found = runDetector('credentials', 'my password is strong');
    expect(found[0]?.subtype).toBe('labeled-password');
  });

  it('detects PEM private key blocks across lines', () => {
    const pem = [
      '-----BEGIN PRIVATE KEY-----',
      'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7Example',
      '0123456789abcdefghijklmnopqrstuvwxyz0123456789abcdefghijk',
      '-----END PRIVATE KEY-----',
    ].join('\n');
    const d = expectSingleDetection('credentials', `text\n${pem}\nmore text`);
    expect(d.subtype).toBe('private-key-block');
    expect(d.severity).toBe('critical');
    expect(d.preview).not.toContain('MIIEvQ');
    // Multiline boundary: match spans exactly the key block.
    expect(d.range.start).toBe(5);
  });

  it('warns on a truncated private key header', () => {
    const found = runDetector('credentials', 'pasted -----BEGIN RSA PRIVATE KEY----- only');
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.subtype).toBe('private-key-header');
  });

  it('does not flag public key headers', () => {
    expect(
      runDetector('credentials', '-----BEGIN PUBLIC KEY-----MIIB\n-----END PUBLIC KEY-----'),
    ).toHaveLength(0);
  });

  it('detects database connection strings and masks credentials', () => {
    const d = expectSingleDetection(
      'credentials',
      'connect postgres://svc_reports:synthetic-pw-9f3@db.internal.example.com:5432/metrics',
    );
    expect(d.subtype).toBe('db-connection-string');
    expect(d.severity).toBe('critical');
    expect(d.preview).not.toContain('synthetic-pw-9f3');
    expect(d.evidence).toContain('password');
  });

  it('detects credential environment variables', () => {
    const d = expectSingleDetection(
      'credentials',
      'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI_K7MDENG_key',
    );
    expect(d.subtype).toBe('env-credential');
    expect(d.severity).toBe('high');
  });

  it('ignores non-credential environment variables', () => {
    expect(runDetector('credentials', 'DEBUG=true\nLOG_LEVEL=info')).toHaveLength(0);
    expect(runDetector('credentials', 'PUBLIC_URL=https://example.com')).toHaveLength(0);
  });

  it('detects recovery codes', () => {
    const d = expectSingleDetection('credentials', 'recovery code 4F9K-2QX7-PLD8 ready');
    expect(d.subtype).toBe('recovery-code');
    expect(d.severity).toBe('high');
  });

  it('skips env values that are references, not literals', () => {
    expect(runDetector('credentials', 'API_KEY=${VAULT_KEY}')).toHaveLength(0);
  });
});
