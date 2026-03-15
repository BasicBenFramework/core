/**
 * Theme System for BasicBen CMS
 *
 * Provides WordPress-like theme architecture with theme switching,
 * customization, and layout management.
 */

import { hooks, HOOKS } from '../hooks/index.js'

/**
 * Theme configuration object
 *
 * @typedef {Object} ThemeConfig
 * @property {string} name - Theme display name
 * @property {string} version - Semver version string
 * @property {string} [description] - Theme description
 * @property {string} [author] - Author name
 * @property {string} [screenshot] - Path to screenshot image
 * @property {Object} [settings] - Default theme settings
 * @property {Object} [layouts] - Map of layout names to components
 * @property {Object} [components] - Map of component names to components
 */

/**
 * Theme Manager - Central registry for all themes
 *
 * @example
 * // Register a theme
 * themes.register({
 *   name: 'Default Theme',
 *   version: '1.0.0',
 *   slug: 'default',
 *   settings: {
 *     colors: { primary: '#6366f1' },
 *     fonts: { heading: 'Inter' }
 *   }
 * })
 *
 * // Activate theme
 * await themes.activate('default')
 *
 * // Get theme settings
 * const settings = themes.getSettings()
 */
export class ThemeManager {
  constructor() {
    /** @type {Map<string, ThemeConfig>} */
    this.themes = new Map()

    /** @type {string} */
    this.activeTheme = 'default'

    /** @type {Map<string, Object>} */
    this.themeSettings = new Map()

    /** @type {Object} */
    this.context = {}
  }

  /**
   * Set the application context for themes
   *
   * @param {Object} context - Application context object
   */
  setContext(context) {
    this.context = context
  }

  /**
   * Register a theme
   *
   * @param {ThemeConfig} config - Theme configuration
   * @returns {this}
   */
  register(config) {
    if (!config.slug) {
      throw new Error('Theme must have a slug')
    }

    if (!config.name) {
      config.name = config.slug
    }

    if (!config.version) {
      config.version = '1.0.0'
    }

    if (this.themes.has(config.slug)) {
      console.warn(`Theme "${config.slug}" is already registered, replacing...`)
    }

    this.themes.set(config.slug, config)

    // Initialize theme settings
    if (config.settings) {
      this.themeSettings.set(config.slug, { ...config.settings })
    }

    return this
  }

  /**
   * Activate a theme
   *
   * @param {string} slug - Theme slug
   * @returns {Promise<boolean>}
   */
  async activate(slug) {
    const theme = this.themes.get(slug)

    if (!theme) {
      console.error(`Theme "${slug}" is not registered`)
      return false
    }

    const previousTheme = this.activeTheme

    try {
      this.activeTheme = slug

      // Fire theme activated hook
      await hooks.fire(HOOKS.THEME_ACTIVATED, {
        theme: slug,
        config: theme,
        previousTheme
      })

      console.log(`Theme "${slug}" activated`)
      return true
    } catch (err) {
      console.error(`Failed to activate theme "${slug}":`, err.message)
      this.activeTheme = previousTheme
      return false
    }
  }

  /**
   * Get the active theme config
   *
   * @returns {ThemeConfig|undefined}
   */
  getActive() {
    return this.themes.get(this.activeTheme)
  }

  /**
   * Get theme by slug
   *
   * @param {string} slug - Theme slug
   * @returns {ThemeConfig|undefined}
   */
  get(slug) {
    return this.themes.get(slug)
  }

  /**
   * List all registered themes
   *
   * @returns {Array<{slug: string, name: string, version: string, active: boolean, description?: string}>}
   */
  list() {
    const result = []

    for (const [slug, config] of this.themes) {
      result.push({
        slug,
        name: config.name,
        version: config.version,
        description: config.description,
        author: config.author,
        screenshot: config.screenshot,
        active: slug === this.activeTheme
      })
    }

    return result
  }

  /**
   * Get active theme settings
   *
   * @returns {Object}
   */
  getSettings() {
    return this.themeSettings.get(this.activeTheme) || {}
  }

  /**
   * Get settings for a specific theme
   *
   * @param {string} slug - Theme slug
   * @returns {Object}
   */
  getThemeSettings(slug) {
    return this.themeSettings.get(slug) || {}
  }

  /**
   * Update theme settings
   *
   * @param {Object} settings - New settings (merged with existing)
   * @param {string} [slug] - Theme slug (defaults to active theme)
   * @returns {Object} - Updated settings
   */
  updateSettings(settings, slug) {
    const themeSlug = slug || this.activeTheme
    const current = this.themeSettings.get(themeSlug) || {}
    const updated = deepMerge(current, settings)
    this.themeSettings.set(themeSlug, updated)
    return updated
  }

  /**
   * Reset theme settings to defaults
   *
   * @param {string} [slug] - Theme slug (defaults to active theme)
   * @returns {Object} - Default settings
   */
  resetSettings(slug) {
    const themeSlug = slug || this.activeTheme
    const theme = this.themes.get(themeSlug)

    if (theme?.settings) {
      this.themeSettings.set(themeSlug, { ...theme.settings })
      return { ...theme.settings }
    }

    this.themeSettings.set(themeSlug, {})
    return {}
  }

  /**
   * Get layout component from active theme
   *
   * @param {string} layoutName - Layout name (e.g., 'default', 'post', 'page')
   * @returns {Function|undefined} - React component or undefined
   */
  getLayout(layoutName) {
    const theme = this.getActive()
    if (!theme?.layouts) return undefined
    return theme.layouts[layoutName] || theme.layouts.default
  }

  /**
   * Get component from active theme
   *
   * @param {string} componentName - Component name (e.g., 'Header', 'Footer')
   * @returns {Function|undefined} - React component or undefined
   */
  getComponent(componentName) {
    const theme = this.getActive()
    if (!theme?.components) return undefined
    return theme.components[componentName]
  }

  /**
   * Check if a theme is active
   *
   * @param {string} slug - Theme slug
   * @returns {boolean}
   */
  isActive(slug) {
    return this.activeTheme === slug
  }

  /**
   * Unregister a theme
   *
   * @param {string} slug - Theme slug
   * @returns {boolean}
   */
  unregister(slug) {
    if (slug === this.activeTheme) {
      console.error('Cannot unregister active theme')
      return false
    }

    this.themes.delete(slug)
    this.themeSettings.delete(slug)
    return true
  }

  /**
   * Get CSS variables for active theme
   *
   * @returns {Object} - CSS custom properties
   */
  getCssVariables() {
    const settings = this.getSettings()
    const vars = {}

    // Convert settings to CSS variables
    if (settings.colors) {
      for (const [name, value] of Object.entries(settings.colors)) {
        vars[`--color-${name}`] = value
      }
    }

    if (settings.fonts) {
      for (const [name, value] of Object.entries(settings.fonts)) {
        vars[`--font-${name}`] = value
      }
    }

    if (settings.layout) {
      for (const [name, value] of Object.entries(settings.layout)) {
        vars[`--layout-${name}`] = value
      }
    }

    return vars
  }

  /**
   * Generate CSS variables string
   *
   * @returns {string} - CSS rules
   */
  generateCss() {
    const vars = this.getCssVariables()
    const rules = Object.entries(vars)
      .map(([name, value]) => `  ${name}: ${value};`)
      .join('\n')

    return `:root {\n${rules}\n}`
  }
}

// Deep merge helper
function deepMerge(target, source) {
  const result = { ...target }

  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
      result[key] = deepMerge(target[key], source[key])
    } else {
      result[key] = source[key]
    }
  }

  return result
}

// Global theme manager instance
export const themes = new ThemeManager()
