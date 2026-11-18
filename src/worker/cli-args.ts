export type CliArgs = { command: string | undefined; sourceKey: string; now: Date };

/** `<command> [sourceKey] [--now ISO]`; --now may appear anywhere. */
export function parseCliArgs(argv: string[]): CliArgs {
  const rest = [...argv];
  let now = new Date();
  const i = rest.indexOf('--now');
  if (i >= 0) {
    now = new Date(rest[i + 1] ?? '');
    if (Number.isNaN(now.getTime())) throw new Error(`invalid --now: ${rest[i + 1]}`);
    rest.splice(i, 2);
  }
  const [command, sourceKey = 'fixture'] = rest;
  return { command, sourceKey, now };
}
