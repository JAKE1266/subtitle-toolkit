# subtitle-toolkit

[![CI](https://github.com/JAKE1266/subtitle-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/JAKE1266/subtitle-toolkit/actions/workflows/ci.yml)

> 源码：<https://github.com/JAKE1266/subtitle-toolkit> · 安装：`npm i github:JAKE1266/subtitle-toolkit`（或直接克隆运行）

零依赖字幕工具箱:**SRT / WebVTT / LRC** 解析、互转、平移、缩放、合并与校验。纯 Node.js(≥18),无任何第三方依赖,既是可编程的库,也是开箱即用的 CLI。

> 为什么再造一个轮子:现有字幕工具要么是重型 GUI,要么依赖一大串包。这个项目用不到 600 行零依赖 JS 覆盖视频工作流里最高频的字幕操作——配合本地 AI 视频生成工具(如 [agnes-video-studio](../agnes-video-studio))使用尤其顺手。

## 快速开始

```bash
npm test                    # 32 项断言
node cli.js info sample.srt
```

## CLI

```
subtk detect   <file>                    识别格式(输出 srt / vtt / lrc)
subtk info     <file>                    条数 / 总跨度 / 解析警告
subtk validate <file>                    重叠 / 倒挂 / 空文本 / 乱序检查(有问题退出码 1)
subtk convert  <file> --to srt|vtt|lrc [--out FILE]
subtk shift    <file> --delta 2.5        [--out FILE]   正数后移,负数前移,钳制在 0
subtk scale    <file> --factor 1.05 [--mode duration|global] [--out FILE]
```

- `shift` 整体平移:字幕比画面晚 2 秒就 `--delta -2`。
- `scale --mode duration`(默认)保持每句起点、拉伸时长——修"开头对得上、越往后偏得越多"。
- `scale --mode global` 全时间轴乘系数——修"源视频整体快了/慢了"(如 23.976→25fps 转制)。
- `convert` 自动排序、去完全重复、删空文本并重新编号。
- 不带 `--out` 时结果写到 stdout,方便管道拼接。

## 库 API

```js
import { parseAny, detectFormat, parseSrt, parseVtt, parseLrc } from './lib/parse.js'
import { formatAs } from './lib/format.js'
import { shift, scale, sortCues, dedupe, dropEmpty, concat, stats } from './lib/transform.js'
import { validate } from './lib/validate.js'

const { format, cues, warnings } = parseAny(fs.readFileSync('a.srt', 'utf8'))
const moved = shift(cues, -1.5)                    // 纯函数,不改入参
fs.writeFileSync('b.srt', formatAs(moved, 'srt'))
```

- 统一内部表示:`cues = [{ start: <ms int>, end: <ms int|null>, text }]`,LRC 无结束时间(`end: null`)
- 解析器**宽容不抛错**:BOM、`\r\n`、SRT 序号缺失/乱序、逗号或点毫秒、LRC 一行多时间戳、VTT 的 NOTE/STYLE 块都能处理;丢弃的内容进 `warnings`,绝不静默丢失
- `validate()` 返回 `{ ok, issues }`,`issues` 带 `type`(overlap / reversed / empty / unsorted / zero-length)和人类可读中文信息

## 文件结构

```
subtitle-toolkit/
├── cli.js               # CLI 入口(detect/info/validate/convert/shift/scale)
├── lib/
│   ├── parse.js         # 三种格式解析 + 格式探测 + 统一 parseAny
│   ├── format.js        # 时间戳格式化 + 三种格式输出
│   ├── transform.js     # shift/scale/sort/dedupe/dropEmpty/concat/stats(全纯函数)
│   └── validate.js      # 质量校验
└── test/                # core(18) + cli(8) + syntax 守护(6) = 32 项
```

## 设计约定

- **零依赖**:运行时只用 `node:` 内置模块
- **纯函数**:transform 不改入参,方便组合与测试
- **不静默丢数据**:解析器丢弃任何内容都记录到 warnings
- `package.json` 声明 `"type":"module"`,语法守护测试强制全文件 ESM 解析

## License

MIT
