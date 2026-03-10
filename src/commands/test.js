/**
 * Test command. Runs Vitest for user apps.
 */

import { bold, yellow, dim } from '../cli/colors.js'

export async function run(args, flags) {
  console.log(`
${bold('BasicBen')} ${dim('v0.1.0')}

${yellow('⚠')}  ${bold('test')} command is not yet implemented.

${dim('Will run Vitest for user app tests.')}
`)
}
