import { PluginController } from '../../controllers/PluginController'
import { auth } from '../../middleware/auth'

interface Router {
  get: (path: string, ...handlers: Function[]) => void
  post: (path: string, ...handlers: Function[]) => void
  put: (path: string, ...handlers: Function[]) => void
}

export default (router: Router) => {
  // All plugin management routes require authentication
  router.get('/api/plugins', auth, PluginController.index)
  router.get('/api/plugins/:name', auth, PluginController.show)
  router.post('/api/plugins/activate', auth, PluginController.activate)
  router.post('/api/plugins/deactivate', auth, PluginController.deactivate)
  router.get('/api/plugins/:name/settings', auth, PluginController.getSettings)
  router.put('/api/plugins/:name/settings', auth, PluginController.updateSettings)
}
