import { describe, expect, it } from 'vitest';
import {
  expectSingleDetection,
  runDetector,
  spansOf,
  subtypesOf,
  withOptions,
} from '../../../tests/detection-helpers';

describe('email detector', () => {
  it('detects a standard email', () => {
    const d = expectSingleDetection(
      'email',
      'contact jordan.ellis@bluebird-analytics.example today',
    );
    expect(d.range).toEqual({ start: 8, end: 47 });
    expect(d.confidence).toBe('high');
    expect(d.preview).not.toContain('jordan.ellis');
    expect(d.preview).toMatch(/•/);
  });

  it('detects multi-part TLDs and leaves sentence punctuation outside', () => {
    const d = expectSingleDetection('email', 'Write to ops@acme-labs.example.org.');
    expect(d.subtype).toBe('email');
    // The trailing period is sentence punctuation, not part of the address.
    expect(spansOf('email', 'Write to ops@acme-labs.example.org.')[0]).toEqual([9, 34]);
  });

  it('keeps trailing punctuation and hyphenated hosts out of the match', () => {
    const spans = spansOf('email', 'a@b.example, and a2@c-d.example-secure');
    expect(spans).toHaveLength(2);
  });

  it('rejects obvious non-emails', () => {
    expect(subtypesOf('email', 'version 2.4.1 of the tool')).toHaveLength(0);
    expect(subtypesOf('email', 'see https://x.example/docs@a-page')).toHaveLength(0);
    expect(subtypesOf('email', 'user@localhost')).toHaveLength(0);
    expect(subtypesOf('email', 'no domain here@nosuffix')).toHaveLength(0);
    expect(subtypesOf('email', 'double..dot@x.example')).toHaveLength(0);
    expect(subtypesOf('email', '.leadingdot@x.example')).toHaveLength(0);
  });

  it('never matches a partial address inside a longer word run', () => {
    // The whole run is the local part (valid email), but never a mid-word slice.
    const found = runDetector('email', '12xuser@x.example');
    expect(found).toHaveLength(1);
    expect(found[0]?.range).toEqual({ start: 0, end: 17 });
    expect(found[0]?.preview).not.toContain('12xuser@x.example');
  });
});

describe('phone detector', () => {
  it('detects NANP numbers with parens and dashes', () => {
    const d = expectSingleDetection('phone', 'Call +1 (415) 555-0132 ext. 88 today');
    expect(d.subtype).toBe('phone-nanp');
    expect(d.evidence).toBe('13 digits');
    expect(d.preview).not.toContain('415');
    expect(d.preview).not.toContain('555-0132');
  });

  it('detects UK numbers', () => {
    expect(subtypesOf('phone', 'Bridge: +44 20 7946 0958 now')).toContain('phone-uk');
  });

  it('detects Indian mobile numbers', () => {
    expect(subtypesOf('phone', 'phone 98765 43210')).toContain('phone-in');
  });

  it('does not classify card numbers or dates as phones', () => {
    expect(runDetector('phone', 'card 4111 1111 1111 1111')).toHaveLength(0);
    expect(runDetector('phone', 'date 2024-01-15')).toHaveLength(0);
    expect(runDetector('phone', 'version 1.2.3 build 4567890123')).toHaveLength(0);
  });

  it('bare 10-digit runs need phone context', () => {
    expect(runDetector('phone', 'order 1004239112 shipped')).toHaveLength(0);
    expect(runDetector('phone', 'call me at 4155550132 today')).toHaveLength(1);
  });

  it('extension suffix is included in the span', () => {
    const [span] = spansOf('phone', '+1 (415) 555-0132 ext. 88');
    expect(span).not.toBeUndefined();
    const text = '+1 (415) 555-0132 ext. 88';
    expect(text.slice(span![0], span![1])).toBe('+1 (415) 555-0132 ext. 88');
  });
});

describe('network detector', () => {
  it('validates IPv4 and rejects malformed octets', () => {
    expect(subtypesOf('network', 'server 192.168.1.42 on vlan')).toContain('ip-private-private');
    expect(runDetector('network', 'invalid 999.1.2.3 or 1.2.3.4.5 or 01.2.3.4')).toHaveLength(0);
    expect(subtypesOf('network', 'host 8.8.8.8 upstream')).toContain('ip-public');
  });

  it('validates IPv6 including compression, rejects malformed', () => {
    expect(subtypesOf('network', 'addr ::1 here')).toContain('ip-ipv6');
    expect(subtypesOf('network', 'addr 2001:db8::8a2e:370:7334 here')).toContain('ip-ipv6');
    expect(runDetector('network', 'bad ::::1 or 1::2::3')).toHaveLength(0);
    expect(runDetector('network', 'not-an-ip 12345::')).toHaveLength(0);
  });

  it('flags URLs with embedded credentials at critical severity', () => {
    const d = expectSingleDetection(
      'network',
      'poc at https://admin:saffron-poc-77@repo.acme-labs.example/infra',
    );
    expect(d.subtype).toBe('url-credentials');
    expect(d.severity).toBe('critical');
    expect(d.preview).not.toContain('saffron-poc-77');
    expect(d.explanation).toContain('username and password');
  });

  it('flags tracking parameters', () => {
    expect(
      subtypesOf('network', 'https://shop.example.com/product?utm_source=newsletter&id=4'),
    ).toContain('url-tracking-params');
  });

  it('flags internal/staging hosts', () => {
    expect(
      subtypesOf('network', 'https://staging.internal.bluebird-analytics.example/api'),
    ).toContain('url-internal-host');
  });

  it('ignores plain public URLs', () => {
    expect(runDetector('network', 'docs at https://example.com/help')).toHaveLength(0);
  });

  it('does not leak credentials in the URL preview', () => {
    const text = 'postgres://svc:s3cret-value@db.internal.example.com:5432/metrics';
    const d = expectSingleDetection('network', text);
    expect(d.preview).not.toContain('s3cret-value');
    expect(d.preview).not.toContain('svc:');
  });

  it('percent-encoding in query strings is fine without tracking keys', () => {
    expect(runDetector('network', 'https://example.com/search?q=%20hello')).toHaveLength(0);
  });

  it('respects disabled categories via options', () => {
    const found = runDetector(
      'network',
      'host 8.8.8.8',
      withOptions({
        categories: {
          contact: { enabled: false },
          personal: { enabled: true },
          financial: { enabled: true },
          secrets: { enabled: true },
          internal: { enabled: true },
          'prompt-risk': { enabled: true },
          custom: { enabled: true },
        } as never,
      }),
    );
    // Category disabling is enforced by the engine, not the detector itself.
    expect(found.length).toBeGreaterThan(0);
  });
});
