/**
 * Evaluate every `!!js` expression in the family's bundle patches through the
 * LOADER'S OWN evaluator, with the context a real profile boot supplies.
 *
 * Why this exists separately from verify-patches.mjs: that script also runs
 * `interpolate`, but it chose the `baseUrl`, so it could only ever prove the
 * expression works under an assumption. This script instead evaluates the
 * expression under the context a profile bundle actually gets — `baseUrl` =
 * the composed profile directory, `DSH_HOME` = the real harness home — and
 * then asserts the result is a directory that really holds skill bundles.
 *
 * Usage: node scripts/verify-expressions.mjs
 */

import { readFileSync, readdirSync, existsSync, mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const familyRoot = join(scriptDir, '..', '..')
const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', 'web')

/** Resolve host packages from the profile, the only place they exist. */
const require = createRequire(join(profileDir, 'package.json'))
const yamlModule = await import(pathToFileURL(require.resolve('js-yaml')).href)
const yaml = yamlModule.default ?? yamlModule
const { interpolate } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis-plugin-loader')).href)

const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string',
  construct: (data) => ({ __jsExpr: data }),
})
const entryListSchema = yaml.JSON_SCHEMA.extend(JsExpr)

/** Does this directory hold at least one skill bundle? */
function holdsSkills(root) {
  try {
    return readdirSync(root, { withFileTypes: true }).some(
      (entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'SKILL.md')),
    )
  } catch {
    return false
  }
}

const packages = ['dsh-superpower-zh', 'dsh-ppt-plugin']
const failures = []

/**
 * The contexts a real boot can present. `baseUrl` is the directory of the
 * config the Include mounts — for a profile, the profile directory — which is
 * exactly the case the first `new URL('./skills/', baseUrl)` version got
 * wrong.
 */
const contexts = [
  { label: 'profile directory (the real boot)', baseUrl: pathToFileURL(join(profileDir, '/')).href },
  { label: 'empty baseUrl (no anchor at all)', baseUrl: '' },
  { label: 'bogus baseUrl (unreachable path)', baseUrl: pathToFileURL(join(mkdtempSync(join(tmpdir(), 'spx-')), '/')).href },
]

for (const pkg of packages) {
  const patchPath = join(familyRoot, pkg, 'cordis.patch.yml')
  const patches = yaml.load(readFileSync(patchPath, 'utf8'), { schema: entryListSchema })
  let checked = 0

  for (const patch of patches) {
    for (const row of patch.insert ?? []) {
      const raw = row.config?.customSkillDirs
      if (!Array.isArray(raw)) continue
      const rawEntry = raw[0]
      if (!(rawEntry instanceof Object && '__jsExpr' in rawEntry)) {
        failures.push(`${pkg}: customSkillDirs[0] is not a !!js expression (got ${JSON.stringify(rawEntry)})`)
        continue
      }
      checked += 1
      for (const context of contexts) {
        let resolved
        try {
          resolved = interpolate({ baseUrl: context.baseUrl }, rawEntry)
        } catch (error) {
          failures.push(`${pkg}: !!js threw under ${context.label} — ${String(error)}`)
          continue
        }
        if (typeof resolved !== 'string' || !resolved) {
          failures.push(`${pkg}: !!js returned ${JSON.stringify(resolved)} under ${context.label}`)
          continue
        }
        if (!holdsSkills(resolved)) {
          failures.push(`${pkg}: under ${context.label} the expression resolved to ${resolved}, which holds no skill bundles`)
          continue
        }
        const count = readdirSync(resolved, { withFileTypes: true }).filter(
          (entry) => entry.isDirectory() && existsSync(join(resolved, entry.name, 'SKILL.md')),
        ).length
        console.log(`  ${pkg} · ${context.label} -> ${resolved} (${count} bundles)`)
      }
    }
  }
  if (checked === 0) failures.push(`${pkg}: no !!js customSkillDirs row found to check`)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('\nOK: every expression resolves to a real skills root under every boot context')
