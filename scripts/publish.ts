import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const version = JSON.parse(readFileSync('package.json', 'utf8')).version, tag = `v${version}`
if (process.env.GITHUB_REF_NAME !== tag) throw new Error('Release tag does not match package version')
const expected = ['win32-x64', 'darwin-arm64', 'linux-x64']
for (const target of expected) for (const name of [`hiroshi-${version}-${target}.tar.gz`, `manifest-${target}.json`]) if (!Bun.file(path.join('assets', name)).size) throw new Error(`Missing ${name}`)
const run = async (args: string[]) => { const child = Bun.spawn(['gh', ...args], { stdout: 'inherit', stderr: 'inherit' }); if (await child.exited) throw new Error('Release publication failed') }
const changelog = readFileSync('CHANGELOG.md', 'utf8').split(`## [${version}]`)[1]?.split('\n## [')[0]
if (!changelog) throw new Error('Missing release notes')
writeFileSync('release-notes.md', `Hiroshi ${version}\n${changelog}\n\nArchives include the compiled cockpit and engine sidecar. Verify with gh attestation verify <archive> --repo hiroshi-os/Hiroshi. Signatures establish GitHub build provenance; Apple notarization and Windows Authenticode are not included.\n`)
await run(['release', 'create', tag, '--verify-tag', '--draft', '--title', `Hiroshi ${version}`, '--notes-file', 'release-notes.md'])
const files = readdirSync('assets').filter((name) => statSync(path.join('assets', name)).isFile()).map((name) => path.join('assets', name))
files.push(...readdirSync('assets/blobs').map((name) => path.join('assets/blobs', name)))
for (let i = 0; i < files.length; i += 50) await run(['release', 'upload', tag, ...files.slice(i, i + 50)])
await run(['release', 'edit', tag, '--draft=false'])
