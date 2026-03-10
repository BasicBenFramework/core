#!/usr/bin/env node

/**
 * create-basicben-app
 *
 * Scaffolds a new BasicBen project with the recommended structure.
 *
 * Usage:
 *   npx create-basicben-app my-app
 *   npx create-basicben-app my-app --template minimal
 */

import { mkdirSync, writeFileSync, copyFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frameworkDir = resolve(__dirname, '..')

// ANSI colors
const bold = (s) => `\x1b[1m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const cyan = (s) => `\x1b[36m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2)

  // Show help
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp()
    process.exit(0)
  }

  // Get project name
  const projectName = args[0]

  if (!projectName || projectName.startsWith('-')) {
    console.error(`\n${red('Error:')} Please provide a project name.\n`)
    console.log(`  ${cyan('npx create-basicben-app')} ${dim('<project-name>')}\n`)
    process.exit(1)
  }

  // Validate project name
  if (!/^[a-z0-9-_]+$/i.test(projectName)) {
    console.error(`\n${red('Error:')} Project name can only contain letters, numbers, dashes, and underscores.\n`)
    process.exit(1)
  }

  // Check for --local flag
  const useLocal = args.includes('--local')

  const projectDir = resolve(process.cwd(), projectName)

  // Check if directory exists
  if (existsSync(projectDir)) {
    console.error(`\n${red('Error:')} Directory "${projectName}" already exists.\n`)
    process.exit(1)
  }

  console.log()
  console.log(`${bold('Creating a new BasicBen app')} in ${cyan(projectDir)}`)
  console.log()

  // Create project directory
  mkdirSync(projectDir, { recursive: true })

  // Copy template files
  const templateDir = join(__dirname, 'template')
  copyDir(templateDir, projectDir)

  // Determine basicben dependency
  let basicbenDep = 'latest'
  if (useLocal) {
    const relativePath = relative(projectDir, frameworkDir)
    basicbenDep = `file:${relativePath}`
    console.log(`${yellow('Using local framework:')} ${relativePath}\n`)
  }

  // Create package.json with project name
  const pkg = {
    name: projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'basicben dev',
      build: 'basicben build',
      start: 'basicben start',
      test: 'basicben test',
      migrate: 'basicben migrate',
      'migrate:rollback': 'basicben migrate:rollback',
      'migrate:fresh': 'basicben migrate:fresh',
      'migrate:status': 'basicben migrate:status',
      'make:migration': 'basicben make:migration',
      'make:controller': 'basicben make:controller',
      'make:model': 'basicben make:model'
    },
    dependencies: {
      '@basicbenframework/core': basicbenDep,
      react: '^18.2.0',
      'react-dom': '^18.2.0'
    },
    devDependencies: {
      '@vitejs/plugin-react': '^4.2.0',
      vite: '^5.0.0',
      vitest: '^1.0.0'
    }
  }

  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify(pkg, null, 2) + '\n'
  )

  // Generate APP_KEY for .env
  const appKey = generateAppKey()
  const envContent = `# Application
APP_KEY=${appKey}

# Server Ports
PORT=3001              # API server
VITE_PORT=3000         # Frontend dev server

# Database (uncomment one)
# DATABASE_URL=./data.db
# DATABASE_URL=postgres://user:pass@localhost:5432/mydb
`
  writeFileSync(join(projectDir, '.env'), envContent)

  console.log(`${green('✓')} Project created successfully!\n`)

  // Install dependencies prompt
  console.log(`${bold('Next steps:')}\n`)
  console.log(`  ${cyan('cd')} ${projectName}`)
  console.log(`  ${cyan('npm install')}`)
  console.log(`  ${cyan('npm run dev')}\n`)

  console.log(`${dim('This will start the development server at http://localhost:3000')}\n`)
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
${bold('create-basicben-app')} - Create a new BasicBen project

${bold('Usage:')}
  npx create-basicben-app ${dim('<project-name>')} [options]

${bold('Options:')}
  --local        Use local framework (for development)
  -h, --help     Show this help message

${bold('Examples:')}
  npx create-basicben-app my-app
  npx create-basicben-app my-app --local   ${dim('# Use local framework')}
`)
}

/**
 * Copy directory recursively
 */
function copyDir(src, dest) {
  if (!existsSync(src)) return

  mkdirSync(dest, { recursive: true })
  const entries = readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * Generate a random APP_KEY
 */
function generateAppKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let key = ''
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return key
}

// Run
main().catch((err) => {
  console.error(`\n${red('Error:')} ${err.message}\n`)
  process.exit(1)
})
