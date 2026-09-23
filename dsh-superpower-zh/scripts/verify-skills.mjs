/**
 * Verify that every skill bundle in this package is discoverable by the real
 * `@deepseek-ai/dsh-skill-filesystem` provider.
 *
 * The provider's per-skill parser is not exported, but its name rule and its
 * root scanner are public behaviour: a bundle is discovered as
 * `<root>/<name>/SKILL.md`, and its frontmatter `name` must match the
 * provider's own SKILL_NAME grammar. This script compares the two and reports
 * any bundle the provider would reject or silently skip.
 *
 * Usage: node scripts/verify-skills.mjs [packageRoot]
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Mirrors SKILL_NAME in @deepseek-ai/dsh-skill-filesystem/src/index.ts. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(process.argv[2] ?? join(here, '..'))
const skillsRoot = join(packageRoot, 'skills')

/** Split leading `---` frontmatter without pulling in a YAML dependency. */
function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  return match === null ? undefined : match[1]
}

/** Read one scalar field from a frontmatter block. */
function field(block, key) {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(block)
  return match === null ? undefined : match[1].trim().replace(/^['"]|['"]$/g, '')
}

const failures = []
const names = []

let entries
try {
  entries = await readdir(skillsRoot, { withFileTypes: true })
} catch (error) {
  console.error(`FAIL cannot read ${skillsRoot}: ${String(error)}`)
  process.exit(2)
}

for (const entry of entries) {
  if (!entry.isDirectory()) {
    failures.push(`${entry.name}: not a directory (the provider discovers only <name>/SKILL.md)`)
    continue
  }
  const file = join(skillsRoot, entry.name, 'SKILL.md')
  let text
  try {
    const info = await stat(file)
    if (!info.isFile()) throw new Error('not a regular file')
    text = await readFile(file, 'utf8')
  } catch {
    failures.push(`${entry.name}: missing SKILL.md`)
    continue
  }

  const block = frontmatter(text)
  if (block === undefined) {
    failures.push(`${entry.name}: no --- frontmatter block`)
    continue
  }

  const declared = field(block, 'name')
  const description = field(block, 'description')

  if (declared === undefined || declared === '') failures.push(`${entry.name}: frontmatter has no name`)
  else if (declared !== entry.name) failures.push(`${entry.name}: name "${declared}" != directory name`)
  else if (!SKILL_NAME.test(declared)) failures.push(`${entry.name}: name fails the provider grammar`)
  else names.push(declared)

  if (description === undefined || description === '') failures.push(`${entry.name}: frontmatter has no description`)
  else if (Buffer.byteLength(description, 'utf8') > 1024) failures.push(`${entry.name}: description over 1024 bytes`)
}

// Invocation-surface keys must be strict booleans where present.
for (const name of names) {
  const text = await readFile(join(skillsRoot, name, 'SKILL.md'), 'utf8')
  const block = frontmatter(text) ?? ''
  for (const key of ['disable-model-invocation', 'user-invocable']) {
    const value = field(block, key)
    if (value === undefined) continue
    if (!/^(true|false|yes|no|on|off|1|0)$/i.test(value)) failures.push(`${name}: ${key} = "${value}" is not a boolean`)
  }
}

names.sort()
console.log(`discoverable skill bundles: ${names.length}`)
for (const name of names) console.log(`  ${name}`)

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('\nOK: every bundle parses as a provider-visible skill')
