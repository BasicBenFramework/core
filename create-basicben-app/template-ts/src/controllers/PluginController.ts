import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Settings } from '../models/Settings'
import type { Request, Response } from '../types'

const PLUGINS_DIR = 'plugins'

interface PluginInfo {
  name: string
  version: string
  description?: string
  author?: string
  active: boolean
  settings?: Record<string, unknown>
}

export const PluginController = {
  async index(req: Request, res: Response) {
    const plugins = await getInstalledPlugins()
    const enabledPlugins = await Settings.getEnabledPlugins()

    const pluginsWithStatus = plugins.map(plugin => ({
      ...plugin,
      active: enabledPlugins.includes(plugin.name)
    }))

    res.json({ plugins: pluginsWithStatus })
  },

  async show(req: Request, res: Response) {
    const plugins = await getInstalledPlugins()
    const plugin = plugins.find(p => p.name === req.params.name)

    if (!plugin) {
      return res.json({ error: 'Plugin not found' }, 404)
    }

    const enabledPlugins = await Settings.getEnabledPlugins()
    res.json({ plugin: { ...plugin, active: enabledPlugins.includes(plugin.name) } })
  },

  async activate(req: Request, res: Response) {
    const { name } = req.body as { name: string }

    if (!name) {
      return res.json({ errors: { name: ['Plugin name is required'] } }, 422)
    }

    const plugins = await getInstalledPlugins()
    const plugin = plugins.find(p => p.name === name)

    if (!plugin) {
      return res.json({ error: 'Plugin not found' }, 404)
    }

    const enabledPlugins = await Settings.getEnabledPlugins()

    if (!enabledPlugins.includes(name)) {
      enabledPlugins.push(name)
      await Settings.setEnabledPlugins(enabledPlugins)
    }

    res.json({
      plugin: { ...plugin, active: true },
      message: `Plugin "${plugin.name}" activated. Restart the server to apply changes.`
    })
  },

  async deactivate(req: Request, res: Response) {
    const { name } = req.body as { name: string }

    if (!name) {
      return res.json({ errors: { name: ['Plugin name is required'] } }, 422)
    }

    const plugins = await getInstalledPlugins()
    const plugin = plugins.find(p => p.name === name)

    if (!plugin) {
      return res.json({ error: 'Plugin not found' }, 404)
    }

    const enabledPlugins = await Settings.getEnabledPlugins()
    const filtered = enabledPlugins.filter(p => p !== name)
    await Settings.setEnabledPlugins(filtered)

    res.json({
      plugin: { ...plugin, active: false },
      message: `Plugin "${plugin.name}" deactivated. Restart the server to apply changes.`
    })
  },

  async getSettings(req: Request, res: Response) {
    const name = req.params.name
    const plugins = await getInstalledPlugins()
    const plugin = plugins.find(p => p.name === name)

    if (!plugin) {
      return res.json({ error: 'Plugin not found' }, 404)
    }

    // Get saved settings
    const savedSettings = await Settings.get(`plugin_settings_${name}`)
    let settings = plugin.settings || {}

    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings)
        settings = { ...settings, ...parsed }
      } catch {
        // Use default settings
      }
    }

    res.json({ settings })
  },

  async updateSettings(req: Request, res: Response) {
    const name = req.params.name
    const plugins = await getInstalledPlugins()
    const plugin = plugins.find(p => p.name === name)

    if (!plugin) {
      return res.json({ error: 'Plugin not found' }, 404)
    }

    const { settings } = req.body as { settings: Record<string, unknown> }

    if (!settings || typeof settings !== 'object') {
      return res.json({ errors: { settings: ['Settings object is required'] } }, 422)
    }

    await Settings.set(`plugin_settings_${name}`, JSON.stringify(settings), 'plugins')
    res.json({ settings })
  }
}

async function getInstalledPlugins(): Promise<PluginInfo[]> {
  const pluginsPath = resolve(process.cwd(), PLUGINS_DIR)
  const plugins: PluginInfo[] = []

  if (!existsSync(pluginsPath)) {
    return plugins
  }

  const entries = readdirSync(pluginsPath)

  for (const entry of entries) {
    if (entry.startsWith('.')) continue

    const fullPath = join(pluginsPath, entry)

    // Check if it's a directory with index.js or a single file
    if (existsSync(join(fullPath, 'index.js')) || existsSync(join(fullPath, 'plugin.json'))) {
      // Directory plugin
      const configPath = join(fullPath, 'plugin.json')
      const indexPath = join(fullPath, 'index.js')

      let config: PluginInfo = { name: entry, version: '1.0.0', active: false }

      if (existsSync(configPath)) {
        try {
          const content = readFileSync(configPath, 'utf-8')
          const parsed = JSON.parse(content)
          config = { ...config, ...parsed }
        } catch {
          // Use defaults
        }
      } else if (existsSync(indexPath)) {
        // Try to extract metadata from the JS file
        try {
          const content = readFileSync(indexPath, 'utf-8')
          const nameMatch = content.match(/name:\s*['"]([^'"]+)['"]/)
          const versionMatch = content.match(/version:\s*['"]([^'"]+)['"]/)
          const descMatch = content.match(/description:\s*['"]([^'"]+)['"]/)

          if (nameMatch) config.name = nameMatch[1]
          if (versionMatch) config.version = versionMatch[1]
          if (descMatch) config.description = descMatch[1]
        } catch {
          // Use defaults
        }
      }

      plugins.push(config)
    } else if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
      // Single file plugin
      const pluginPath = join(pluginsPath, entry)

      try {
        const content = readFileSync(pluginPath, 'utf-8')
        const nameMatch = content.match(/name:\s*['"]([^'"]+)['"]/)
        const versionMatch = content.match(/version:\s*['"]([^'"]+)['"]/)
        const descMatch = content.match(/description:\s*['"]([^'"]+)['"]/)

        plugins.push({
          name: nameMatch ? nameMatch[1] : entry.replace(/\.(m?js)$/, ''),
          version: versionMatch ? versionMatch[1] : '1.0.0',
          description: descMatch ? descMatch[1] : undefined,
          active: false
        })
      } catch {
        plugins.push({
          name: entry.replace(/\.(m?js)$/, ''),
          version: '1.0.0',
          active: false
        })
      }
    }
  }

  return plugins
}
