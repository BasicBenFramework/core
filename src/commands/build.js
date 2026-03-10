/**
 * Build command. Bundles client (Vite) + server for production.
 */

import { bold, yellow, dim } from '../cli/colors.js'

export async function run(args, flags) {
  console.log(`
${bold('BasicBen')} ${dim('v0.1.0')}

${yellow('⚠')}  ${bold('build')} command is not yet implemented.

${dim('Coming in Phase 8: Dev Server')}
${dim('- Vite production build')}
${dim('- Server bundle')}
`)
}
