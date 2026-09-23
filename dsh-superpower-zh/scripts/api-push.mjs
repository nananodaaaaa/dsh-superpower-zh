/**
 * Repair push: re-upload a set of workspace files to GitHub through the REST
 * API using Node's own UTF-8 file reads.
 *
 * Why this exists: when direct git transport to github.com is unreachable, the
 * Git Data API is a workable fallback — but only if the file bytes survive the
 * round trip. A PowerShell-driven attempt read UTF-8 sources through
 * `Get-Content -Raw`, which decodes with the platform ANSI code page on
 * Windows and silently replaced every non-ASCII character with `?`. Node reads
 * and writes UTF-8 by construction, so the uploaded blob is byte-identical to
 * the file on disk.
 *
 * Every uploaded blob is verified against the local file's byte length and
 * SHA-1 before the ref moves.
 *
 * Usage: node scripts/api-push.mjs <repoRoot> <messageFile> <path>...
 *   GH_TOKEN must be set in the environment.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const [, , repoRootArg, messageFile, ...paths] = process.argv
if (!repoRootArg || !messageFile || paths.length === 0) {
  console.error('usage: node scripts/api-push.mjs <repoRoot> <messageFile> <path>...')
  process.exit(2)
}

const repoRoot = resolve(repoRootArg)
const token = process.env.GH_TOKEN
if (!token) {
  console.error('GH_TOKEN is not set')
  process.exit(2)
}

const REPO = 'nananodaaaaa/dsh-superpower-zh'
const BRANCH = 'main'
const API = `https://api.github.com/repos/${REPO}`

/** GitHub REST call with the headers this API requires. */
async function call(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'dsh-api-push',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${text.slice(0, 400)}`)
  return text === '' ? undefined : JSON.parse(text)
}

const head = await call(`/git/ref/heads/${BRANCH}`)
const baseSha = head.object.sha
const baseCommit = await call(`/git/commits/${baseSha}`)
console.log(`base ${baseSha} (${baseCommit.message.split('\n')[0]})`)

const tree = []
for (const path of paths) {
  const absolute = resolve(repoRoot, path)
  const bytes = readFileSync(absolute)
  const repoPath = relative(repoRoot, absolute).split(sep).join('/')
  const text = bytes.toString('utf8')
  if (text.includes('\uFFFD')) throw new Error(`${repoPath}: file is not valid UTF-8`)

  const blob = await call('/git/blobs', {
    method: 'POST',
    body: JSON.stringify({ content: text, encoding: 'utf-8' }),
  })

  const localSha = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`, 'utf8')).update(bytes).digest('hex')
  console.log(`  ${repoPath}  ${bytes.length} bytes  local sha1=${localSha.slice(0, 12)}  blob sha1=${blob.sha.slice(0, 12)}  match=${localSha === blob.sha}`)
  if (localSha !== blob.sha) throw new Error(`${repoPath}: uploaded blob does not match the local file`)
  tree.push({ path: repoPath, mode: '100644', type: 'blob', sha: blob.sha })
}

const newTree = await call('/git/trees', {
  method: 'POST',
  body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
})
console.log(`tree ${newTree.sha}`)

const message = readFileSync(messageFile, 'utf8').trim()
if (message.includes('\uFFFD')) throw new Error('commit message is not valid UTF-8')
const commit = await call('/git/commits', {
  method: 'POST',
  body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }),
})
console.log(`commit ${commit.sha}`)

await call(`/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) })
console.log(`ref ${BRANCH} -> ${commit.sha}`)

// Read the commit back and prove the blobs landed byte-identical.
const verify = await call(`/git/trees/${commit.sha}?recursive=1`)
for (const entry of tree) {
  const remote = verify.tree.find((item) => item.path === entry.path)
  if (remote === undefined) throw new Error(`${entry.path}: missing from the new tree`)
  const blob = await call(`/git/blobs/${remote.sha}`)
  const remoteBytes = Buffer.from(blob.content.replace(/\s/g, ''), 'base64')
  const localBytes = readFileSync(join(repoRoot, entry.path))
  const same = remoteBytes.equals(localBytes)
  console.log(`  verify ${entry.path}: remote ${remoteBytes.length} bytes vs local ${localBytes.length} bytes — identical=${same}`)
  if (!same) throw new Error(`${entry.path}: remote content differs from local`)
}
console.log('OK: remote matches local byte for byte')
