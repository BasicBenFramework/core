/**
 * CLI command: basicben license
 *
 * Manage license key for premium features.
 *
 * Usage:
 *   basicben license set <key>     Set license key
 *   basicben license status        Show license status
 *   basicben license remove        Remove license key
 */

import { bold, green, yellow, red, cyan, dim } from '../cli/colors.js'
import { UpdateManager } from '../updates/index.js'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CONFIG_FILE = '.basicbenrc.json'

export async function run(args, flags) {
  const subcommand = args[0] || 'status'

  switch (subcommand) {
    case 'set':
      await setLicense(args.slice(1), flags)
      break

    case 'status':
      await showStatus(flags)
      break

    case 'remove':
    case 'clear':
      await removeLicense(flags)
      break

    default:
      console.error(`\n${red('Error:')} Unknown subcommand: ${bold(subcommand)}`)
      showHelp()
      process.exit(1)
  }
}

/**
 * Set license key
 */
async function setLicense(args, flags) {
  const key = args[0]

  if (!key) {
    console.error(`\n${red('Error:')} Please provide a license key.`)
    console.error(`\nUsage: ${cyan('basicben license set <key>')}\n`)
    process.exit(1)
  }

  console.log(`\n${bold('Validating license key...')}\n`)

  const updates = new UpdateManager()
  const result = await updates.validateLicense(key)

  if (!result.valid) {
    console.error(`${red('✗')} Invalid license key.\n`)
    process.exit(1)
  }

  // Save to config
  const config = await loadConfig()
  config.license = key
  await saveConfig(config)

  console.log(`${green('✓')} License activated!\n`)
  console.log(`  Plan: ${bold(result.plan)}`)
  console.log(`  Features: ${result.features?.join(', ') || dim('Standard')}`)

  if (result.expiresAt) {
    const expires = new Date(result.expiresAt)
    console.log(`  Expires: ${expires.toLocaleDateString()}`)
  }

  console.log('')
}

/**
 * Show license status
 */
async function showStatus(flags) {
  console.log(`\n${bold('License Status')}\n`)

  const config = await loadConfig()
  const key = config.license || process.env.BASICBEN_LICENSE

  if (!key) {
    console.log(`  ${dim('No license configured.')}\n`)
    console.log(`  Run ${cyan('basicben license set <key>')} to add your license.`)
    console.log(`  Visit ${cyan('https://basicben.com/pricing')} to get a license.\n`)
    return
  }

  console.log(`  Validating...`)

  const updates = new UpdateManager()
  const result = await updates.validateLicense(key)

  if (!result.valid) {
    console.log(`\n  ${red('✗')} License is invalid or expired.\n`)
    return
  }

  console.log(`\n  ${green('✓')} License is valid\n`)
  console.log(`  Key: ${maskKey(key)}`)
  console.log(`  Plan: ${bold(result.plan)}`)
  console.log(`  Features: ${result.features?.join(', ') || dim('Standard')}`)

  if (result.expiresAt) {
    const expires = new Date(result.expiresAt)
    const daysLeft = Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24))

    if (daysLeft < 30) {
      console.log(`  Expires: ${yellow(expires.toLocaleDateString())} ${dim(`(${daysLeft} days left)`)}`)
    } else {
      console.log(`  Expires: ${expires.toLocaleDateString()}`)
    }
  }

  console.log('')

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2))
  }
}

/**
 * Remove license key
 */
async function removeLicense(flags) {
  const config = await loadConfig()

  if (!config.license) {
    console.log(`\n${dim('No license configured.')}\n`)
    return
  }

  if (!flags.yes && !flags.y) {
    const readline = await import('node:readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    const answer = await new Promise(resolve => {
      rl.question(`${yellow('?')} Remove license key? (y/N) `, resolve)
    })
    rl.close()

    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log(`\n${dim('Cancelled.')}\n`)
      return
    }
  }

  delete config.license
  await saveConfig(config)

  console.log(`\n${green('✓')} License removed.\n`)
}

/**
 * Mask license key for display
 */
function maskKey(key) {
  if (key.length <= 8) {
    return '*'.repeat(key.length)
  }
  return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4)
}

/**
 * Load config from .basicbenrc.json
 */
async function loadConfig() {
  try {
    const configPath = join(process.cwd(), CONFIG_FILE)
    const content = await readFile(configPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

/**
 * Save config to .basicbenrc.json
 */
async function saveConfig(config) {
  const configPath = join(process.cwd(), CONFIG_FILE)
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n')
}

/**
 * Show help
 */
function showHelp() {
  console.log(`\nUsage: ${cyan('basicben license <command>')}`)
  console.log(`\nCommands:`)
  console.log(`  ${bold('set')} <key>            Set license key`)
  console.log(`  ${bold('status')}               Show license status`)
  console.log(`  ${bold('remove')}               Remove license key`)
  console.log(`\nOptions:`)
  console.log(`  ${bold('--json')}               Output as JSON`)
  console.log(`  ${bold('-y, --yes')}            Skip confirmation prompts\n`)
}
