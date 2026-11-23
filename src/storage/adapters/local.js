/**
 * Filesystem storage.
 *
 * The development driver. It implements the same interface as the S3 adapter so
 * a project runs with no cloud credentials until it deploys, and switching is a
 * config change rather than a code change.
 *
 * `signedUrl` returns a URL carrying an HMAC of the key, method and expiry.
 * That is not decoration: without it the local path would accept any upload to
 * any key, and the two drivers would differ in whether an upload URL means
 * anything — which is exactly the sort of difference that is discovered in
 * production.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, writeFile, readFile, unlink, stat, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve, sep } from 'node:path'
import { appKey } from '../../server/app-key.js'

/**
 * @param {Object} config
 * @param {string} [config.dir] - where files are written
 * @param {string} [config.baseUrl] - URL prefix the files are served under
 * @param {string} [config.secret] - HMAC key for signed URLs
 * @returns {Object} storage adapter
 */
export function createLocalAdapter(config = {}) {
  const root = resolve(process.cwd(), config.dir || 'public/uploads')
  const baseUrl = (config.baseUrl || '/uploads').replace(/\/$/, '')
  // No literal fallback: a default key that ships in the package is a key
  // every deployment shares. See server/app-key.js.
  const secret = config.secret || appKey('local storage URLs')

  /**
   * Resolve a key to a path inside the storage root.
   *
   * A key arriving from a request can contain `..`, and joining it blindly
   * writes wherever the attacker likes. The resolved path is checked to be
   * inside the root, which is the only reliable way to enforce that.
   */
  const pathFor = (key) => {
    const cleaned = String(key).replace(/^\/+/, '')
    const full = resolve(root, cleaned)

    if (full !== root && !full.startsWith(root + sep)) {
      const error = new Error(`Refusing to access "${key}", which resolves outside the storage directory`)
      error.status = 400
      throw error
    }

    return full
  }

  // The content type is part of the signed material when one was given, so a
  // URL issued for an image/png PUT refuses a body declared as anything else —
  // the same guarantee the S3 driver gets from SigV4 signing Content-Type. URLs
  // signed without a type keep the original three-line material, so they still
  // verify.
  const sign = (key, method, expires, contentType = '') => {
    const material = contentType
      ? `${method}\n${key}\n${expires}\n${contentType}`
      : `${method}\n${key}\n${expires}`
    return createHmac('sha256', secret).update(material).digest('hex')
  }

  return {
    driver: 'local',
    root,

    async put(key, body, options = {}) {
      const path = pathFor(key)
      await mkdir(dirname(path), { recursive: true })

      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body ?? '')
      await writeFile(path, buffer)

      // Content type is not stored — the filesystem has nowhere to put it — so
      // it is inferred from the extension on the way back out.
      return {
        key,
        etag: createHmac('sha256', secret).update(buffer).digest('hex').slice(0, 32),
        size: buffer.length
      }
    },

    async get(key) {
      const path = pathFor(key)

      if (!existsSync(path)) {
        const error = new Error(`No such object: ${key}`)
        error.status = 404
        throw error
      }

      const body = await readFile(path)

      return {
        body,
        contentType: contentTypeFor(key),
        size: body.length,
        etag: createHmac('sha256', secret).update(body).digest('hex').slice(0, 32)
      }
    },

    async head(key) {
      const path = pathFor(key)
      if (!existsSync(path)) return null

      const info = await stat(path)

      return {
        size: info.size,
        contentType: contentTypeFor(key),
        etag: `${info.size}-${info.mtimeMs}`,
        lastModified: info.mtime.toUTCString()
      }
    },

    async exists(key) {
      return existsSync(pathFor(key))
    },

    async delete(key) {
      const path = pathFor(key)
      if (!existsSync(path)) return

      await unlink(path)
    },

    async list({ prefix = '', limit = 1000 } = {}) {
      const items = []

      const walk = async (dir, relative) => {
        if (items.length >= limit) return
        if (!existsSync(dir)) return

        for (const entry of await readdir(dir, { withFileTypes: true })) {
          if (items.length >= limit) return

          const key = relative ? `${relative}/${entry.name}` : entry.name

          if (entry.isDirectory()) {
            await walk(join(dir, entry.name), key)
            continue
          }

          if (prefix && !key.startsWith(prefix)) continue

          const info = await stat(join(dir, entry.name))
          items.push({
            key,
            size: info.size,
            etag: `${info.size}-${info.mtimeMs}`,
            lastModified: info.mtime.toISOString()
          })
        }
      }

      await walk(root, '')

      // Sorted so paging is stable; the filesystem makes no such promise.
      items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

      return { items: items.slice(0, limit), cursor: null }
    },

    /**
     * A URL carrying an expiry and a signature over it.
     *
     * @param {string} key
     * @param {Object} [options]
     * @param {string} [options.method]
     * @param {number} [options.expiresIn] - seconds
     * @param {string} [options.contentType] - when given, the PUT must declare exactly this type
     * @returns {string}
     */
    signedUrl(key, { method = 'GET', expiresIn = 900, contentType } = {}) {
      const expires = Math.floor(Date.now() / 1000) + expiresIn
      const signature = sign(key, method.toUpperCase(), expires, normalizeType(contentType))
      const encoded = String(key).split('/').map(encodeURIComponent).join('/')

      return `${baseUrl}/${encoded}?expires=${expires}&signature=${signature}`
    },

    /**
     * Check a signature produced by `signedUrl`.
     *
     * `contentType` is the type the request declares. A URL signed with a type
     * verifies only against that type; one signed without a type verifies
     * whatever is declared, as before.
     *
     * @param {string} key
     * @param {Object} params
     * @param {string} [params.method]
     * @param {string|number} [params.expires]
     * @param {string} [params.signature]
     * @param {string} [params.contentType]
     * @returns {{ valid: boolean, reason?: string }}
     */
    verifySignedUrl(key, { method = 'GET', expires, signature, contentType } = {}) {
      if (!expires || !signature) return { valid: false, reason: 'missing' }
      if (Number(expires) < Math.floor(Date.now() / 1000)) return { valid: false, reason: 'expired' }

      const upper = String(method).toUpperCase()
      const provided = Buffer.from(String(signature), 'hex')

      // Compared in constant time: a fast reject leaks how much of a guess was
      // correct, which is enough to recover a signature byte by byte.
      const matches = (expected) => {
        const a = Buffer.from(expected, 'hex')
        return a.length === provided.length && timingSafeEqual(a, provided)
      }

      const declared = normalizeType(contentType)
      const ok = (declared && matches(sign(key, upper, String(expires), declared))) ||
        matches(sign(key, upper, String(expires)))

      if (!ok) return { valid: false, reason: 'signature' }

      return { valid: true }
    },

    publicUrl(key) {
      const encoded = String(key).split('/').map(encodeURIComponent).join('/')
      return `${baseUrl}/${encoded}`
    }
  }
}

const CONTENT_TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
  json: 'application/json', xml: 'application/xml', csv: 'text/csv',
  zip: 'application/zip', mp4: 'video/mp4', webm: 'video/webm',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf'
}

function normalizeType(contentType) {
  return contentType ? String(contentType).split(';')[0].trim().toLowerCase() : ''
}

function contentTypeFor(key) {
  const extension = String(key).split('.').pop()?.toLowerCase()
  return CONTENT_TYPES[extension] || 'application/octet-stream'
}
