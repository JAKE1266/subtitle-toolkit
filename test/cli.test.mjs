/** CLI end-to-end: spawn the real cli.js against fixture files. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CLI = path.join(ROOT, 'cli.js')
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })

let n = 0
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); n++ }
  catch (e) { console.error(`FAIL ${name}\n     ${e.stack}`); process.exitCode = 1 }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subtk-cli-'))
const write = (name, text) => {
  const p = path.join(dir, name)
  fs.writeFileSync(p, text, 'utf8')
  return p
}

const SRT = '1\n00:00:10,000 --> 00:00:12,000\n第一句\n\n2\n00:00:13,000 --> 00:00:15,000\n第二句\n'
const srtFile = write('sample.srt', SRT)
const junkFile = write('junk.txt', '完全不是字幕的内容')

test('detect prints srt and fails gracefully on junk', () => {
  const ok = run(['detect', srtFile])
  assert.equal(ok.status, 0)
  assert.equal(ok.stdout.trim(), 'srt')
  const bad = run(['detect', junkFile])
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /无法识别/)
})

test('info prints count and span', () => {
  const r = run(['info', srtFile])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /条数: 2/)
  assert.match(r.stdout, /跨度: 5000ms/)
})

test('convert srt → vtt and lrc, dot vs comma + LRC format', () => {
  const vtt = run(['convert', srtFile, '--to', 'vtt'])
  assert.equal(vtt.status, 0)
  assert.match(vtt.stdout, /WEBVTT/)
  assert.match(vtt.stdout, /00:00:10\.000 --> 00:00:12\.000/)
  const lrc = run(['convert', srtFile, '--to', 'lrc'])
  assert.match(lrc.stdout, /\[00:10\.00\]第一句/)
  assert.match(lrc.stdout, /\[00:13\.00\]第二句/)
  const bad = run(['convert', srtFile, '--to', 'ass'])
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /--to/)
})

test('shift with negative delta clamps at zero; --out writes a file', () => {
  const out = path.join(dir, 'shifted.srt')
  const r = run(['shift', srtFile, '--delta', '-12', '--out', out])
  assert.equal(r.status, 0, r.stderr)
  const text = fs.readFileSync(out, 'utf8')
  assert.match(text, /00:00:00,000 --> 00:00:00,000/, '第一句整体移到 0')
  assert.match(text, /00:00:01,000 --> 00:00:03,000/, '第二句跟着前移')
  const noOut = run(['shift', srtFile, '--delta', '1'])
  assert.match(noOut.stdout, /00:00:11,000 --> 00:00:13,000/, '不带 --out 时打到 stdout')
})

test('scale duration mode stretches each cue from its start', () => {
  const r = run(['scale', srtFile, '--factor', '2'])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /00:00:10,000 --> 00:00:14,000/, '第一句 2s → 4s,start 不变')
  const g = run(['scale', srtFile, '--factor', '2', '--mode', 'global'])
  assert.match(g.stdout, /00:00:20,000 --> 00:00:24,000/)
})

test('validate passes clean files and fails with issue list on dirty ones', () => {
  const ok = run(['validate', srtFile])
  assert.equal(ok.status, 0)
  assert.match(ok.stdout, /未发现问题/)
  const dirty = write('dirty.srt',
    '1\n00:00:05,000 --> 00:00:03,000\n倒挂\n\n2\n00:00:04,000 --> 00:00:06,000\n重叠\n\n3\n00:00:20,000 --> 00:00:21,000\n\n')
  const bad = run(['validate', dirty])
  assert.equal(bad.status, 1)
  assert.match(bad.stdout, /reversed/)
  assert.match(bad.stdout, /overlap/)
  assert.match(bad.stdout, /empty/)
})

test('missing file and unknown command exit 1 with Chinese errors', () => {
  const missing = run(['info', path.join(dir, 'nope.srt')])
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /不存在/)
  const unknown = run(['frobnicate'])
  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /未知命令/)
})

test('convert cleans up dedupe/sort/empty automatically', () => {
  const messy = write('messy.srt',
    '2\n00:00:10,000 --> 00:00:12,000\nB\n\n1\n00:00:05,000 --> 00:00:07,000\nA\n\n3\n00:00:10,000 --> 00:00:12,000\nB\n\n4\n00:00:30,000 --> 00:00:31,000\n   \n')
  const r = run(['convert', messy, '--to', 'srt'])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /^1\n00:00:05,000/, '输出重排并重新编号,空条目被删')
  assert.match(r.stdout, /A/)
  assert.match(r.stdout, /B/)
  assert.doesNotMatch(r.stdout, /30,000/, '空文本条目不输出')
})

fs.rmSync(dir, { recursive: true, force: true })
console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ', 0 failed'}`)
