/**
 * UserController
 */

export const UserController = {
  /**
   * List all users
   * GET /users
   */
  index: async (req, res) => {
    res.json({ message: 'User index' })
  },

  /**
   * Show a single user
   * GET /users/:id
   */
  show: async (req, res) => {
    const { id } = req.params
    res.json({ message: `User show ${id}` })
  },

  /**
   * Create a new user
   * POST /users
   */
  create: async (req, res) => {
    res.status(201).json({ message: 'User created' })
  },

  /**
   * Update a user
   * PUT /users/:id
   */
  update: async (req, res) => {
    const { id } = req.params
    res.json({ message: `User updated ${id}` })
  },

  /**
   * Delete a user
   * DELETE /users/:id
   */
  destroy: async (req, res) => {
    const { id } = req.params
    res.status(204).send()
  }
}
