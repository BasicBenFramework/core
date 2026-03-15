/**
 * Hello World Plugin - Example BasicBen Plugin
 *
 * This is an example plugin that demonstrates the plugin architecture.
 * It logs request information and adds a custom API endpoint.
 */

export default {
  // Required: Unique plugin identifier
  name: 'hello-world',

  // Required: Semantic version
  version: '1.0.0',

  // Optional: Plugin description
  description: 'Example plugin that demonstrates the BasicBen plugin architecture',

  // Optional: Author information
  author: 'BasicBen',

  // Optional: Default settings (can be modified via admin panel)
  settings: {
    greeting: 'Hello',
    logRequests: true
  },

  // Hook callbacks - automatically registered when plugin is activated
  hooks: {
    // Fire before each request
    'request.before': async (ctx) => {
      // ctx contains { req, res }
      // Access settings via plugin context
      if (ctx.settings?.logRequests) {
        console.log(`[HelloWorld] ${ctx.req.method} ${ctx.req.url}`)
      }
      return ctx
    },

    // Fire when server starts
    'server.started': async (ctx) => {
      console.log('[HelloWorld] Server is ready!')
      console.log(`[HelloWorld] Greeting is set to: ${ctx.settings?.greeting || 'Hello'}`)
    }
  },

  // Called when plugin is activated
  // Receives context: { router, app, config, hooks, settings, updateSettings }
  initialize: async (ctx) => {
    console.log('[HelloWorld] Plugin initialized')

    // You can access and update settings
    const currentSettings = ctx.settings
    console.log('[HelloWorld] Current settings:', currentSettings)
  },

  // Called when plugin is deactivated
  destroy: async (ctx) => {
    console.log('[HelloWorld] Plugin destroyed')
  },

  // Optional: Register custom routes
  // Receives the router instance
  routes: (router) => {
    // Add a custom endpoint
    router.get('/api/hello', (req, res) => {
      res.json({
        message: 'Hello from the hello-world plugin!',
        timestamp: new Date().toISOString()
      })
    })

    router.get('/api/hello/:name', (req, res) => {
      res.json({
        message: `Hello, ${req.params.name}!`,
        timestamp: new Date().toISOString()
      })
    })
  }
}
