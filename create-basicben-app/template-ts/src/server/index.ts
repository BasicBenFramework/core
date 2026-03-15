/**
 * Server entry point
 *
 * For TypeScript projects, routes must be explicitly imported
 * so Vite can bundle them during SSR build.
 */

import { createServer, createRouter } from '@basicbenframework/core/server'

// Import routes explicitly for Vite bundling
import authRoutes from '../routes/api/auth'
import postsRoutes from '../routes/api/posts'
import profileRoutes from '../routes/api/profile'

// Determine static directory based on environment
// In production, static files are in dist/client (relative to app root/cwd)
const staticDir = process.env.NODE_ENV === 'production' ? 'dist/client' : 'public'

const app = await createServer({
  // Disable auto-loading since we're importing routes explicitly
  autoloadRoutes: false,
  // Serve static files from appropriate directory
  static: { dir: staticDir }
})

// Register routes
const router = createRouter()
authRoutes(router)
postsRoutes(router)
profileRoutes(router)
router.applyTo(app)

const port = process.env.PORT || 3001

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
