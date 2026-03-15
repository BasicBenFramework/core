import { SettingsController } from '../../controllers/SettingsController'
import { auth } from '../../middleware/auth'

interface Router {
  get: (path: string, ...handlers: Function[]) => void
  post: (path: string, ...handlers: Function[]) => void
  put: (path: string, ...handlers: Function[]) => void
  delete: (path: string, ...handlers: Function[]) => void
}

export default (router: Router) => {
  // Public site info
  router.get('/api/site', SettingsController.getSiteInfo)

  // Admin routes (authenticated)
  router.get('/api/settings', auth, SettingsController.index)
  router.get('/api/settings/group/:group', auth, SettingsController.byGroup)
  router.get('/api/settings/:key', auth, SettingsController.get)
  router.put('/api/settings', auth, SettingsController.update)
  router.put('/api/settings/:key', auth, SettingsController.set)
  router.delete('/api/settings/:key', auth, SettingsController.delete)
  router.put('/api/site', auth, SettingsController.updateSiteInfo)
}
