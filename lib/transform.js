/**
 * Transforms — operate on cue arrays (ms ints). All functions are pure:
 * they return new arrays and never mutate their input.
 */

const clamp0 = (ms) => Math.max(0, Math.round(ms))

/** Shift every cue by deltaSec (negative moves earlier). Clamps at 0. */
export function shift(cues, deltaSec) {
  const delta = Math.round(Number(deltaSec) * 1000)
  if (!Number.isFinite(delta)) throw new Error('--delta 必须是数字(秒),可为负')
  return cues.map((c) => ({
    ...c,
    start: clamp0(c.start + delta),
    end: c.end == null ? null : clamp0(c.end + delta),
  }))
}

/**
 * Rescale timings.
 *   mode 'duration' (default): keep each start, stretch its duration by
 *     factor — fixes "逐句偏移越来越大" when line lengths were right at the
 *     start but drift late in the file.
 *   mode 'global': start *= factor, end *= factor — fixes a uniformly faster
 *     or slower source (e.g. 23.976 → 25 fps transfer).
 */
export function scale(cues, factor, mode = 'duration') {
  const f = Number(factor)
  if (!Number.isFinite(f) || f <= 0) throw new Error('--factor 必须是正数')
  return cues.map((c) => {
    if (mode === 'global') {
      return { ...c, start: clamp0(c.start * f), end: c.end == null ? null : clamp0(c.end * f) }
    }
    const dur = c.end == null ? null : c.end - c.start
    return {
      ...c,
      start: clamp0(c.start),
      end: dur == null ? null : clamp0(c.start + dur * f),
    }
  })
}

/** Sort by start time (stable), then by end. */
export function sortCues(cues) {
  return [...cues]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.start - b.c.start) || (a.i - b.i) || ((a.c.end ?? 0) - (b.c.end ?? 0)))
    .map((x) => x.c)
}

/** Drop cues with no text. */
export function dropEmpty(cues) {
  return cues.filter((c) => String(c.text ?? '').trim() !== '')
}

/** Remove exact duplicates (same start, end and text). */
export function dedupe(cues) {
  const seen = new Set()
  const out = []
  for (const c of cues) {
    const key = `${c.start}|${c.end}|${c.text}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

/**
 * Merge several cue arrays into one clean track: dedupe identical cues, drop
 * empty text, sort. This is the "合并两个字幕文件" operation, so it cleans
 * the way the CLI's convert does.
 */
export function concat(...lists) {
  return sortCues(dropEmpty(dedupe(lists.flat())))
}

/** Total spoken span and per-cue summary for `info` output. */
export function stats(cues) {
  const timed = cues.filter((c) => c.start != null)
  if (!timed.length) return { count: cues.length, totalMs: 0, firstStart: null, lastEnd: null }
  const firstStart = Math.min(...timed.map((c) => c.start))
  const ends = timed.map((c) => c.end ?? c.start)
  return {
    count: cues.length,
    totalMs: Math.max(...ends) - firstStart,
    firstStart,
    lastEnd: Math.max(...ends),
  }
}
