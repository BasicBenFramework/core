/**
 * API Routes
 *
 * Define your API endpoints here.
 */

import { HomeController } from '../controllers/HomeController.js'

export default (router) => {
  // Hello endpoint
  router.get('/api/hello', HomeController.hello)

  // Example resource routes
  // router.get('/api/users', UserController.index)
  // router.get('/api/users/:id', UserController.show)
  // router.post('/api/users', auth, UserController.create)
  // router.put('/api/users/:id', auth, UserController.update)
  // router.delete('/api/users/:id', auth, UserController.destroy)
}
