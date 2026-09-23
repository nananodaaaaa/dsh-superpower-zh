/**
 * Package root entry. Having a real file here (rather than letting the row
 * name resolve a directory) keeps the plugin specifier an explicit JS file:
 * the profile loader anchors `./index.js` to the bundle patch's own directory
 * and imports it by URL, with no directory-import resolution involved.
 *
 * The implementation lives in `lib/index.js`.
 */
export { apply, inject, name } from './lib/index.js'
export { default } from './lib/index.js'
