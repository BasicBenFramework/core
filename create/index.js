#!/usr/bin/env node

/**
 * @basicbenframework/create
 *
 * Creates a new site running the BasicBen CMS.
 *
 * Usage:
 *   npx @basicbenframework/create my-site
 *   npx @basicbenframework/create my-site --headless
 *
 * A site installs the CMS as a package, @basicbenframework/cms, and holds only
 * its own config and deploy files. Those come from the CMS repository's site/
 * template, taken at the tag of the latest published CMS, so the template and
 * the package it installs are always the same release.
 *
 * ## Why this downloads instead of bundling
 *
 * It used to ship a copy of the CMS inside the package, written at publish
 * time. That copy went stale the moment the CMS changed, and staleness here is
 * not a missing feature — the published 0.5.0 scaffolder handed people a CMS
 * that threw a TypeError on any post with a featured image, long after the
 * repository had fixed it. A snapshot released on a different cadence from the
 * thing it snapshots will always drift; the only question is how far.
 *
 * So there is no copy. This fetches the repository at run time, which cannot be
 * stale by construction, and removes the bundling step, the second release and
 * the second place for the CMS to exist.
 *
 * The cost is that creating a project needs network access and GitHub to be
 * reachable — already true of the `npm install` that follows it.
 */

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, renameSync, readdirSync, cpSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'

const REPO = 'BasicBenFramework/basicben'
const PACKAGE = '@basicbenframework/cms'
const REGISTRY = process.env.npm_config_registry?.replace(/\/$/, '') || 'https://registry.npmjs.org'

/**
 * For testing an unreleased CMS: a local checkout instead of the download,
 * and the version to write into the site. Not for everyday use.
 */
const LOCAL_SOURCE = process.env.CREATE_BASICBEN_SOURCE
const LOCAL_VERSION = process.env.CREATE_BASICBEN_CMS_VERSION

const bold = (s) => `\x1b[1m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const cyan = (s) => `\x1b[36m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp()
    process.exit(0)
  }

  const projectName = args[0]

  if (!projectName || projectName.startsWith('-')) {
    console.error(`\n${red('Error:')} Please provide a project name.\n`)
    console.log(`  ${cyan('npx @basicbenframework/create')} ${dim('<project-name>')}\n`)
    process.exit(1)
  }

  if (!/^[a-z0-9-_]+$/i.test(projectName)) {
    console.error(`\n${red('Error:')} Project name can only contain letters, numbers, dashes, and underscores.\n`)
    process.exit(1)
  }

  const headless = args.includes('--headless')

  // A branch, tag or commit to take the template from. By default the tag of
  // the latest published CMS, which is the package the site will install.
  const refFlag = args.indexOf('--ref')
  const givenRef = refFlag === -1 ? null : args[refFlag + 1]

  if (refFlag !== -1 && (!givenRef || givenRef.startsWith('-'))) {
    console.error(`\n${red('Error:')} --ref needs a branch, tag or commit.\n`)
    process.exit(1)
  }

  const projectDir = resolve(process.cwd(), projectName)

  if (existsSync(projectDir)) {
    console.error(`\n${red('Error:')} Directory "${projectName}" already exists.\n`)
    process.exit(1)
  }

  let version
  try {
    version = LOCAL_VERSION || (await latestVersion())
  } catch (error) {
    console.error(`\n${red('Error:')} ${error.message}\n`)
    process.exit(1)
  }
  const ref = givenRef ?? `v${version}`

  console.log()
  console.log(`${bold('Creating a new BasicBen site')} in ${cyan(projectDir)}`)
  console.log(dim(`${PACKAGE}@${version}, template from ${LOCAL_SOURCE ?? `${REPO}@${ref}`}${headless ? ', headless' : ''}`))
  console.log()

  const work = join(tmpdir(), `basicben-create-${randomBytes(6).toString('hex')}`)
  mkdirSync(work, { recursive: true })

  try {
    const source = LOCAL_SOURCE ? resolve(LOCAL_SOURCE) : await download(ref, work)
    place(source, projectDir, ref)
    configure(projectDir, projectName, version)
    if (headless) makeHeadless(projectDir)
  } catch (error) {
    // A half-written directory is worse than none: the next attempt would
    // refuse to run because the path already exists.
    rmSync(projectDir, { recursive: true, force: true })
    console.error(`\n${red('Error:')} ${error.message}\n`)
    process.exit(1)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }

  console.log(`${green('✓')} Project created successfully!`)
  console.log()
  console.log(bold('Next steps:'))
  console.log()
  console.log(`  ${cyan('cd')} ${projectName}`)
  console.log(`  ${cyan('npm install')}`)
  console.log(`  ${cyan('npm run migrate')}`)
  console.log(`  ${cyan('npm run dev')}`)
  console.log()
  console.log(dim('The first account you register becomes the admin.'))
  console.log(dim(`Update the CMS later with: npm install ${PACKAGE}@latest && npm run migrate`))
  console.log()
}

/** The latest published version of the CMS package. */
async function latestVersion() {
  let response
  try {
    response = await fetch(`${REGISTRY}/${PACKAGE.replace('/', '%2f')}/latest`)
  } catch (error) {
    throw new Error(`Could not reach the npm registry — ${error.message}`)
  }
  if (response.status === 404) throw new Error(`${PACKAGE} is not published yet.`)
  if (!response.ok) throw new Error(`The npm registry returned ${response.status} for ${PACKAGE}.`)
  const { version } = await response.json()
  if (!version) throw new Error(`The npm registry gave no version for ${PACKAGE}.`)
  return version
}

/** Fetch and unpack the repository at `ref`. Returns where it is. */
async function download(ref, work) {
  const url = `https://codeload.github.com/${REPO}/tar.gz/${encodeURIComponent(ref)}`

  let response

  try {
    response = await fetch(url, { redirect: 'follow' })
  } catch (error) {
    throw new Error(`Could not reach GitHub — ${error.message}`)
  }

  if (!response.ok) {
    throw response.status === 404
      ? new Error(`No branch, tag or commit named "${ref}" in ${REPO}.`)
      : new Error(`Could not download ${REPO}@${ref} — GitHub returned ${response.status}.`)
  }

  const archive = join(work, 'cms.tar.gz')
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()))

  const unpacked = join(work, 'src')
  mkdirSync(unpacked, { recursive: true })

  // GitHub nests everything under `owner-repo-sha/`, hence the strip. `tar` is
  // present on macOS, Linux and Windows 10+ — a weaker assumption than the one
  // npm itself makes.
  try {
    execFileSync('tar', ['-xzf', archive, '-C', unpacked, '--strip-components=1'], { stdio: 'pipe' })
  } catch {
    throw new Error('Could not unpack the download — is `tar` on your PATH?')
  }

  return unpacked
}

/** Copy the repository's site/ template into place. */
function place(source, projectDir, ref) {
  const template = join(source, 'site')

  // Releases before the CMS was a package have no template: they were the
  // whole repository, copied. That route is a fork now.
  if (!existsSync(join(template, 'package.json'))) {
    throw new Error(
      `${REPO}@${ref} has no site/ template: it is from before the CMS was a package. ` +
        `For your own copy of the CMS, fork the repository instead.`
    )
  }

  mkdirSync(projectDir, { recursive: true })

  for (const entry of readdirSync(template)) {
    // A local checkout's template may have been run in place.
    if (['node_modules', 'dist', '.env'].includes(entry) || /\.(db|sqlite)(-.*)?$/.test(entry)) continue
    cpSync(join(template, entry), join(projectDir, entry), { recursive: true })
  }

  // The repository carries this undotted because npm strips dotfiles from
  // published packages. Nothing strips anything here, but the name still has to
  // be corrected for git to honour it.
  const undotted = join(projectDir, 'gitignore')

  if (existsSync(undotted)) renameSync(undotted, join(projectDir, '.gitignore'))
}

/** Name the site, pin its CMS, and give it an environment it can start with. */
function configure(projectDir, projectName, version) {
  const pkgPath = join(projectDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

  // The template's own package.json, renamed — not rebuilt from a list here.
  // In the repository it installs the CMS from the checkout (file:..); a site
  // installs the release its template came from.
  pkg.name = projectName
  pkg.version = '0.1.0'
  pkg.private = true
  delete pkg.description
  pkg.dependencies = { ...pkg.dependencies, [PACKAGE]: `^${version}` }

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  // Likewise the environment: .env.example is the documented one, so the only
  // thing added is the key, which has to be generated per project.
  const examplePath = join(projectDir, '.env.example')
  const example = existsSync(examplePath) ? readFileSync(examplePath, 'utf-8') : 'APP_KEY=\n'

  writeFileSync(
    join(projectDir, '.env'),
    example.replace(/^APP_KEY=.*$/m, `APP_KEY=${randomBytes(32).toString('hex')}`)
  )
}

/**
 * The API and admin only, with no public theme: the headless Vercel file,
 * and `theme` off. A front end elsewhere reads the content API.
 */
function makeHeadless(projectDir) {
  const headless = join(projectDir, 'vercel.headless.json')
  if (existsSync(headless)) renameSync(headless, join(projectDir, 'vercel.json'))

  const configPath = join(projectDir, 'basicben.config.js')
  const config = readFileSync(configPath, 'utf-8')
  const next = config.replace(/^(\s*features: \[)([^\]]*)\]/m, (_, start, list) => {
    const names = list.split(',').map((name) => name.trim()).filter((name) => name && name !== "'theme'")
    return `${start}${names.join(', ')}]`
  })
  if (next === config) throw new Error('Could not turn the theme off: no features list in basicben.config.js.')
  writeFileSync(configPath, next)
}

function showHelp() {
  console.log(`
${bold('create-basicben')} — start a project from the BasicBen CMS

${bold('Usage')}
  ${cyan('npx @basicbenframework/create')} ${dim('<site-name>')}

${bold('Options')}
  ${dim('--headless')}    API and admin only: no public theme, headless vercel.json
  ${dim('--ref <ref>')}   branch, tag or commit to take the template from
                (default: the latest published CMS's tag)
  ${dim('--help')}        show this

${bold('What you get')}
  A site running ${PACKAGE}: posts, pages, media, an admin UI and a
  headless content API. The site holds its config and deploy files; the CMS
  is a dependency, so updating it is ${cyan(`npm install ${PACKAGE}@latest`)}.

  ${yellow('To change the CMS itself')}, fork it instead:

    ${cyan(`git clone https://github.com/${REPO}.git`)}
`)
}

main()
