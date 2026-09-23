/**
 * Package root entry for dsh-ppt-plugin. A real file here keeps the plugin
 * specifier in `cordis.patch.yml` an explicit JS file, which the profile
 * loader anchors to that patch's own directory.
 */
export { apply, inject, name } from './lib/index.js'
export { default } from './lib/index.js'
