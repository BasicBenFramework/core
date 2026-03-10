/**
 * BasicBen Vite configuration.
 * Provides base config with API proxy and React plugin.
 */

import react from '@vitejs/plugin-react'

/**
 * Create Vite config with BasicBen defaults
 *
 * @param {Object} options - Override options
 * @returns {Object} Vite config
 */
export function defineConfig(options = {}) {
  const apiPort = process.env.VITE_API_PORT || 3001

  return {
    plugins: [
      react(),
      ...(options.plugins || [])
    ],

    server: {
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true
        },
        ...options.proxy
      },
      ...options.server
    },

    build: {
      outDir: 'dist/client',
      ...options.build
    },

    // Merge any additional options
    ...options
  }
}

/**
 * Default export for direct use in vite.config.js
 */
export default defineConfig()
