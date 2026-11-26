/** Tests for parsers, formatters, transforms and validation. */
import assert from 'node:assert/strict'
import { parseTs, detectFormat, parseSrt, parseVtt, parseLrc, parseAny } from '../lib/parse.js'
import { fmtSrtTs, fmtVttTs, fmtLrcTs, formatSrt, formatVtt, formatLrc, formatAs } from '../lib/format.js'
import { shift, scale, sortCues, dedupe, dropEmpty, concat, stats } from '../lib/transform.js'
import { validate } from '../lib/validate.js'

let n = 0
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); n++ }
  catch (e) { console.error(`FAIL ${name}\n     ${e.stack}`); process.exitCode = 1 }
}

/* ---------------- timestamps ---------------- */
test('parseTs accepts SRT/VTT/LRC variants', () => {
  assert.equal(parseTs('00:00:01,500'), 1500)
  assert.equal(parseTs('00:00:01.500'), 1500)
  assert.equal(parseTs('01:02.500'), 62500)
  assert.equal(parseTs('01:02,5'), 62500)
  assert.equal(parseTs('01:02'), 62000)
  assert.ok(Number.isNaN(parseTs('abc')))
})

test('formatters round-trip through parseTs', () => {
  for (const ms of [0, 1500, 62500, 3661500]) {
    assert.equal(parseTs(fmtSrtTs(ms)), ms)
    assert.equal(parseTs(fmtVttTs(ms)), ms)
  }
})

test('fmtLrcTs folds hours into minutes and rounds hundredths', () => {
  assert.equal(fmtLrcTs(12500), '00:12.50')
  assert.equal(fmtLrcTs(3661500), '61:01.50')
  assert.equal(fmtLrcTs(950), '00:00.95')
})

/* ---------------- detection ---------------- */
test('detectFormat identifies srt/vtt/lrc and rejects junk', () => {
  assert.equal(detectFormat('1\n00:00:01,000 --> 00:00:02,000\nhi'), 'srt')
  assert.equal(detectFormat('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi'), 'vtt')
  assert.equal(detectFormat('[00:12.34]歌词'), 'lrc')
  assert.equal(detectFormat('随便什么文本'), null)
})

/* ---------------- SRT ---------------- */
const SRT = [
  '\ufeff1',                          // BOM + cue number
  '00:00:01,000 --> 00:00:03,500',
  '你好',
  '',
  '2',
  '00:00:04,000 --> 00:00:06,000',
  '第二行 A',
  '第二行 B',
  '',
].join('\r\n')

test('parseSrt handles BOM, CRLF, multi-line text, missing numbers', () => {
  const { cues, warnings } = parseSrt(SRT)
  assert.equal(cues.length, 2)
  assert.equal(cues[0].start, 1000)
  assert.equal(cues[0].end, 3500)
  assert.equal(cues[0].text, '你好')
  assert.equal(cues[1].text, '第二行 A\n第二行 B')
  assert.deepEqual(warnings, [])
})

test('parseSrt tolerates dot milliseconds and collects warnings for junk blocks', () => {
  const { cues, warnings } = parseSrt('00:00:01.000 --> 00:00:02.000\nok\n\n这一块没有时间码\n\n5 --> 9\n不是时间码')
  assert.equal(cues.length, 1)
  assert.equal(cues[0].start, 1000)
  assert.ok(warnings.length >= 2)
})

test('formatSrt renumbers and escapes nothing (text is verbatim)', () => {
  const out = formatSrt([{ start: 0, end: 1500, text: 'A' }, { start: 2000, end: 3000, text: 'B\nC' }])
  assert.match(out, /^1\n00:00:00,000 --> 00:00:01,500\nA\n\n2\n00:00:02,000 --> 00:00:03,000\nB\nC\n$/)
})

/* ---------------- WebVTT ---------------- */
const VTT = [
  'WEBVTT',
  '',
  'NOTE 这是一个注释块',
  '跨行也没关系',
  '',
  'cue-1',
  '00:00:01.000 --> 00:00:02.000',
  'hello <b>世界</b>',
  '',
  'STYLE',
  '::cue { color: red }',
  '',
  '00:00:03.000 --> 00:00:04.000',
  'second',
  '',
].join('\n')

test('parseVtt skips NOTE/STYLE blocks and optional cue ids', () => {
  const { cues, warnings } = parseVtt(VTT)
  assert.equal(cues.length, 2)
  assert.equal(cues[0].text, 'hello <b>世界</b>')
  assert.equal(cues[1].start, 3000)
  assert.deepEqual(warnings, [])
})

test('formatVtt emits header and dot milliseconds', () => {
  const out = formatVtt([{ start: 1000, end: 2000, text: 'x' }])
  assert.match(out, /^WEBVTT\n\n00:00:01\.000 --> 00:00:02\.000\nx\n$/)
})

/* ---------------- LRC ---------------- */
test('parseLrc splits multi-timestamp lines, skips metadata, keeps untimed', () => {
  const { cues, untimed } = parseLrc('[ti:歌名]\n[00:12.34][01:02.50]爱在西元前\n没有时间戳的一行\n[01:30]尾句')
  assert.equal(cues.length, 3)
  assert.equal(cues[0].start, 12340)
  assert.equal(cues[1].start, 62500)
  assert.equal(cues[0].end, null)
  assert.equal(cues[2].start, 90000)
  assert.equal(untimed[0], '没有时间戳的一行')
})

test('formatLrc outputs mm:ss.xx per cue', () => {
  const out = formatLrc([{ start: 12340, end: null, text: '爱在西元前' }])
  assert.equal(out, '[00:12.34]爱在西元前\n')
})

/* ---------------- parseAny ---------------- */
test('parseAny dispatches by detection and throws on unknown', () => {
  assert.equal(parseAny('WEBVTT\n').format, 'vtt')
  assert.throws(() => parseAny('纯文本无格式'), /无法识别/)
})

/* ---------------- transforms ---------------- */
test('shift moves both stamps and clamps at zero', () => {
  const cues = [{ start: 1000, end: 2000, text: 'a' }]
  assert.deepEqual(shift(cues, 0.5), [{ start: 1500, end: 2500, text: 'a' }])
  const back = shift(cues, -2)
  assert.equal(back[0].start, 0)
  assert.equal(back[0].end, 0)
  assert.notEqual(cues[0], back[0], 'must not mutate input')
})

test('scale duration mode keeps starts; global mode multiplies all', () => {
  const cues = [{ start: 1000, end: 3000, text: 'a' }]
  const d = scale(cues, 2)
  assert.equal(d[0].start, 1000)
  assert.equal(d[0].end, 5000)
  const g = scale(cues, 2, 'global')
  assert.equal(g[0].start, 2000)
  assert.equal(g[0].end, 6000)
  assert.throws(() => scale(cues, 0), /正数/)
})

test('dedupe/dropEmpty/sortCues/concat compose', () => {
  const a = [{ start: 3000, end: 4000, text: 'b' }, { start: 1000, end: 2000, text: 'a' }]
  const b = [{ start: 1000, end: 2000, text: 'a' }, { start: 5000, end: 6000, text: '' }]
  const merged = concat(a, b)
  // 4 in → 1 exact dup removed → 1 empty-text removed → 2 sorted
  assert.equal(merged.length, 2)
  assert.equal(merged[0].start, 1000)
  assert.equal(merged[1].start, 3000)
  assert.ok(!merged.some((c) => c.start === 5000), 'empty-text cue dropped')
  assert.equal(dedupe(a).length, 2)
  assert.equal(dropEmpty(b).length, 1)
})

test('stats sums the span', () => {
  const s = stats([{ start: 1000, end: 2000, text: 'a' }, { start: 5000, end: 8000, text: 'b' }])
  assert.equal(s.count, 2)
  assert.equal(s.totalMs, 7000)
  assert.equal(s.firstStart, 1000)
})

/* ---------------- validate ---------------- */
test('validate finds overlaps, reversed, empty, unsorted', () => {
  const v = validate([
    { start: 2000, end: 1000, text: 'reversed' },          // 0 reversed
    { start: 1500, end: 2500, text: 'overlaps prev' },     // 1 overlap + unsorted
    { start: 9000, end: 9500, text: '' },                  // 2 empty
    { start: 4000, end: 5000, text: 'ok' },                // 3 fine
  ])
  const types = v.issues.map((i) => i.type)
  assert.ok(types.includes('reversed'))
  assert.ok(types.includes('overlap'))
  assert.ok(types.includes('empty'))
  assert.ok(types.includes('unsorted'))
  assert.equal(v.ok, false)
  assert.equal(validate([{ start: 0, end: 1000, text: 'ok' }]).ok, true)
})

/* ---------------- formatAs ---------------- */
test('formatAs routes and rejects unknown formats', () => {
  const cues = [{ start: 1000, end: 2000, text: 'x' }]
  assert.match(formatAs(cues, 'srt'), /,000/)
  assert.match(formatAs(cues, 'vtt'), /\.000/)
  assert.throws(() => formatAs(cues, 'ass'), /未知输出格式/)
})

console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ', 0 failed'}`)
