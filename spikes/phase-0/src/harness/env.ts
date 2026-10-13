export type Env = Readonly<Record<string, string | undefined>>;

/** The trimmed value of a variable, or undefined when it is unset or blank. */
export function optionalEnv(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value === undefined || value === '' ? undefined : value;
}
