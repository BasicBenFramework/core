/**
 * migrate:unlock command
 * Clears a migration lock left behind by a run that crashed
 */

import { createMigrator } from '../db/migrator.js'
import { green, yellow, red } from '../cli/colors.js'

export async function run(args, flags) {
  try {
    const migrator = await createMigrator()
    const result = await migrator.unlock()

    if (result.cleared) {
      console.log(`\n${green('Cleared the migration lock')} held by ${result.holder.owner} since ${result.holder.acquired_at}.\n`)
    } else {
      console.log(`\n${yellow('No migration lock to clear.')} (On Postgres the lock ends with the connection that held it.)\n`)
    }
  } catch (err) {
    console.error(`\n${red('Unlock failed:')}\n${err.message}\n`)
    process.exit(1)
  }
}
