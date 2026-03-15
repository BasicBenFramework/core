import { UpdatesController } from '../../controllers/UpdatesController'
import { auth } from '../../middleware/auth'

interface Router {
  get: (path: string, ...handlers: Function[]) => void
  post: (path: string, ...handlers: Function[]) => void
  delete: (path: string, ...handlers: Function[]) => void
}

export default (router: Router) => {
  // All update routes require authentication

  // Check for updates
  router.get('/api/updates/check', auth, UpdatesController.check)
  router.get('/api/updates/core', auth, UpdatesController.checkCore)
  router.get('/api/updates/plugins', auth, UpdatesController.checkPlugins)
  router.get('/api/updates/themes', auth, UpdatesController.checkThemes)

  // Apply updates
  router.post('/api/updates/core', auth, UpdatesController.updateCore)
  router.post('/api/updates/plugins/:slug', auth, UpdatesController.updatePlugin)
  router.post('/api/updates/themes/:slug', auth, UpdatesController.updateTheme)

  // Changelog
  router.get('/api/updates/changelog/:version', auth, UpdatesController.changelog)

  // Registry browsing
  router.get('/api/registry/plugins', auth, UpdatesController.browsePlugins)
  router.get('/api/registry/themes', auth, UpdatesController.browseThemes)

  // Install from registry
  router.post('/api/registry/plugins/install', auth, UpdatesController.installPlugin)
  router.post('/api/registry/themes/install', auth, UpdatesController.installTheme)

  // Backups
  router.get('/api/backups', auth, UpdatesController.listBackups)
  router.post('/api/backups', auth, UpdatesController.createBackup)
  router.post('/api/backups/:id/restore', auth, UpdatesController.restoreBackup)
}
