/**
 * Rewrite the Gorden PPT skill cross-references after the kebab-case rename.
 *
 * The three skills referenced each other by product name
 * (`GordenImage2PPTX`, `GordenImagePPTGen`, `GordenSuperPPTSkill`), both in
 * prose and in relative paths. DSH's skill registry only accepts lowercase
 * kebab-case names, so the bundles were renamed; this script keeps the bodies
 * consistent with the new names.
 *
 * Plain replacement only: no YAML or Markdown parsing, so formatting, prose,
 * and line endings stay byte-identical apart from the renamed identifiers.
 *
 * Usage: node scripts/rename-refs.mjs [packageRoot]
 */

import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(process.argv[2] ?? join(here, '..'))
const skillsRoot = join(packageRoot, 'skills')

const RENAMES = [
  ['GordenSuperPPTSkill', 'gorden-super-ppt-skill'],
  ['GordenImage2PPTX', 'gorden-image2pptx'],
  ['GordenImagePPTGen', 'gorden-image-ppt-gen'],
]

/** Every .md file below a directory, recursively. */
async function markdownFiles(root) {
  const found = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) found.push(...(await markdownFiles(path)))
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') found.push(path)
  }
  return found
}

let changed = 0
let total = 0
for (const file of await markdownFiles(skillsRoot)) {
  total += 1
  const before = await readFile(file, 'utf8')
  let after = before
  for (const [from, to] of RENAMES) after = after.split(from).join(to)
  if (after === before) continue
  await writeFile(file, after, 'utf8')
  changed += 1
  console.log(`rewrote ${file.slice(packageRoot.length + 1)}`)
}

// The frontmatter `name` is the skill's identity; it must equal its directory.
for (const [from, to] of RENAMES) {
  const file = join(skillsRoot, to, 'SKILL.md')
  const info = await stat(file).catch(() => undefined)
  if (info === undefined) {
    console.error(`MISSING ${file}`)
    process.exitCode = 1
    continue
  }
  const text = await readFile(file, 'utf8')
  const match = /^name:[ \t]*(.+)$/m.exec(text)
  if (match === null || match[1].trim() !== to) {
    console.error(`FRONTMATTER ${to}/SKILL.md declares ${match === null ? 'no name' : `"${match[1].trim()}"`}`)
    process.exitCode = 1
  }
}

console.log(`\nscanned ${total} markdown files, rewrote ${changed}; ${RENAMES.length} skill names checked`)
