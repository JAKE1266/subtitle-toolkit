#!/usr/bin/env node
/**
 * subtk — zero-dependency subtitle toolkit CLI.
 *
 *   subtk detect   <file>                    识别格式
 *   subtk info     <file>                    条数/时长/警告概览
 *   subtk validate <file>                    重叠/乱序/空文本检查
 *   subtk convert  <file> --to srt|vtt|lrc [--out FILE]
 *   subtk shift    <file> --delta 2.5        [--out FILE]   正负秒
 *   subtk scale    <file> --factor 1.05 [--mode global] [--out FILE]
 *
 * shift/scale/convert 不带 --out 时写到 stdout。
 */
import fs from 'node:fs'
import { detectFormat, parseAny } from './lib/parse.js'
import { formatAs } from './lib/format.js'
import { shift, scale, stats, sortCues, dedupe, dropEmpty } from './lib/transform.js'
import { validate } from './lib/validate.js'

function usage() {
  return [
    'subtk — 零依赖字幕工具箱',
    '',
    '用法:',
    '  subtk detect   <file>                    识别格式',
    '  subtk info     <file>                    条数 / 时长 / 警告',
    '  subtk validate <file>                    重叠 / 乱序 / 空文本检查',
    '  subtk convert  <file> --to srt|vtt|lrc [--out FILE]',
    '  subtk shift    <file> --delta 2.5        [--out FILE]',
    '  subtk scale    <file> --factor 1.05 [--mode duration|global] [--out FILE]',
    '',
    'shift/scale/convert 不带 --out 时输出到 stdout。',
  ].join('\n')
}

function parseArgv(argv) {
  const pos = []
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) { opts[key] = next; i++ }
      else opts[key] = true
    } else pos.push(a)
  }
  return { pos, opts }
}

function readInput(file) {
  if (!file) throw new Error('缺少输入文件参数')
  if (!fs.existsSync(file)) throw new Error(`文件不存在: ${file}`)
  return fs.readFileSync(file, 'utf8')
}

function writeOut(outFile, text, hintFormat) {
  if (outFile) {
    fs.writeFileSync(outFile, text, 'utf8')
    console.log(`已写入 ${outFile}`)
  } else {
    process.stdout.write(text.endsWith('\n') ? text : text + '\n')
    if (process.stdout.isTTY && hintFormat) console.error(`(提示:加 --out out.${hintFormat} 保存到文件)`)
  }
}

function loadCues(file) {
  const text = readInput(file)
  const { format, cues, warnings } = parseAny(text)
  return { format, cues, warnings }
}

export function main(argv = process.argv.slice(2)) {
  const { pos, opts } = parseArgv(argv)
  const cmd = pos[0]
  const file = pos[1]

  if (!cmd || cmd === 'help' || opts.help) { console.log(usage()); return 0 }

  switch (cmd) {
    case 'detect': {
      const text = readInput(file)
      const fmt = detectFormat(text)
      if (!fmt) { console.error('无法识别格式'); return 1 }
      console.log(fmt)
      return 0
    }
    case 'info': {
      const { format, cues, warnings } = loadCues(file)
      const s = stats(cues)
      console.log(`格式: ${format}`)
      console.log(`条数: ${s.count}`)
      console.log(`跨度: ${s.totalMs}ms (${(s.totalMs / 1000).toFixed(2)}s)`)
      if (warnings.length) console.log(`解析警告: ${warnings.length} 条(前 5 条)`)
      for (const w of warnings.slice(0, 5)) console.log(`  ⚠ ${w}`)
      return 0
    }
    case 'validate': {
      const { cues, warnings } = loadCues(file)
      const v = validate(cues)
      for (const w of warnings.slice(0, 5)) console.error(`解析警告: ${w}`)
      if (v.ok) { console.log('✓ 未发现问题'); return 0 }
      console.log(`✗ 发现 ${v.issues.length} 个问题:`)
      for (const it of v.issues.slice(0, 20)) console.log(`  [${it.type}] ${it.message}`)
      return 1
    }
    case 'convert': {
      const to = String(opts.to ?? '')
      if (!['srt', 'vtt', 'lrc'].includes(to)) throw new Error('--to 必须是 srt | vtt | lrc')
      const { cues } = loadCues(file)
      const cleaned = sortCues(dropEmpty(dedupe(cues)))
      writeOut(opts.out, formatAs(cleaned, to), to)
      return 0
    }
    case 'shift': {
      const { format, cues } = loadCues(file)
      const moved = sortCues(shift(dedupe(cues), Number(opts.delta)))
      writeOut(opts.out, formatAs(moved, format), format)
      return 0
    }
    case 'scale': {
      const { format, cues } = loadCues(file)
      const mode = opts.mode === 'global' ? 'global' : 'duration'
      const scaled = sortCues(scale(dedupe(cues), Number(opts.factor), mode))
      writeOut(opts.out, formatAs(scaled, format), format)
      return 0
    }
    default:
      throw new Error(`未知命令: ${cmd}\n\n${usage()}`)
  }
}

if (process.argv[1] && (process.argv[1].endsWith('cli.js') || process.argv[1].endsWith('subtk'))) {
  try {
    process.exitCode = main()
  } catch (e) {
    console.error(`错误: ${e.message}`)
    process.exitCode = 1
  }
}
