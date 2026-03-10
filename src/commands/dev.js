/**
 * dev command
 * Starts Vite dev server (port 3000) and Node API server (port 3001)
 * Vite proxies /api/* requests to Node
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { bold, cyan, green, yellow, dim, red } from '../cli/colors.js'

export async function run(args, flags) {
  const cwd = process.cwd()

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
  const nodePort = flags.nodePort || process.env.API_PORT || 3001
  const nodeProcess = startNodeServer(serverEntry, nodePort, cwd)

  // Start Vite dev server
  const vitePort = flags.port || process.env.PORT || 3000
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
      VITE_API_PORT: apiPort,
      NODE_ENV: 'development'
    }
  })

  return proc
}
