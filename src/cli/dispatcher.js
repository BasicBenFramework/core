/**
 * Command dispatcher. Maps command names to handlers.
 */

import { bold, red, cyan, yellow, dim } from './colors.js'

// Command registry
const commands = {
  // Development
  dev: () => import('../commands/dev.js'),
  build: () => import('../commands/build.js'),
  start: () => import('../commands/start.js'),
  test: () => import('../commands/test.js'),

  // Scaffolding
  'make:controller': () => import('../commands/make-controller.js'),
  'make:model': () => import('../commands/make-model.js'),
  'make:route': () => import('../commands/make-route.js'),
  'make:migration': () => import('../commands/make-migration.js'),
  'make:middleware': () => import('../commands/make-middleware.js'),

  // Database
  migrate: () => import('../commands/migrate.js'),
  'migrate:rollback': () => import('../commands/migrate-rollback.js'),
  'migrate:fresh': () => import('../commands/migrate-fresh.js'),
  'migrate:status': () => import('../commands/migrate-status.js'),
  'migrate:make': () => import('../commands/make-migration.js'), // alias

  // Help
  help: () => import('../commands/help.js')
}

// Command metadata for help display
export const commandMeta = {
  dev: { description: 'Start development server', usage: 'basicben dev' },
  build: { description: 'Build for production', usage: 'basicben build' },
  start: { description: 'Start production server', usage: 'basicben start' },
  test: { description: 'Run tests with Vitest', usage: 'basicben test' },

  'make:controller': {
    description: 'Generate a controller',
    usage: 'basicben make:controller <Name>'
  },
  'make:model': {
    description: 'Generate a model',
    usage: 'basicben make:model <Name>'
  },
  'make:route': {
    description: 'Generate a route file',
    usage: 'basicben make:route <name>'
  },
  'make:migration': {
    description: 'Generate a migration file',
    usage: 'basicben make:migration <name>'
  },
  'make:middleware': {
    description: 'Generate middleware',
    usage: 'basicben make:middleware <name>'
  },

  migrate: { description: 'Run pending migrations', usage: 'basicben migrate' },
  'migrate:rollback': {
    description: 'Roll back last migration batch',
    usage: 'basicben migrate:rollback'
  },
  'migrate:fresh': {
    description: 'Drop all tables and re-run migrations',
    usage: 'basicben migrate:fresh'
  },
  'migrate:status': {
    description: 'Show migration status',
    usage: 'basicben migrate:status'
  },

  help: { description: 'Show help', usage: 'basicben help [command]' }
}

export async function dispatch(command, args, flags) {
  // Version flag (check first)
  if (flags.version || flags.v) {
    const pkg = await import('../../package.json', { with: { type: 'json' } })
    console.log(pkg.default.version)
    return
  }

  // No command or help flag
  if (!command || flags.help || flags.h) {
    const helpModule = await commands.help()
    return helpModule.run(args, flags)
  }

  // Look up command
  const loader = commands[command]

  if (!loader) {
    console.error(`\n${red('Error:')} Unknown command ${bold(command)}`)
    console.error(`\nRun ${cyan('basicben help')} to see available commands.\n`)
    process.exit(1)
  }

  try {
    const module = await loader()
    await module.run(args, flags)
  } catch (err) {
    // Handle module not found (command not implemented yet)
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      console.error(`\n${yellow('Not implemented:')} ${bold(command)}`)
      console.error(`${dim('This command is coming soon.')}\n`)
      process.exit(1)
    }

    // Re-throw other errors
    throw err
  }
}
