/**
 * Subtitle parsers — SRT / WebVTT / LRC → [{ start, end, text }] in
 * milliseconds (int). Parsers are deliberately tolerant: BOM, \r\n, missing
 * cue numbers, `.` vs `,` in SRT timestamps, multiple LRC timestamps per
 * line, and stray metadata are all accepted. Nothing throws on malformed
 * input; problems are collected in `warnings` instead.
 *
 * LRC cues have no end time (end = null) — LRC marks when a line STARTS.
 */

export function parseTs(str) {
  const s = String(str ?? '').trim()
  let m = s.match(/^(\d{1,3}):(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/)
  if (m) {
    const frac = m[4].length === 1 ? +m[4] * 100 : m[4].length === 2 ? +m[4] * 10 : +m[4]
    return ((+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000) + frac
  }
  m = s.match(/^(\d{1,3}):(\d{1,2})[.,](\d{1,3})$/)
  if (m) {
    const frac = m[3].length === 1 ? +m[3] * 100 : m[3].length === 2 ? +m[3] * 10 : +m[3]
    return ((+m[1] * 60 + +m[2]) * 1000) + frac
  }
  m = s.match(/^(\d{1,3}):(\d{1,2})$/)
  if (m) return (+m[1] * 60 + +m[2]) * 1000
  return NaN
}

const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t)
const pushWarning = (warnings, msg) => { if (warnings.length < 50) warnings.push(msg) }

/** Detect 'srt' | 'vtt' | 'lrc', or null when nothing matches. */
export function detectFormat(text) {
  const s = stripBom(String(text ?? ''))
  if (/^\s*WEBVTT/i.test(s)) return 'vtt'
  if (/-->\s*\S/.test(s)) return 'srt'
  if (/^\s*\[\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?\]/m.test(s)) return 'lrc'
  return null
}

/** Parse one timed block's `A --> B` line. Returns [a, b] or null. */
function parseArrowLine(line) {
  const m = line.match(/(\S+)\s*-->\s*(\S+)/)
  if (!m) return null
  const a = parseTs(m[1])
  const b = parseTs(m[2])
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return [a, b]
}

export function parseSrt(text) {
  const warnings = []
  const cues = []
  const blocks = stripBom(String(text ?? '')).replace(/\r\n?/g, '\n').split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '')
    if (!lines.length) continue
    const arrowIdx = lines.findIndex((l) => l.includes('-->'))
    if (arrowIdx < 0) {
      // Any non-empty block without a timing line is content we cannot place —
      // always surface it rather than dropping it silently.
      pushWarning(warnings, `跳过无时间码的块: "${lines[0].slice(0, 40)}"`)
      continue
    }
    const range = parseArrowLine(lines[arrowIdx])
    if (!range) {
      pushWarning(warnings, `时间码无法解析: "${lines[arrowIdx].slice(0, 40)}"`)
      continue
    }
    const text = lines.slice(arrowIdx + 1).join('\n').trim()
    if (!text) pushWarning(warnings, `第 ${cues.length + 1} 条字幕文本为空`)
    // A bare number line before the arrow line is the cue index — ignore it
    // (renumbering happens on output, so out-of-order numbers are harmless).
    cues.push({ start: range[0], end: range[1], text })
  }
  return { cues, warnings }
}

export function parseVtt(text) {
  const warnings = []
  const cues = []
  const lines = stripBom(String(text ?? '')).replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  // Header line.
  if (lines[0]?.trim().toUpperCase().startsWith('WEBVTT')) i = 1
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) { i++; continue }
    const upper = line.toUpperCase()
    if (upper.startsWith('NOTE') || upper.startsWith('STYLE') || upper.startsWith('REGION')) {
      // Skip until a blank line.
      while (i < lines.length && lines[i].trim() !== '') i++
      continue
    }
    // Optional cue id: the line before the arrow line.
    let arrowLine = line
    if (!arrowLine.includes('-->') && i + 1 < lines.length && lines[i + 1].includes('-->')) {
      i++
      arrowLine = lines[i].trim()
    }
    const range = parseArrowLine(arrowLine)
    if (!range) {
      pushWarning(warnings, `跳过无法解析的行: "${line.slice(0, 40)}"`)
      i++
      continue
    }
    i++
    const textLines = []
    while (i < lines.length && lines[i].trim() !== '') { textLines.push(lines[i]); i++ }
    const text = textLines.join('\n').trim()
    if (!text) pushWarning(warnings, `第 ${cues.length + 1} 条字幕文本为空`)
    cues.push({ start: range[0], end: range[1], text })
  }
  return { cues, warnings }
}

const LRC_META = /^\[(ar|ti|al|by|offset|re|ve|length|au|tool):/i

export function parseLrc(text) {
  const warnings = []
  const cues = []
  const untimed = []
  for (const raw of stripBom(String(text ?? '')).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (LRC_META.test(line)) continue
    // Grab every leading [mm:ss.xx] timestamp on the line.
    const stamps = []
    let rest = line
    let m
    while ((m = rest.match(/^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/))) {
      const frac = m[3] ? (m[3].length === 1 ? +m[3] * 100 : m[3].length === 2 ? +m[3] * 10 : +m[3]) : 0
      stamps.push((+m[1] * 60 + +m[2]) * 1000 + frac)
      rest = rest.slice(m[0].length)
    }
    const content = rest.trim()
    if (!stamps.length) {
      if (content) untimed.push(content)
      continue
    }
    if (!content) pushWarning(warnings, `时间戳 "${stamps[0]}" 行无文本`)
    for (const t of stamps) cues.push({ start: t, end: null, text: content })
  }
  cues.sort((a, b) => a.start - b.start)
  return { cues, warnings, untimed }
}

/** Auto-detect then parse. Throws only when the format is unrecognizable. */
export function parseAny(text) {
  const fmt = detectFormat(text)
  if (!fmt) throw new Error('无法识别字幕格式(支持 SRT / WebVTT / LRC)')
  const parsed = fmt === 'vtt' ? parseVtt(text) : fmt === 'lrc' ? parseLrc(text) : parseSrt(text)
  return { format: fmt, ...parsed }
}
