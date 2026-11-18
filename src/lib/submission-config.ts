/** Cloudflare's published Turnstile test keys: the widget always passes. Development only. */
export const TURNSTILE_TEST_KEYS = {
  siteKey: '1x00000000000000000000AA',
  secret: '1x0000000000000000000000000000000AA',
};

export type SubmissionConfig = { turnstileSiteKey: string; turnstileSecret: string; ipSalt: string };

type Env = Record<string, string | undefined>;

/**
 * Public widget key, read at build time. Missing → the test key; with a real secret on the
 * server, verification then fails, so a misconfiguration rejects submissions instead of
 * letting bots through.
 */
export function turnstileSiteKey(env: Env = process.env): string {
  return env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || TURNSTILE_TEST_KEYS.siteKey;
}

/**
 * Server-side values, read when a submission arrives (not at build, since `next build` always
 * runs as production). Production must set the secret and the IP hash salt.
 */
export function submissionConfig(env: Env = process.env): SubmissionConfig {
  if (env.NODE_ENV === 'production') {
    if (!env.TURNSTILE_SECRET_KEY) throw new Error('TURNSTILE_SECRET_KEY is required in production');
    if (!env.IP_HASH_SALT) throw new Error('IP_HASH_SALT is required in production');
  }
  return {
    turnstileSiteKey: turnstileSiteKey(env),
    turnstileSecret: env.TURNSTILE_SECRET_KEY || TURNSTILE_TEST_KEYS.secret,
    ipSalt: env.IP_HASH_SALT || 'dev-only-salt',
  };
}
