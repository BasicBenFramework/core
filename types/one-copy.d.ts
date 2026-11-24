/**
 * Record this copy, or refuse because another copy is loaded.
 *
 * @param {string} url - `import.meta.url` of a module in the copy
 * @param {string} version
 * @param {object} [scope] - where the record is kept; `globalThis` by default
 * @throws {Error} when a copy from another location is already loaded
 */
export function claimCopy(url: string, version: string, scope?: object): void;
