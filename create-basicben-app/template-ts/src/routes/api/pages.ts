import { PageController } from '../../controllers/PageController'
import { auth } from '../../middleware/auth'

interface Router {
  get: (path: string, ...handlers: Function[]) => void
  post: (path: string, ...handlers: Function[]) => void
  put: (path: string, ...handlers: Function[]) => void
  delete: (path: string, ...handlers: Function[]) => void
}

export default (router: Router) => {
  // Public routes
  router.get('/api/pages/published', PageController.published)
  router.get('/api/pages/slug/:slug', PageController.showPublishedBySlug)

  // Admin routes (authenticated)
  router.get('/api/pages', auth, PageController.index)
  router.get('/api/pages/tree', auth, PageController.tree)
  router.get('/api/pages/:id', auth, PageController.show)
  router.post('/api/pages', auth, PageController.store)
  router.put('/api/pages/:id', auth, PageController.update)
  router.delete('/api/pages/:id', auth, PageController.destroy)
  router.put('/api/pages/reorder', auth, PageController.reorder)
}
