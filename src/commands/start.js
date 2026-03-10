/**
 * Start command. Runs production server.
 */

import { bold, yellow, dim } from '../cli/colors.js'

export async function run(args, flags) {
  console.log(`
${bold('BasicBen')} ${dim('v0.1.0')}

${yellow('⚠')}  ${bold('start')} command is not yet implemented.

${dim('Coming in Phase 8: Dev Server')}
${dim('- Serve built client')}
${dim('- Run production Node server')}
`)
}
