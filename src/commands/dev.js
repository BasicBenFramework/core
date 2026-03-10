/**
 * dev command
 * Starts Vite dev server (port 3000) and Node API server (port 3001)
 * Vite proxies /api/* requests to Node
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bold, cyan, green, yellow, dim, red } from '../cli/colors.js'

/**
 * Load .env file into process.env
 */
function loadEnv(cwd) {
  const envPath = resolve(cwd, '.env')
  if (!existsSync(envPath)) return

  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [key, ...rest] = trimmed.split('=')
    if (key && rest.length) {
      let value = rest.join('=').trim()
      // Strip inline comments (but not if inside quotes)
      if (!value.startsWith('"') && !value.startsWith("'")) {
        const commentIndex = value.indexOf('#')
        if (commentIndex !== -1) {
          value = value.substring(0, commentIndex).trim()
        }
      }
      process.env[key.trim()] = value
    }
  }
}

export async function run(args, flags) {
  const cwd = process.cwd()

  // Load .env file
  loadEnv(cwd)

  console.log(`\n${bold('BasicBen')} ${dim('dev')}\n`)

  // Check for required files
  const serverEntry = findServerEntry(cwd)
  if (!serverEntry) {
    console.error(`${red('Error:')} No server entry point found.`)
    console.error(`${dim('Expected: src/server/index.js or src/index.js')}\n`)
    process.exit(1)
  }

  const viteConfig = findViteConfig(cwd)

  // Start Node server with --watch
  const nodePort = flags.port || process.env.PORT || 3001
  const nodeProcess = startNodeServer(serverEntry, nodePort, cwd)

  // Start Vite dev server
  const vitePort = flags.vitePort || process.env.VITE_PORT || 3000
  const viteProcess = startViteServer(vitePort, nodePort, viteConfig, cwd)

  // Handle process cleanup
  const cleanup = () => {
    console.log(`\n${dim('Shutting down...')}\n`)
    nodeProcess.kill()
    viteProcess.kill()
    process.exit(0)
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  // Wait for both processes
  nodeProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`${red('Node server exited with code')} ${code}`)
    }
  })

  viteProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`${red('Vite exited with code')} ${code}`)
    }
    cleanup()
  })
}

/**
 * Find server entry point
 */
function findServerEntry(cwd) {
  const candidates = [
    'src/server/index.js',
    'src/server.js',
    'src/index.js',
    'server/index.js',
    'server.js'
  ]

  for (const candidate of candidates) {
    const fullPath = resolve(cwd, candidate)
    if (existsSync(fullPath)) {
      return fullPath
    }
  }

  return null
}

/**
 * Find Vite config
 */
function findViteConfig(cwd) {
  const candidates = [
    'vite.config.js',
    'vite.config.ts',
    'vite.config.mjs'
  ]

  for (const candidate of candidates) {
    const fullPath = resolve(cwd, candidate)
    if (existsSync(fullPath)) {
      return fullPath
    }
  }

  return null
}

/**
 * Start Node server with --watch flag
 */
function startNodeServer(entry, port, cwd) {
  console.log(`${cyan('API')}    ${dim('→')} http://localhost:${port}`)

  const nodeArgs = [
    '--watch',
    '--env-file=.env'
  ]

  // Add .env file if it exists
  if (!existsSync(resolve(cwd, '.env'))) {
    nodeArgs.splice(1, 1) // Remove --env-file if no .env
  }

  nodeArgs.push(entry)

  const proc = spawn('node', nodeArgs, {
    cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: port,
      NODE_ENV: 'development'
    }
  })

  // Prefix output with [API]
  proc.stdout?.on('data', (data) => {
    const lines = data.toString().trim().split('\n')
    for (const line of lines) {
      if (line) console.log(`${dim('[API]')} ${line}`)
    }
  })

  proc.stderr?.on('data', (data) => {
    const lines = data.toString().trim().split('\n')
    for (const line of lines) {
      if (line) console.error(`${dim('[API]')} ${line}`)
    }
  })

  return proc
}

/**
 * Start Vite dev server with proxy config
 */
function startViteServer(port, apiPort, configPath, cwd) {
  console.log(`${green('Vite')}   ${dim('→')} http://localhost:${port}`)
  console.log()

  const viteArgs = [
    'vite',
    '--port', String(port),
    '--strictPort'
  ]

  if (configPath) {
    viteArgs.push('--config', configPath)
  }

  const proc = spawn('npx', viteArgs, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: apiPort,
      NODE_ENV: 'development'
    }
  })

  return proc
}
