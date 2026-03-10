/**
 * test command
 * Runs Vitest for user app tests
 */

import { spawn } from 'node:child_process'
import { bold, cyan, dim } from '../cli/colors.js'

export async function run(args, flags) {
  const cwd = process.cwd()

  console.log(`\n${bold('BasicBen')} ${dim('test')}\n`)

  // Build vitest args
  const vitestArgs = ['vitest', ...args]

  // Add common flags
  if (flags.watch || flags.w) {
    // Default is watch mode, no flag needed
  } else if (!args.includes('--watch')) {
    vitestArgs.push('--run') // Run once and exit
  }

  if (flags.coverage) {
    vitestArgs.push('--coverage')
  }

  if (flags.ui) {
    vitestArgs.push('--ui')
  }

  console.log(`${cyan('Running tests with Vitest...')}\n`)

  const proc = spawn('npx', vitestArgs, {
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
