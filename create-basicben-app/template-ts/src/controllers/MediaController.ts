import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Media } from '../models/Media'
import type { Request, Response } from '../types'

const UPLOAD_DIR = 'public/uploads'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// Ensure upload directory exists
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true })
}

export const MediaController = {
  async index(req: Request, res: Response) {
    const page = parseInt(req.query.page as string) || 1
    const perPage = parseInt(req.query.per_page as string) || 20
    const { items, total } = await Media.all(page, perPage)

    res.json({
      media: items,
      pagination: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage)
      }
    })
  },

  async show(req: Request, res: Response) {
    const media = await Media.find(parseInt(req.params.id))
    if (!media) {
      return res.json({ error: 'Media not found' }, 404)
    }
    res.json({ media })
  },

  async upload(req: Request, res: Response) {
    // This is a simplified upload handler
    // In production, you'd use a proper multipart parser
    const contentType = req.headers['content-type'] || ''

    if (!contentType.includes('multipart/form-data')) {
      return res.json({ error: 'Content-Type must be multipart/form-data' }, 400)
    }

    try {
      // Parse multipart form data (simplified)
      const files = await parseMultipartFiles(req)

      if (!files || files.length === 0) {
        return res.json({ error: 'No file uploaded' }, 400)
      }

      const uploadedMedia = []

      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          return res.json({ error: `File ${file.originalName} exceeds maximum size of 10MB` }, 400)
        }

        // Generate unique filename
        const ext = extname(file.originalName)
        const filename = `${randomUUID()}${ext}`
        const path = `/uploads/${filename}`
        const fullPath = join(UPLOAD_DIR, filename)

        // Write file to disk
        await writeFile(fullPath, file.buffer)

        // Save to database
        const media = await Media.create({
          user_id: req.userId,
          filename,
          original_name: file.originalName,
          path,
          mime_type: file.mimeType,
          size: file.size
        })

        uploadedMedia.push(media)
      }

      res.json({ media: uploadedMedia.length === 1 ? uploadedMedia[0] : uploadedMedia }, 201)
    } catch (err) {
      console.error('Upload error:', err)
      res.json({ error: 'Failed to upload file' }, 500)
    }
  },

  async update(req: Request, res: Response) {
    const media = await Media.find(parseInt(req.params.id))
    if (!media) {
      return res.json({ error: 'Media not found' }, 404)
    }

    const { alt_text } = req.body as { alt_text?: string }
    const updated = await Media.update(parseInt(req.params.id), { alt_text })
    res.json({ media: updated })
  },

  async destroy(req: Request, res: Response) {
    const media = await Media.delete(parseInt(req.params.id))
    if (!media) {
      return res.json({ error: 'Media not found' }, 404)
    }

    // Delete file from disk
    try {
      const fullPath = join('public', media.path)
      if (existsSync(fullPath)) {
        unlinkSync(fullPath)
      }
    } catch (err) {
      console.error('Failed to delete file:', err)
    }

    res.json({ message: 'Media deleted' })
  },

  async stats(req: Request, res: Response) {
    const stats = await Media.getStats()
    res.json({ stats })
  }
}

// Helper to parse multipart form data (simplified implementation)
interface ParsedFile {
  originalName: string
  mimeType: string
  size: number
  buffer: Buffer
}

async function parseMultipartFiles(req: Request): Promise<ParsedFile[]> {
  return new Promise((resolve, reject) => {
    const files: ParsedFile[] = []
    const chunks: Buffer[] = []

    // @ts-ignore - accessing raw request
    const rawReq = req._raw || req

    rawReq.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    rawReq.on('end', () => {
      try {
        const body = Buffer.concat(chunks)
        const boundary = getBoundary(req.headers['content-type'] || '')

        if (!boundary) {
          resolve([])
          return
        }

        const parts = parseMultipart(body, boundary)
        resolve(parts)
      } catch (err) {
        reject(err)
      }
    })

    rawReq.on('error', reject)
  })
}

function getBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=(.+)$/)
  return match ? match[1] : null
}

function parseMultipart(body: Buffer, boundary: string): ParsedFile[] {
  const files: ParsedFile[] = []
  const boundaryBuffer = Buffer.from(`--${boundary}`)
  let start = 0

  while (true) {
    const partStart = body.indexOf(boundaryBuffer, start)
    if (partStart === -1) break

    const partEnd = body.indexOf(boundaryBuffer, partStart + boundaryBuffer.length)
    if (partEnd === -1) break

    const part = body.slice(partStart + boundaryBuffer.length, partEnd)
    const headerEnd = part.indexOf('\r\n\r\n')

    if (headerEnd !== -1) {
      const headers = part.slice(0, headerEnd).toString()
      const content = part.slice(headerEnd + 4, part.length - 2) // Remove trailing \r\n

      const filenameMatch = headers.match(/filename="([^"]+)"/)
      const contentTypeMatch = headers.match(/Content-Type:\s*(.+)/)

      if (filenameMatch) {
        files.push({
          originalName: filenameMatch[1],
          mimeType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
          size: content.length,
          buffer: content
        })
      }
    }

    start = partEnd
  }

  return files
}

function writeFile(path: string, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(path)
    stream.write(buffer)
    stream.end()
    stream.on('finish', resolve)
    stream.on('error', reject)
  })
}
