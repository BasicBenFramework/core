import { TagController } from '../../controllers/TagController'
import { auth } from '../../middleware/auth'

interface Router {
  get: (path: string, ...handlers: Function[]) => void
  post: (path: string, ...handlers: Function[]) => void
  put: (path: string, ...handlers: Function[]) => void
  delete: (path: string, ...handlers: Function[]) => void
}

export default (router: Router) => {
  // Public routes
  router.get('/api/tags', TagController.index)
  router.get('/api/tags/slug/:slug', TagController.showBySlug)
  router.get('/api/tags/:id', TagController.show)

  // Admin routes (authenticated)
  router.post('/api/tags', auth, TagController.store)
  router.put('/api/tags/:id', auth, TagController.update)
  router.delete('/api/tags/:id', auth, TagController.destroy)
}
