/**
 * build command
 * Builds the client (Vite) and prepares server for production
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { bold, cyan, green, yellow, dim, red } from '../cli/colors.js'

export async function run(args, flags) {
  const cwd = process.cwd()

  console.log(`\n${bold('BasicBen')} ${dim('build')}\n`)

  // Build client with Vite
  console.log(`${cyan('Building client...')}\n`)

  const viteBuild = await runViteBuild(cwd)
  if (!viteBuild.success) {
    console.error(`\n${red('Client build failed')}\n`)
    process.exit(1)
  }

  console.log(`\n${green('✓')} Client built to ${dim('dist/client')}\n`)

  // Copy server files to dist
  console.log(`${cyan('Preparing server...')}\n`)

  await prepareServer(cwd)

  console.log(`${green('✓')} Server prepared in ${dim('dist/server')}\n`)

  // Summary
  console.log(`${green('Build complete!')}\n`)
  console.log(`Run ${cyan('basicben start')} to start the production server.\n`)
}

/**
 * Run Vite build
 */
function runViteBuild(cwd) {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['vite', 'build'], {
      cwd,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production'
      }
    })

    proc.on('exit', (code) => {
      resolve({ success: code === 0 })
    })

    proc.on('error', () => {
      resolve({ success: false })
    })
  })
}

/**
 * Prepare server files for production
 */
async function prepareServer(cwd) {
  const distServer = resolve(cwd, 'dist/server')

  // Create dist/server directory
  if (!existsSync(distServer)) {
    mkdirSync(distServer, { recursive: true })
  }

  // Copy server source files
  const serverDirs = ['src/server', 'src/routes', 'src/controllers', 'src/models', 'src/middleware']

  for (const dir of serverDirs) {
    const srcDir = resolve(cwd, dir)
    if (existsSync(srcDir)) {
      const destDir = resolve(distServer, dir.replace('src/', ''))
      copyDir(srcDir, destDir)
    }
  }

  // Copy package.json for production dependencies
  const pkgSrc = resolve(cwd, 'package.json')
  if (existsSync(pkgSrc)) {
    copyFileSync(pkgSrc, resolve(distServer, 'package.json'))
  }

  // Create production server entry
  const serverEntry = `
import { createServer } from './server/index.js'
import { serveStatic } from './server/static.js'

const app = await createServer({
  static: { dir: '../client' }
})

const port = process.env.PORT || 3000

app.listen(port, () => {
  console.log(\`Server running at http://localhost:\${port}\`)
})
`.trim()

  const { writeFileSync } = await import('node:fs')
  writeFileSync(resolve(distServer, 'index.js'), serverEntry)
}

/**
 * Recursively copy directory
 */
function copyDir(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true })
  }

  const entries = readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      copyFileSync(srcPath, destPath)
    }
  }
}
