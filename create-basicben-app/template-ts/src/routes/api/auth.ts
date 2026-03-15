import { AuthController } from '../../controllers/AuthController'

interface Router {
  post: (path: string, handler: Function) => void
  get: (path: string, handler: Function) => void
}

export default (router: Router) => {
  router.post('/api/auth/register', AuthController.register)
  router.post('/api/auth/login', AuthController.login)
  router.get('/api/user', AuthController.user)
}
