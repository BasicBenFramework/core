/**
 * Resolve a package's bin script from a project's node_modules
 *
 * @param {string} cwd - Project directory
 * @param {string} pkgName - Package name, e.g. 'vite'
 * @returns {string|null} Absolute path to the bin script, or null if not installed
 */
export function resolveBin(cwd: string, pkgName: string): string | null;
/**
 * Spawn a locally installed CLI with the current Node binary
 *
 * @param {string} cwd - Project directory
 * @param {string} pkgName - Package name, e.g. 'vite'
 * @param {string[]} args - Arguments for the CLI
 * @param {Object} options - node:child_process spawn options
 * @returns {import('node:child_process').ChildProcess}
 * @throws {Error} If the package is not installed in the project
 */
export function spawnBin(cwd: string, pkgName: string, args: string[], options?: any): import("node:child_process").ChildProcess;
