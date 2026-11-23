/**
 * Build the arguments for `node --test`.
 *
 * Positional arguments are files or glob patterns and replace the defaults.
 * `--watch`/`-w` and `--coverage` map to Node's own flags; any other flag is
 * passed through, so `--test-name-pattern=login` and friends work as they do
 * with `node --test` directly.
 *
 * @param {string[]} args - positional arguments
 * @param {Object<string, string|boolean>} flags - parsed flags
 * @returns {{ argv: string[], warnings: string[] }}
 */
export function testArgs(args?: string[], flags?: {
    [x: string]: string | boolean;
}): {
    argv: string[];
    warnings: string[];
};
export function run(args: any, flags: any): Promise<void>;
/** Where tests are looked for when no files or patterns are given. */
export const DEFAULT_PATTERNS: string[];
