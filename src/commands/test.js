/**
 * test command
 * Runs the app's tests with Node's built-in test runner.
 *
 * This used to spawn Vitest, which the framework neither depends on nor
 * installs, so `basicben test` failed in every project that had not happened
 * to add it — the framework's own suite and the template's both use
 * `node --test` already. Node 24 strips TypeScript types itself, so `.test.ts`
 * files run with no extra tooling.
 */

import { spawn } from 'node:child_process'
import { bold, cyan, dim, yellow } from '../cli/colors.js'

/** Where tests are looked for when no files or patterns are given. */
export const DEFAULT_PATTERNS = [
  'tests/**/*.test.js',
  'tests/**/*.test.mjs',
  'tests/**/*.test.ts',
  'src/**/*.test.js',
  'src/**/*.test.mjs',
  'src/**/*.test.ts'
]

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
export function testArgs(args = [], flags = {}) {
  const argv = ['--test']
  const warnings = []

  for (const [name, value] of Object.entries(flags)) {
    if (name === 'watch' || name === 'w') {
      if (value) argv.push('--watch')
      continue
    }

    if (name === 'coverage') {
      if (value) argv.push('--experimental-test-coverage')
      continue
    }

    if (name === 'ui') {
      warnings.push('--ui was a Vitest option; Node\'s test runner has no UI, so it is ignored.')
      continue
    }

    if (name === 'run') continue // Vitest's run-once flag; node --test already runs once.

    const flag = name.length === 1 ? `-${name}` : `--${name}`
    argv.push(value === true ? flag : `${flag}=${value}`)
  }

  argv.push(...(args.length ? args : DEFAULT_PATTERNS))

  return { argv, warnings }
}

export async function run(args, flags) {
  const cwd = process.cwd()

  console.log(`\n${bold('BasicBen')} ${dim('test')}\n`)

  const { argv, warnings } = testArgs(args, flags)
  for (const warning of warnings) console.log(`${yellow(warning)}\n`)

  console.log(`${cyan('Running tests with node --test...')}\n`)

  // The current Node binary, with no shell: nothing here is interpreted by
  // one, so a pattern containing spaces or metacharacters reaches Node intact.
  const proc = spawn(process.execPath, argv, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  })

  proc.on('exit', (code) => {
    process.exit(code || 0)
  })
}
