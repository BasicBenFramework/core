import { verifyJwt } from '@basicbenframework/core/auth'
import type { Request, Response } from '../types'

interface JwtPayload {
  userId: number
}

export const auth = async (req: Request, res: Response, next: () => void) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.json({ error: 'Unauthorized' }, 401)
  }

  const payload = verifyJwt(token, process.env.APP_KEY as string) as JwtPayload | null
  if (!payload) {
    return res.json({ error: 'Invalid token' }, 401)
  }

  req.userId = payload.userId
  next()
}
