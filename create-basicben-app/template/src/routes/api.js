import { HomeController } from '../controllers/HomeController.js'

export default (router) => {
  router.get('/api/hello', HomeController.hello)
}
