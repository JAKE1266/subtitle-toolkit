/**
 * Syntax guard — every JS file must parse as ESM. The project package.json
 * declares "type":"module", so `node --check` below is a true ESM parse.
 * (Lesson from project #1: without type:module, --check silently uses the
 * Script parse goal and can pass files the ESM loader then rejects.)
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let n = 0
let failures = 0

function checkFile(rel) {
  const r = spawnSync(process.execPath, ['--check', path.join(ROOT, rel)], { encoding: 'utf8' })
  if (r.status !== 0) {
    failures++
    console.error(`FAIL ${rel}\n     ${(r.stderr || '').trim().split('\n').slice(0, 4).join('\n     ')}`)
  } else {
    console.log(`ok   ${rel}`)
    n++
  }
}

const targets = ['cli.js', ...fs.readdirSync(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.js')).map((f) => `lib/${f}`)]
for (const rel of targets) checkFile(rel)

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
if (pkg.type !== 'module') {
  failures++
  console.error('FAIL package.json\n     需要 "type":"module"')
} else {
  console.log('ok   package.json type=module')
  n++
}

console.log(`\n${n} passed${failures ? `, ${failures} FAILED` : ', 0 failed'}`)
process.exitCode = failures ? 1 : 0
