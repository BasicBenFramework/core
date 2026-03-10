/**
 * Dev command. Starts Vite (port 3000) + Node (port 3001) with --watch.
 *
 * Vite proxies /api/* to Node.
 */

import { bold, cyan, yellow, dim } from '../cli/colors.js'

export async function run(args, flags) {
  console.log(`
${bold('BasicBen')} ${dim('v0.1.0')}

${yellow('⚠')}  ${bold('dev')} command is not yet implemented.

${dim('Coming in Phase 8: Dev Server')}
${dim('- Vite on port 3000')}
${dim('- Node on port 3001 with --watch')}
${dim('- Proxy /api/* to Node')}
`)
}
