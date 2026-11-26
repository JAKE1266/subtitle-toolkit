/**
 * Formatters — cues (ms) back to SRT / WebVTT / LRC text.
 * Cue numbers are regenerated on output; callers never store them.
 */

const p2 = (n) => String(n).padStart(2, '0')
const p3 = (n) => String(n).padStart(3, '0')

function parts(ms) {
  const t = Math.max(0, Math.round(ms))
  const h = Math.floor(t / 3600000)
  const m = Math.floor((t % 3600000) / 60000)
  const s = Math.floor((t % 60000) / 1000)
  const rem = t % 1000
  return { h, m, s, rem }
}

export function fmtSrtTs(ms) {
  const { h, m, s, rem } = parts(ms)
  return `${p2(h)}:${p2(m)}:${p2(s)},${p3(rem)}`
}

export function fmtVttTs(ms) {
  const { h, m, s, rem } = parts(ms)
  return `${p2(h)}:${p2(m)}:${p2(s)}.${p3(rem)}`
}

/** LRC shows minutes:seconds.hundredths (no hour part; hours fold into minutes). */
export function fmtLrcTs(ms) {
  const t = Math.max(0, Math.round(ms))
  const minutes = Math.floor(t / 60000)
  const secs = Math.floor((t % 60000) / 1000)
  const hundredths = Math.round((t % 1000) / 10) % 100
  return `${p2(minutes)}:${p2(secs)}.${p2(hundredths)}`
}

export function formatSrt(cues) {
  return cues
    .map((c, i) => `${i + 1}\n${fmtSrtTs(c.start)} --> ${fmtSrtTs(c.end)}\n${String(c.text ?? '')}`)
    .join('\n\n') + '\n'
}

export function formatVtt(cues) {
  return 'WEBVTT\n\n' + cues
    .map((c) => `${fmtVttTs(c.start)} --> ${fmtVttTs(c.end)}\n${String(c.text ?? '')}`)
    .join('\n\n') + '\n'
}

export function formatLrc(cues) {
  return cues
    .filter((c) => c.start != null)
    .map((c) => `[${fmtLrcTs(c.start)}]${String(c.text ?? '').replace(/\n/g, ' ')}`)
    .join('\n') + '\n'
}

/** Format cues into the named format ('srt' | 'vtt' | 'lrc'). */
export function formatAs(cues, format) {
  if (format === 'srt') return formatSrt(cues)
  if (format === 'vtt') return formatVtt(cues)
  if (format === 'lrc') return formatLrc(cues)
  throw new Error(`未知输出格式: ${format}(支持 srt / vtt / lrc)`)
}
