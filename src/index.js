/**
 * BasicBen framework public API
 */

export const VERSION = '0.1.0'

// Database
export { db, query, getDb, QueryBuilder, Grammar } from './db/index.js'

// These will be implemented in later phases
// export { validate, rules } from './validation/index.js'
// export { signJwt, verifyJwt } from './auth/jwt.js'
