/**
 * Validation — find the problems people actually hit: overlapping cues,
 * reversed timings, empty text, out-of-order starts. Pure reporting; the
 * caller decides what to do.
 */
import { sortCues } from './transform.js'

export function validate(cues) {
  const issues = []
  const timed = cues
    .map((c, i) => ({ i, start: c.start, end: c.end, text: String(c.text ?? '') }))
    .filter((c) => c.start != null)

  for (const c of timed) {
    if (c.end != null && c.end < c.start) {
      issues.push({ type: 'reversed', index: c.i, message: `第 ${c.i + 1} 条结束时间早于开始时间` })
    }
    if (c.end != null && c.end === c.start && c.text) {
      issues.push({ type: 'zero-length', index: c.i, message: `第 ${c.i + 1} 条时长为 0` })
    }
    if (!c.text.trim()) {
      issues.push({ type: 'empty', index: c.i, message: `第 ${c.i + 1} 条文本为空` })
    }
  }

  const sorted = sortCues(timed)
  const unsorted = timed.some((c, i) => sorted[i] !== c)
  if (unsorted) issues.push({ type: 'unsorted', index: null, message: '字幕未按时间排序' })

  for (let k = 1; k < sorted.length; k++) {
    const prev = sorted[k - 1]
    const cur = sorted[k]
    if (prev.end != null && prev.end > cur.start) {
      issues.push({
        type: 'overlap',
        index: cur.i,
        message: `第 ${prev.i + 1} 条与第 ${cur.i + 1} 条重叠(${prev.end - cur.start}ms)`,
      })
    }
  }
  return { ok: issues.length === 0, issues }
}
