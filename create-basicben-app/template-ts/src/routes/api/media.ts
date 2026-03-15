import { MediaController } from '../../controllers/MediaController'
import { auth } from '../../middleware/auth'

interface Router {
  get: (path: string, ...handlers: Function[]) => void
  post: (path: string, ...handlers: Function[]) => void
  put: (path: string, ...handlers: Function[]) => void
  delete: (path: string, ...handlers: Function[]) => void
}

export default (router: Router) => {
  // All media routes require authentication
  router.get('/api/media', auth, MediaController.index)
  router.get('/api/media/stats', auth, MediaController.stats)
  router.get('/api/media/:id', auth, MediaController.show)
  router.post('/api/media/upload', auth, MediaController.upload)
  router.put('/api/media/:id', auth, MediaController.update)
  router.delete('/api/media/:id', auth, MediaController.destroy)
}
