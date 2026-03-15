import { getDb } from '@basicbenframework/core/db'
import type { User as UserType } from '../types'

interface CreateUserData {
  name: string
  email: string
  password: string
}

interface UpdateUserData {
  name?: string
  email?: string
  password?: string
}

export const User = {
  async all(): Promise<UserType[]> {
    const db = await getDb()
    return db.all('SELECT * FROM users')
  },

  async find(id: number): Promise<UserType | undefined> {
    const db = await getDb()
    return db.get('SELECT * FROM users WHERE id = ?', [id])
  },

  async findByEmail(email: string): Promise<UserType | undefined> {
    const db = await getDb()
    return db.get('SELECT * FROM users WHERE email = ?', [email])
  },

  async create(data: CreateUserData): Promise<UserType> {
    const db = await getDb()
    const result = await db.run(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [data.name, data.email, data.password]
    )
    return { id: result.lastInsertRowid as number, ...data, created_at: new Date().toISOString() }
  },

  async update(id: number, data: UpdateUserData): Promise<UserType> {
    const db = await getDb()
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ')
    await db.run(
      `UPDATE users SET ${fields} WHERE id = ?`,
      [...Object.values(data), id]
    )
    return this.find(id) as Promise<UserType>
  },

  async delete(id: number): Promise<void> {
    const db = await getDb()
    await db.run('DELETE FROM users WHERE id = ?', [id])
  }
}
