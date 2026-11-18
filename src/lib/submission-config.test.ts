import { describe, it, expect } from 'vitest';
import { submissionConfig, turnstileSiteKey, TURNSTILE_TEST_KEYS } from './submission-config';

describe('submissionConfig', () => {
  it('uses Cloudflare test keys and a dev salt outside production', () => {
    expect(submissionConfig({ NODE_ENV: 'development' })).toEqual({
      turnstileSiteKey: TURNSTILE_TEST_KEYS.siteKey,
      turnstileSecret: TURNSTILE_TEST_KEYS.secret,
      ipSalt: 'dev-only-salt',
    });
  });

  it('uses configured values', () => {
    expect(
      submissionConfig({ NODE_ENV: 'production', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 's', TURNSTILE_SECRET_KEY: 'x', IP_HASH_SALT: 'salt' }),
    ).toEqual({ turnstileSiteKey: 's', turnstileSecret: 'x', ipSalt: 'salt' });
  });

  it('refuses to verify submissions in production without the secret or salt', () => {
    expect(() => submissionConfig({ NODE_ENV: 'production' })).toThrow(/TURNSTILE_SECRET_KEY/);
    expect(() => submissionConfig({ NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'x' })).toThrow(/IP_HASH_SALT/);
  });

  it('falls back to the test site key (build time) — a mismatch with the real secret fails closed', () => {
    expect(turnstileSiteKey({ NODE_ENV: 'production' })).toBe(TURNSTILE_TEST_KEYS.siteKey);
    expect(turnstileSiteKey({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'real' })).toBe('real');
  });
});
