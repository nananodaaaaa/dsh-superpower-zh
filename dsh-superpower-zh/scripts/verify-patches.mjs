/**
 * Validate this family's bundle patches against the real host contracts.
 *
 * Three checks, all against the shipped implementation rather than a
 * reimplementation of it:
 *
 *   1. every `cordis.patch.yml` is a top-level array of patch entries with an
 *      `insert` list, each row carrying a string `id` and `name`;
 *   2. every `@deepseek-ai/dsh-skill-filesystem` row's `config` passes that
 *      package's OWN exported Schemastery `Config` schema;
 *   3. every plugin row (`./index.js`) resolves to an existing file and, when
 *      imported, exports an `apply` function.
 *
 * Provider-name uniqueness across the family is checked too: two rows
 * claiming one `providerName` would collide at boot, and a row reusing the
 * base bundle's `filesystem` name would shadow it.
 *
 * Usage: node scripts/verify-patches.mjs [profileDir] [packageDir...]
 * `profileDir` defaults to `$DSH_HOME/profiles/web` (or `~/.dsh/profiles/web`),
 * and `packageDir` defaults to this package plus its sibling `dsh-ppt-plugin`.
 */

import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { isAbsolute } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageDir = join(scriptDir, '..')
const familyRoot = join(packageDir, '..')

/** The profile whose `node_modules` the host packages are resolved from. */
function defaultProfileDir() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'profiles', 'web')
}

/** Resolve a package from the profile first, then plugin dirs, then this script. */
function loader(profileDir, packageDirs) {
  const anchors = [join(profileDir, 'package.json'), ...packageDirs.map((dir) => join(dir, 'package.json')), join(scriptDir, 'package.json')]
  return createRequire(anchors.find((anchor) => existsSync(anchor)) ?? import.meta.url)
}

const givenProfile = process.argv[2]
const givenPackages = process.argv.slice(3)
const profileDir = resolve(givenProfile ?? defaultProfileDir())
const packageDirs = (givenPackages.length > 0 ? givenPackages : [packageDir, join(familyRoot, 'dsh-ppt-plugin')]).map((dir) => resolve(dir))

const yaml = await import(pathToFileURL(loader(profileDir, packageDirs).resolve('js-yaml')).href).then(
  (module) => module.default ?? module,
  () => undefined,
)
if (yaml === undefined) {
  console.error('FAIL js-yaml not resolvable')
  process.exit(2)
}

/**
 * The entry-list YAML dialect: `!!js` scalars become expression nodes the
 * loader evaluates at entry activation. Rebuilt here exactly as
 * `dsh-app-boot` defines it, because plain `yaml.load` rejects the tag.
 */
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string',
  construct: (data) => ({ __jsExpr: data }),
})
const entryListSchema = yaml.JSON_SCHEMA.extend(JsExpr)

const require = loader(profileDir, packageDirs)
const skillFilesystem = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-skill-filesystem')).href)

/**
 * The loader's own `!!js` evaluator, imported rather than reimplemented. The
 * profile loader builds patches through this exact function with the Include's
 * context in scope, so evaluating here proves the expression resolves the way
 * a real boot will — including whether `baseUrl` is actually available.
 */
const { interpolate } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis-plugin-loader')).href)

/**
 * Evaluate one row's config the way the loader does. `baseUrl` is supplied
 * from this package's directory, which is what a profile bundle gets: the
 * overlay is loaded from the package, so its expressions see the package
 * directory. A `./skills` here therefore proves the patch does NOT depend on
 * the process CWD.
 */
function evaluateConfig(config, packageDir) {
  return interpolate({ baseUrl: pathToFileURL(join(packageDir, '/')).href }, config)
}

/** Apply the package's own schema; Schemastery throws with the offending path. */
function checkConfig(config, label) {
  if (skillFilesystem.Config === undefined) return `${label}: the package exports no Config schema to check against`
  try {
    skillFilesystem.Config(config)
    return undefined
  } catch (error) {
    return `${label}: config rejected by the real schema — ${error.message}`
  }
}

/**
 * Scan one skill root the way the provider's `discoverRoot` does: a skill is
 * a directory holding `SKILL.md`. A skill whose frontmatter `name` does not
 * match the provider grammar is reported too, because the provider drops it
 * with only a host-side warning.
 * @param root - the already-resolved root directory.
 * @returns the discovered skill names, as the provider would see them.
 */
async function scanSkillDir(root) {
  const found = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = join(root, entry.name, 'SKILL.md')
    let text
    try {
      text = await readFile(file, 'utf8')
    } catch {
      continue
    }
    const match = /^name:[ \t]*(.+)$/m.exec(text)
    const declared = match === null ? entry.name : match[1].trim()
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(declared)) {
      throw new Error(`skill "${entry.name}" declares name "${declared}", which the provider grammar rejects (it would be silently skipped)`)
    }
    found.push(declared)
  }
  return found.sort()
}

const failures = []
/**
 * Every `providerName` already claimed in the process. `filesystem` is the
 * base bundle's provider (and the schema default), so a second row omitting
 * `providerName` collides with it.
 */
const providerNames = new Map([['filesystem', '@deepseek-ai/dsh-base']])
/** Prompt section names/orders claimed by this family, to catch collisions. */
const sections = new Map()
const orders = new Map()

for (const rawDir of packageDirs) {
  const packageDir = resolve(rawDir)
  const patchPath = join(packageDir, 'cordis.patch.yml')
  let patches
  try {
    patches = yaml.load(await readFile(patchPath, 'utf8'), { schema: entryListSchema })
  } catch (error) {
    failures.push(`${packageDir}: cannot read/parse ${patchPath}: ${String(error)}`)
    continue
  }
  if (!Array.isArray(patches)) {
    failures.push(`${packageDir}: cordis.patch.yml is not a top-level array`)
    continue
  }
  const label = packageDir.split(/[\\/]/).pop()
  let rows = 0
  for (const patch of patches) {
    if (typeof patch !== 'object' || patch === null) {
      failures.push(`${label}: a patch entry is not a mapping`)
      continue
    }
    if (!Array.isArray(patch.insert)) {
      failures.push(`${label}: patch entry has no insert list`)
      continue
    }
    for (const row of patch.insert) {
      rows += 1
      if (typeof row.id !== 'string' || row.id === '') failures.push(`${label}: a row has no id`)
      if (typeof row.name !== 'string' || row.name === '') failures.push(`${label}: row ${row.id} has no name`)

      if (row.name === '@deepseek-ai/dsh-skill-filesystem') {
        const providerName = row.config?.providerName ?? 'filesystem'
        if (providerNames.has(providerName)) {
          failures.push(`${label}: providerName "${providerName}" is already claimed by ${providerNames.get(providerName)}`)
        } else {
          providerNames.set(providerName, label)
        }
        // Evaluate `!!js` first: everything downstream must judge the values a
        // real boot would see, not the raw expression nodes.
        let config
        try {
          config = evaluateConfig(row.config, packageDir)
        } catch (error) {
          failures.push(`${label}: row ${row.id} !!js config threw during evaluation — ${String(error)}`)
          continue
        }
        const problem = checkConfig(config, `${label}: row ${row.id}`)
        if (problem !== undefined) failures.push(problem)
        else console.log(`  row ${row.id}: providerName="${providerName}" passes the real Config schema`)

        // `dsh-skill-filesystem` resolves every customSkillDirs entry with
        // `resolve(root)` — against the DSH process's CWD, NOT against the
        // patch file and NOT against the profile. It does that at mount time,
        // so a relative entry is only correct when the process is launched
        // from one exact directory and silently discovers ZERO skills
        // everywhere else. Reproduce the provider's own resolution here (and
        // scan the result) so that mistake can never pass this check again.
        for (const dir of config?.customSkillDirs ?? []) {
          const resolved = resolve(dir)
          let names
          try {
            names = await scanSkillDir(resolved)
          } catch (error) {
            failures.push(`${label}: customSkillDirs "${dir}" resolved to ${resolved}, which the provider cannot scan (${String(error)})`)
            continue
          }
          if (names.length === 0) {
            failures.push(`${label}: customSkillDirs "${dir}" resolved to ${resolved}, which holds no skill bundles (<name>/SKILL.md)`)
            continue
          }
          if (!isAbsolute(dir)) {
            const beside = await scanSkillDir(join(packageDir, dir)).catch(() => [])
            failures.push(
              `${label}: customSkillDirs "${dir}" is RELATIVE. It resolves to ${resolved} against this process's CWD, so it only works when DSH is launched from one exact directory. Use an absolute path (e.g. !!js new URL('./skills/', baseUrl)) instead.${beside.length > 0 ? ` Beside the patch it would have found ${beside.length} skills.` : ''}`,
            )
            continue
          }
          console.log(`  row ${row.id}: customSkillDirs -> ${resolved} (${names.length} skill bundles: ${names.join(', ')})`)
        }
      }

      if (row.name.startsWith('./') || row.name.startsWith('../')) {
        const entry = join(packageDir, row.name.replace(/^\.\//, ''))
        if (!existsSync(entry)) {
          failures.push(`${label}: row ${row.id} points at a missing file ${row.name}`)
          continue
        }
        const module = await import(pathToFileURL(entry).href)
        if (typeof module.apply !== 'function') {
          failures.push(`${label}: row ${row.id} (${row.name}) exports no apply()`)
          continue
        }

        // Run apply() against a stub context and capture what it registers.
        // This is the payload the model will actually receive, so a typo, an
        // empty section, or a duplicate name/order must fail here rather than
        // at the next profile start.
        const registered = []
        const stub = {
          systemPrompt: { section: (section) => registered.push(section) },
          get: () => undefined,
          on: () => () => {},
          effect: () => () => {},
        }
        try {
          module.apply(stub)
        } catch (error) {
          failures.push(`${label}: row ${row.id} apply() threw — ${String(error)}`)
          continue
        }
        if (registered.length === 0) failures.push(`${label}: row ${row.id} registered nothing`)
        for (const section of registered) {
          if (typeof section.name !== 'string' || section.name === '') failures.push(`${label}: row ${row.id} registered a section with no name`)
          if (!Number.isFinite(section.order)) failures.push(`${label}: row ${row.id} section ${section.name} has a non-finite order`)
          if (typeof section.text !== 'string' || section.text.trim() === '') failures.push(`${label}: row ${row.id} section ${section.name} has empty text`)
          const previous = sections.get(section.name)
          if (previous !== undefined) failures.push(`${label}: section name "${section.name}" is already registered by ${previous}`)
          else sections.set(section.name, label)
          if (orders.has(section.order)) console.log(`  note: section ${section.name} shares order ${section.order} with ${orders.get(section.order)}`)
          else orders.set(section.order, section.name)
          console.log(`  row ${row.id}: registered section "${section.name}" (order ${section.order}, ${Buffer.byteLength(section.text, 'utf8')} bytes)`)
        }
      }
    }
  }
  console.log(`${label}: ${rows} inserted row(s) checked`)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('\nOK: every row is well-formed and accepted by the host packages')
