// Builds the backdrop SVG: pixel Leesho in front of a chalkboard carrying the
// Ali & Leesho logo, the channel handle and live session numbers.
import type { Mood, Stats } from '../types'

import { FRAMES, LEESHO_COLORS, LOGO, SPRITE, WORDS } from './art'
import { clock } from './prayer'
import { CITIES } from './cities'
import type { CalendarId, DayInfo, DatesShown } from './prayer'

// ---------- pixel font (3x5, a few wider glyphs) ----------
const GLYPHS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '%': ['101', '001', '010', '100', '101'],
  '$': ['011', '110', '010', '011', '110'],
  '.': ['0', '0', '0', '0', '1'],
  ':': ['0', '1', '0', '1', '0'],
  '-': ['000', '000', '111', '000', '000'],
  ' ': ['00', '00', '00', '00', '00'],
  '@': ['01110', '10001', '10111', '10110', '01111'],
  C: ['111', '100', '100', '100', '111'],
  T: ['111', '010', '010', '010', '010'],
  X: ['101', '101', '010', '101', '101'],
  H: ['101', '101', '111', '101', '101'],
  D: ['110', '101', '101', '101', '110'],
  a: ['000', '011', '101', '101', '011'],
  l: ['10', '10', '10', '10', '11'],
  i: ['1', '0', '1', '1', '1'],
  w: ['00000', '10001', '10101', '10101', '01010'],
  e: ['000', '111', '111', '100', '111'],
  s: ['000', '011', '110', '011', '110'],
  h: ['100', '100', '111', '101', '101'],
  o: ['000', '111', '101', '101', '111'],
}

/** Run-length path of a text in the pixel font, and its width. */
function text(str: string, x0: number, y0: number): { d: string; w: number } {
  let d = ''
  let x = x0

  for (const ch of str) {
    const g = GLYPHS[ch] ?? GLYPHS[' ']!

    g.forEach((row, y) => {
      let c = 0

      while (c < row.length) {
        if (row[c] !== '1') {
          c += 1
          continue
        }
        const s = c

        while (c < row.length && row[c] === '1') c += 1
        d += `M${x + s} ${y0 + y}h${c - s}v1h${s - c}z`
      }
    })
    x += g[0]!.length + 1
  }

  return { d, w: x - x0 - 1 }
}

// ---------- tiny social icons (7x7) ----------
const ICONS: { grid: string[]; colors: Record<string, string> }[] = [
  {
    // YouTube
    grid: ['.rrrrr.', 'rrwrrrr', 'rrwwrrr', 'rrwwwrr', 'rrwwrrr', 'rrwrrrr', '.rrrrr.'],
    colors: { r: '#ff2b2b', w: '#ffffff' },
  },
  {
    // TikTok
    grid: ['.kkkkk.', 'kkkwpkk', 'kkkwwpk', 'kkkwkkk', 'kcwwkkk', 'kcwwkkk', '.kkkkk.'],
    colors: { k: '#111111', w: '#ffffff', p: '#fe2c55', c: '#25f4ee' },
  },
  {
    // Instagram
    grid: ['.vvmmm.', 'v....my', 'v.mmm.y', 'm.m.m.y', 'm.mmm.y', 'm.....y', '.myyyy.'],
    colors: { v: '#8a3ab9', m: '#e1306c', y: '#fcaf45' },
  },
]

function grid(rows: string[], colors: Record<string, string>, x0: number, y0: number): string {
  const paths: Record<string, string> = {}

  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const k = row[x]!

      if (k === '.') continue
      paths[k] = (paths[k] ?? '') + `M${x0 + x} ${y0 + y}h1v1h-1z`
    }
  })

  return Object.entries(paths)
    .map(([k, d]) => `<path fill="${colors[k]}" d="${d}"/>`)
    .join('')
}

function sprite(name: string): string {
  const f = FRAMES[name] ?? FRAMES.calm!

  return Object.entries(f)
    .map(([k, d]) => `<path fill="${LEESHO_COLORS[k]}" d="${d}"/>`)
    .join('')
}

// ---------- moods ----------
type Beat = [frame: string, seconds: number]
type Act = {
  beats: Beat[]
  motion?: 'bob' | 'hop' | 'shake' | 'shiver' | 'pace' | 'tap'
  writes?: boolean
  alt: string
}

// While Claude waits for Ali, Leesho moves on to another little scene every
// few seconds (the variant counter in register.tsx); the first is the wave.
const RESTING: Act[] = [
  {
    beats: [['greet', 0.45], ['calm', 0.45], ['greet', 0.45], ['calm', 2.4], ['blink', 0.16]],
    alt: 'Leesho waves: Claude is waiting for you',
  },
  { beats: [['typing', 1]], motion: 'bob', alt: 'Leesho sits at his laptop' },
  { beats: [['phone', 2.6], ['side_eye', 1.2]], alt: 'Leesho checks his phone' },
  { beats: [['seated_calm', 3.4], ['sit_floor', 2.2]], alt: 'Leesho sits down for a rest' },
  { beats: [['counting_fingers', 1.6], ['shrug', 1.4]], alt: 'Leesho counts on his fingers and shrugs' },
  { beats: [['thumbs_up_viewer', 1.6], ['salute', 1.4], ['calm', 1]], alt: 'Leesho gives a thumbs up and a salute' },
  { beats: [['listen', 2.2], ['side_eye', 1.4], ['blink', 0.2]], alt: 'Leesho listens' },
  { beats: [['starstruck', 1.2], ['happy', 1]], motion: 'hop', alt: 'Leesho is starstruck' },
  { beats: [['calm', 3.6], ['blink', 0.16]], alt: 'Leesho stands calmly by the chalkboard' },
]

// While Claude works, Leesho takes turns writing on the board and pacing.
const WORKING: Act[] = [
  { beats: [['point', 1]], motion: 'bob', writes: true, alt: 'Leesho writes on the chalkboard' },
  {
    beats: [['walk_1', 0.16], ['walk_2', 0.16], ['walk_3', 0.16], ['walk_4', 0.16]],
    motion: 'pace',
    writes: true,
    alt: 'Leesho paces by the chalkboard while Claude works',
  },
]

// Prayer time: Leesho sits on his rug, knocks on the glass, then points at the times.
const PRAYING: Act = {
  beats: [['pray_knock', 1.5], ['pray_point', 2.5]],
  motion: 'tap',
  alt: 'Leesho sits on his prayer rug and knocks on the glass: it is time to pray',
}

const ACTS: Record<Mood | 'sweat' | 'tired', Act> = {
  idle: RESTING[RESTING.length - 1]!,
  thinking: { beats: [['think', 1.6], ['idea', 0.9]], motion: 'bob', alt: 'Leesho is thinking' },
  working: WORKING[0]!,
  tool: WORKING[0]!,
  done: { beats: [['cheer', 0.4], ['happy', 0.4], ['laugh', 0.4]], motion: 'hop', alt: 'Leesho cheers: the turn is done' },
  waiting: {
    beats: [['greet', 0.45], ['calm', 0.45], ['greet', 0.45], ['calm', 2.4], ['blink', 0.16]],
    alt: 'Leesho waves: Claude is waiting for you',
  },
  error: { beats: [['facepalm', 1]], motion: 'shake', alt: 'Leesho facepalms: something failed' },
  aborted: { beats: [['sad', 1]], alt: 'Leesho is sad: the turn was stopped' },
  sweat: { beats: [['nervous_sweating', 1]], motion: 'shiver', alt: 'Leesho sweats: the context window is nearly full' },
  tired: { beats: [['yawn', 1.4], ['calm', 2.2]], alt: 'Leesho yawns: the usage limit is close' },
}

function pick(mood: Mood, stats: Stats, variant: number): Act {
  const resting = mood === 'idle' || mood === 'waiting'

  if (resting) {
    // Every other scene shows how he feels about the limits, when they are close.
    if (variant % 2 === 1 && (stats.fiveHour ?? 0) >= 85) return ACTS.tired
    if (variant % 2 === 1 && (stats.context ?? 0) >= 80) return ACTS.sweat
    const start = mood === 'waiting' ? 0 : 1

    return RESTING[(start + variant) % RESTING.length]!
  }
  if (mood === 'working' || mood === 'tool') return WORKING[variant % WORKING.length]!

  return ACTS[mood]
}

/** One element per beat; each shows only during its slice of the loop. Each
 * distinct pose is drawn once in <defs> and reused, to keep the scene small. */
function frames(act: Act): { css: string; body: string; defs: string } {
  const total = act.beats.reduce((n, [, s]) => n + s, 0)
  let at = 0
  let css = ''
  let body = ''
  const names = [...new Set(act.beats.map(([name]) => name))]
  const defs = names.map(name => `<g id="leesho-f-${name}">${sprite(name)}</g>`).join('')

  act.beats.forEach(([name, secs], i) => {
    const a = (at / total) * 100
    const b = ((at + secs) / total) * 100
    at += secs

    if (act.beats.length > 1) {
      const kf =
        i === 0
          ? `0%{opacity:1}${b.toFixed(3)}%{opacity:0}`
          : `0%{opacity:0}${a.toFixed(3)}%{opacity:1}${b.toFixed(3)}%{opacity:0}`
      css += `@keyframes k${i}{${kf}}.b${i}{animation:k${i} ${total}s step-end infinite}`
    }
    body += `<g class="b${i}" opacity="${i === 0 ? 1 : 0}"><use href="#leesho-f-${name}"/></g>`
  })

  return { css, body, defs }
}

const MOTION_CSS: Record<NonNullable<Act['motion']>, string> = {
  bob: '@keyframes bob{0%{transform:translate(0px,0px)}50%{transform:translate(0px,-1px)}}.mv{animation:bob 0.9s step-end infinite}',
  hop: '@keyframes hop{0%{transform:translate(0px,0px)}25%{transform:translate(0px,-3px)}50%{transform:translate(0px,-5px)}75%{transform:translate(0px,-2px)}}.mv{animation:hop 0.8s step-end infinite}',
  shake: '@keyframes shake{0%{transform:translate(0px,0px)}20%{transform:translate(-1px,0px)}40%{transform:translate(1px,0px)}60%{transform:translate(0px,0px)}}.mv{animation:shake 1.6s step-end infinite}',
  shiver: '@keyframes shiver{0%{transform:translate(0px,0px)}50%{transform:translate(1px,0px)}}.mv{animation:shiver 0.3s step-end infinite}',
  tap:
    '@keyframes tap{0%{transform:translate(0px,0px)}6%{transform:translate(0px,1px)}12%{transform:translate(0px,0px)}' +
    '18%{transform:translate(0px,1px)}24%{transform:translate(0px,0px)}30%{transform:translate(0px,1px)}36%{transform:translate(0px,0px)}}' +
    '.mv{animation:tap 4s step-end infinite}',
  pace:
    '@keyframes pace{0%{transform:translate(0px,0px)}50%{transform:translate(-28px,0px)}100%{transform:translate(0px,0px)}}' +
    '@keyframes face-out{0%{opacity:1}50%{opacity:0}}@keyframes face-back{0%{opacity:0}50%{opacity:1}}' +
    '.mv{animation:pace 7.2s linear infinite}.face-out{animation:face-out 7.2s step-end infinite}.face-back{animation:face-back 7.2s step-end infinite}',
}

// ---------- board ----------
const CHALK = '#e9efe4'
const DIM = '#9fb6aa'
const SCRIBBLE = '#c9d6cc'

// Board geometry, in stage pixels.
const BW = 128 // board width
const BH = 190 // board height, frame included
const WRITE_TOP = 104 // first writing row
const ROW = 7 // writing row pitch
// Leesho stands in front of the board's lower half, so the chalk stops above his head.
const HEAD_Y = BH + 22 - SPRITE.h + 4
const ROWS = Math.floor((HEAD_Y - 4 - WRITE_TOP) / ROW) // rows that fit above Leesho

function barColor(p: number): string {
  if (p >= 85) return '#ec5a4f'
  if (p >= 60) return '#e8b04a'

  return '#3fb8a6'
}

function stat(label: string, value: number | undefined, y: number, bar: boolean): string {
  const l = text(label, 9, y)
  let out = `<path fill="${DIM}" d="${l.d}"/>`
  const shown =
    value === undefined ? '--' : bar ? `${Math.round(Math.max(0, Math.min(100, value)))}%` : `$${value.toFixed(2)}`
  const w = text(shown, 0, y).w
  const v = text(shown, BW - 9 - w, y)

  if (bar) {
    const p = Math.max(0, Math.min(100, value ?? 0))
    const len = 62
    const fill = Math.round((p / 100) * (len - 2))

    out += `<rect x="27" y="${y}" width="${len}" height="5" fill="#16302a"/>`
    out += `<rect x="28" y="${y + 1}" width="${len - 2}" height="3" fill="#24463c"/>`
    if (fill > 0) out += `<rect x="28" y="${y + 1}" width="${fill}" height="3" fill="${barColor(p)}"/>`
  }

  return out + `<path fill="${CHALK}" d="${v.d}"/>`
}

/** A cheap repeatable random: the same row always gets the same words. */
function rand(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453

  return x - Math.floor(x)
}

/** Chalk "words" for one writing row, as [x, width] dashes. */
function rowWords(r: number): [number, number][] {
  const out: [number, number][] = []
  let x = 9 + Math.floor(rand(r * 7) * 4)

  for (let i = 0; i < 20; i += 1) {
    const w = 4 + Math.floor(rand(r * 31 + i * 7) * 13)

    if (x + w > BW - 10) break
    out.push([x, w])
    x += w + 3
  }

  return out
}

/** The writing area: rows already full, then the row being written while Leesho works. */
function writing(context: number | undefined, isWriting: boolean): { css: string; body: string } {
  const full = Math.min(ROWS, Math.round(((context ?? 0) / 100) * ROWS))
  let body = ''
  let css = ''

  for (let r = 0; r < full; r += 1) {
    const y = WRITE_TOP + r * ROW
    body += rowWords(r)
      .map(([x, w]) => `<rect x="${x}" y="${y}" width="${w}" height="2" fill="${SCRIBBLE}" opacity="0.8"/>`)
      .join('')
  }

  if (isWriting && full < ROWS) {
    // The next row appears word by word, then starts again.
    const y = WRITE_TOP + full * ROW
    const words = rowWords(full)
    const n = words.length

    words.forEach(([x, w], i) => {
      const at = ((i + 1) / (n + 2)) * 100
      css += `@keyframes wr${i}{0%{opacity:0}${at.toFixed(2)}%{opacity:1}}.wr${i}{animation:wr${i} 4.8s step-end infinite}`
      body += `<rect class="wr${i}" x="${x}" y="${y}" width="${w}" height="2" fill="${CHALK}" opacity="0"/>`
    })
  }

  return { css, body }
}

function board(stats: Stats, isWriting: boolean): { css: string; body: string } {
  let out = ''
  // frame and slate
  out += `<rect x="0" y="0" width="${BW}" height="${BH}" fill="#6b3f22"/>`
  out += `<rect x="1" y="1" width="${BW - 2}" height="2" fill="#9a643a"/>`
  out += `<rect x="4" y="4" width="${BW - 8}" height="${BH - 10}" fill="#1d3a31"/>`
  out += `<rect x="4" y="4" width="${BW - 8}" height="1" fill="#264a3f"/>`
  // chalk tray
  out += `<rect x="2" y="${BH - 6}" width="${BW - 4}" height="4" fill="#9a643a"/>`
  out += `<rect x="${BW - 30}" y="${BH - 8}" width="9" height="2" fill="#f4f1e8"/>`
  out += `<rect x="${BW - 17}" y="${BH - 8}" width="6" height="2" fill="#f2c4c0"/>`
  // logo
  const lx = Math.round((BW - LOGO.w) / 2)
  out += `<g transform="translate(${lx} 8)">`
  for (const [k, d] of Object.entries(LOGO.paths)) out += `<path fill="${LOGO.colors[k]}" d="${d}"/>`
  out += '</g>'
  // socials: three icons + handle
  const handle = text('@ali.wa.leesho', 0, 0)
  const rowW = 3 * 9 + 2 + handle.w
  let x = Math.round((BW - rowW) / 2)
  const sy = 49
  ICONS.forEach(icon => {
    out += grid(icon.grid, icon.colors, x, sy)
    x += 9
  })
  out += `<path fill="${CHALK}" d="${text('@ali.wa.leesho', x + 2, sy + 1).d}"/>`
  out += `<rect x="9" y="61" width="${BW - 18}" height="1" fill="#3d5f53"/>`
  // numbers
  out += stat('CTX', stats.context, 66, true)
  out += stat('5H', stats.fiveHour, 74, true)
  out += stat('7D', stats.sevenDay, 82, true)
  out += stat('$', stats.costUsd, 90, false)
  out += `<rect x="9" y="${WRITE_TOP - 6}" width="${BW - 18}" height="1" fill="#3d5f53"/>`
  // writing area
  const w = writing(stats.context, isWriting)

  return { css: w.css, body: out + w.body }
}

/** Sweat drops beside Leesho's head: more of them as the context fills. */
function sweat(context: number | undefined): { css: string; body: string } {
  const c = context ?? 0
  const n = c >= 75 ? 3 : c >= 60 ? 2 : c >= 45 ? 1 : 0

  if (n === 0) return { css: '', body: '' }
  const spots: [number, number][] = [[62, 16], [14, 20], [66, 26]]
  let body = ''

  for (let i = 0; i < n; i += 1) {
    const [x, y] = spots[i]!
    body +=
      `<g class="dr dr${i}"><rect x="${x}" y="${y}" width="2" height="1" fill="#bfe6ff"/>` +
      `<rect x="${x - 1}" y="${y + 1}" width="4" height="2" fill="#8fd0ff"/>` +
      `<rect x="${x}" y="${y + 3}" width="2" height="1" fill="#5fb4ea"/></g>`
  }
  const css =
    '@keyframes drip{0%{transform:translate(0px,0px);opacity:1}40%{transform:translate(0px,2px);opacity:1}' +
    '80%{transform:translate(0px,5px);opacity:0}100%{transform:translate(0px,0px);opacity:0}}' +
    '.dr{animation:drip 1.4s step-end infinite}.dr1{animation-delay:-0.5s}.dr2{animation-delay:-0.9s}'

  return { css, body }
}

// ---------- sky, moon, dates and the prayer board ----------
const SKY_W = 1300 // the frame is 1300x1000: wide windows crop sky from the top, never the sides
const SCALE = 1.8 // stage pixels to frame units (matches the size approved at 1600 wide)
const CREAM = '#fff6dc'
const INK = '#1b2440'
const GOLD = '#f3c75a'

/** A pixel-font number (3x5 glyphs) scaled by k, its left edge at x. */
function num(str: string, x: number, y: number, k: number, fill: string): { svg: string; w: number } {
  const t = text(str, 0, 0)

  return { svg: `<path transform="translate(${x} ${y}) scale(${k})" fill="${fill}" d="${t.d}"/>`, w: t.w * k }
}

/** A pre-rendered Arabic word (Tahoma 11px), its left edge at x. */
function word(key: string, x: number, y: number, fill: string): { svg: string; w: number } {
  const w = WORDS[key]

  if (w === undefined) return { svg: '', w: 0 }

  return { svg: `<path transform="translate(${x} ${y})" fill="${fill}" d="${w.d}"/>`, w: w.w }
}

const wordWidth = (key: string): number => WORDS[key]?.w ?? 0
const numWidth = (str: string, k: number): number => text(str, 0, 0).w * k

type Token = { kind: 'word' | 'num'; value: string }

/** Lays tokens right to left, as Arabic reads, ending at `right`; returns the svg. */
function rtlLine(tokens: Token[], right: number, y: number, fill: string, shadow?: string): string {
  let x = right
  let out = ''

  for (const t of tokens) {
    const w = t.kind === 'word' ? wordWidth(t.value) : numWidth(t.value, 2)
    x -= w
    const draw = (dx: number, dy: number, c: string): string =>
      t.kind === 'word' ? word(t.value, x + dx, y + dy, c).svg : num(t.value, x + dx, y + dy + 3, 2, c).svg
    if (shadow !== undefined) out += draw(1, 1, shadow)
    out += draw(0, 0, fill)
    x -= 4
  }

  return out
}

function sky(): { defs: string; body: string; css: string } {
  const defs =
    '<linearGradient id="leesho-sky" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#0f1834"/><stop offset="0.3" stop-color="#1e2d57"/>' +
    '<stop offset="0.55" stop-color="#6c6a90"/><stop offset="0.75" stop-color="#e3c9a2"/>' +
    '<stop offset="1" stop-color="#f3e6c8"/></linearGradient>'
  let body = `<rect x="0" y="0" width="${SKY_W}" height="1000" fill="url(#leesho-sky)"/>`

  // Stars over the upper sky, the same every draw; a few twinkle as crosses.
  for (let i = 0; i < 70; i += 1) {
    const x = Math.round(rand(i * 3 + 1) * (SKY_W - 20)) + 10
    const y = Math.round(Math.pow(rand(i * 5 + 2), 1.6) * 520) + 8
    const size = rand(i * 7 + 3) < 0.25 ? 6 : 4
    const tw = `tw${i % 3}`

    if (size === 6 && i % 4 === 0) {
      body +=
        `<g class="${tw}"><rect x="${x}" y="${y - 6}" width="3" height="15" fill="${CREAM}"/>` +
        `<rect x="${x - 6}" y="${y}" width="15" height="3" fill="${CREAM}"/></g>`
    } else {
      body += `<rect class="${tw}" x="${x}" y="${y}" width="${size}" height="${size}" fill="${CREAM}"/>`
    }
  }
  const css =
    '@keyframes twa{0%{opacity:0.9}50%{opacity:0.25}100%{opacity:0.9}}' +
    '.tw0{animation:twa 3.2s ease-in-out infinite}.tw1{animation:twa 4.6s ease-in-out infinite;animation-delay:-1.5s}' +
    '.tw2{animation:twa 6s ease-in-out infinite;animation-delay:-3s}'

  return { defs, body, css }
}

/** The moon in pixels: lit as the date's phase says, the dark side faint. */
function moon(lit: number, waxing: boolean, cx: number, cy: number): string {
  const R = 9
  const P = 5
  const phase = waxing ? Math.acos(1 - 2 * lit) : 2 * Math.PI - Math.acos(1 - 2 * lit)
  let litPath = ''
  let darkPath = ''

  for (let j = -R; j <= R; j += 1) {
    for (let i = -R; i <= R; i += 1) {
      const x = (i + 0.5) / R
      const y = (j + 0.5) / R

      if (x * x + y * y > 1) continue
      const edge = Math.cos(phase) * Math.sqrt(1 - y * y)
      const isLit = phase <= Math.PI ? x > edge : x < -edge
      const cell = `M${cx + i * P} ${cy + j * P}h${P}v${P}h-${P}z`

      if (isLit) litPath += cell
      else darkPath += cell
    }
  }

  return (
    `<circle cx="${cx + P / 2}" cy="${cy + P / 2}" r="${R * P + 14}" fill="#fff6dc" opacity="0.08"/>` +
    `<path fill="#2a3a63" d="${darkPath}"/><path fill="#f8f1cf" d="${litPath}"/>`
  )
}

const HIJRI_DAY_TOKENS = (day: DayInfo): Token[] => [
  { kind: 'word', value: `d${day.weekday}` },
  { kind: 'num', value: String(day.hijri.day) },
  { kind: 'word', value: `h${day.hijri.month}` },
  { kind: 'num', value: String(day.hijri.year) },
  { kind: 'word', value: 'hijri' },
]

const GREG_TOKENS = (day: DayInfo): Token[] => [
  { kind: 'num', value: String(day.day) },
  { kind: 'word', value: `g${day.month}` },
  { kind: 'num', value: String(day.year) },
  { kind: 'word', value: 'greg' },
]

function countdown(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
}

/** The prayer board on the right: today's times, the next one lit, and a countdown. */
function prayerBoard(day: DayInfo, calendar: CalendarId, city: string): { svg: string; w: number; h: number; css: string } {
  const place = CITIES[city]?.word
  // Wide enough for the calendar's name and the city's side by side.
  const PW = Math.max(124, 16 + wordWidth(calendar) + 8 + (place?.w ?? 0))
  const ROW = 16
  const top = 26
  const PH = top + day.lines.length * ROW + 40
  let out = ''
  out += `<rect x="0" y="0" width="${PW}" height="${PH}" fill="#6b3f22"/>`
  out += `<rect x="1" y="1" width="${PW - 2}" height="2" fill="#9a643a"/>`
  out += `<rect x="4" y="4" width="${PW - 8}" height="${PH - 8}" fill="#1a2b44"/>`
  // Title: the calendar, and the city.
  out += word(calendar, PW - 8 - wordWidth(calendar), 6, GOLD).svg
  if (place !== undefined) out += `<path transform="translate(8 6)" fill="#9fb0c8" d="${place.d}"/>`
  out += `<rect x="8" y="${top - 2}" width="${PW - 16}" height="1" fill="#3a4d6e"/>`

  day.lines.forEach((line, i) => {
    const y = top + i * ROW
    // Lit: the prayer whose time it is now, otherwise the next one to come.
    const isNext = day.praying !== undefined ? line.id === day.praying : line.id === day.next.id && day.next.inMinutes < 1440
    const isPast = line.minutes <= day.minute && !isNext
    const fill = isNext ? GOLD : isPast ? '#7d8ca8' : CREAM

    if (isNext) out += `<rect x="5" y="${y}" width="${PW - 10}" height="${ROW - 1}" fill="#2c4166"/>`
    out += word(line.id, PW - 8 - wordWidth(line.id), y, fill).svg
    out += num(clock(line.minutes), 9, y + 4, 2, fill).svg
  })
  const fy = top + day.lines.length * ROW + 4
  out += `<rect x="8" y="${fy - 3}" width="${PW - 16}" height="1" fill="#3a4d6e"/>`
  let css = ''

  if (day.praying !== undefined) {
    // It is time: the footer calls it, blinking gently.
    css += '@keyframes call{0%{opacity:1}50%{opacity:0.35}}.call{animation:call 1.2s step-end infinite}'
    out +=
      '<g class="call">' +
      rtlLine(
        [
          { kind: 'word', value: 'now' },
          { kind: 'word', value: day.praying },
        ],
        PW - 8,
        fy + 8,
        GOLD,
      ) +
      '</g>'
  } else {
    out += rtlLine([{ kind: 'word', value: 'next' }], PW - 8, fy, '#9fb0c8')
    out += rtlLine(
      [
        { kind: 'word', value: day.next.id },
        { kind: 'word', value: 'in' },
        { kind: 'num', value: countdown(day.next.inMinutes) },
      ],
      PW - 8,
      fy + 17,
      CREAM,
    )
  }

  return { svg: out, w: PW, h: PH, css }
}

/** A pixel prayer rug under Leesho's feet. */
function rug(x: number, y: number, w: number): string {
  let out = `<rect x="${x}" y="${y}" width="${w}" height="9" fill="#d8a63a"/>`
  out += `<rect x="${x + 2}" y="${y + 1}" width="${w - 4}" height="7" fill="#8e2b2b"/>`
  out += `<rect x="${x + 6}" y="${y + 3}" width="${w - 12}" height="3" fill="#2f6b55"/>`
  for (let i = x; i < x + w; i += 3) out += `<rect x="${i}" y="${y + 9}" width="1" height="2" fill="#e8d8b0"/>`

  return out
}

// ---------- whole scene ----------
// Built the way Anthropic's theme-examples scenes are: one root svg, no nested
// svg, no overflow, no transform-box, every id with a hyphen.
export function scene(
  mood: Mood,
  stats: Stats,
  variant = 0,
  day?: DayInfo,
  view: { calendar: CalendarId; city: string; dates: DatesShown; board: boolean } = {
    calendar: 'ummalqura',
    city: 'makkah',
    dates: 'both',
    board: true,
  },
): { svg: string; alt: string } {
  const isPraying = day?.praying !== undefined
  const act = isPraying ? PRAYING : pick(mood, stats, variant)
  const f = frames(act)
  const motion = act.motion === undefined ? '' : MOTION_CSS[act.motion]
  const b = board(stats, act.writes === true && !isPraying)
  const d = isPraying ? { css: '', body: '' } : sweat(stats.context)
  const s = sky()

  // Stage in pixel units, scaled by SCALE, pinned to the bottom-left of the frame.
  const BX = 0 // board left
  // Leesho in front of the board, inside its width, so he stays out of the
  // chat column (2026-11-24: beside it he stood behind the replies).
  const LX = 30
  const FLOOR = BH + 22 // easel legs below the board
  const LY = FLOOR - SPRITE.h + 4
  // Clear of the app's sidebar on the left, lifted above the message box.
  const TX = 250
  const TY = 1000 - 110 - FLOOR * SCALE
  const floorY = TY + FLOOR * SCALE

  // He faces left (flipped); pacing, he walks left along the board, then back.
  // At prayer time he faces you, on his rug, and points to the prayer board.
  const flip = `matrix(-1 0 0 1 ${SPRITE.w} 0)`
  let leesho: string

  if (isPraying) {
    const knock =
      '<g class="b0">' +
      '<rect x="27" y="35" width="1" height="3" fill="#ffffff"/><rect x="24" y="40" width="3" height="1" fill="#ffffff"/>' +
      '<rect x="31" y="32" width="1" height="2" fill="#ffffff"/></g>'
    leesho =
      `<g transform="translate(${LX} ${LY})">${rug(10, SPRITE.h - 8, SPRITE.w - 20)}</g>` +
      `<g class="mv"><g transform="translate(${LX} ${LY})">${f.body}${knock}</g></g>`
  } else if (act.motion === 'pace') {
    leesho =
      `<defs><g id="leesho-walk">${f.body}</g></defs>` +
      `<g class="mv"><g transform="translate(${LX} ${LY})">` +
      `<g class="face-out"><g transform="${flip}"><use href="#leesho-walk"/></g></g>` +
      '<g class="face-back" opacity="0"><use href="#leesho-walk"/></g>' +
      `${d.body}</g></g>`
  } else {
    leesho = `<g class="mv"><g transform="translate(${LX} ${LY})"><g transform="${flip}">${f.body}${d.body}</g></g></g>`
  }

  const legs =
    `<rect x="${BX + 12}" y="${BH - 4}" width="5" height="${FLOOR - BH + 4}" fill="#6b3f22"/>` +
    `<rect x="${BX + BW - 17}" y="${BH - 4}" width="5" height="${FLOOR - BH + 4}" fill="#6b3f22"/>`


  // The prayer board, bottom-right, standing on the same floor.
  let right = ''
  let rightCss = ''

  if (day !== undefined && view.board) {
    const pb = prayerBoard(day, view.calendar, view.city)
    const px = SKY_W - 24 - pb.w * SCALE
    const py = floorY - 36 - pb.h * SCALE
    right =
      `<rect x="${px + 22 * SCALE}" y="${py + pb.h * SCALE}" width="${5 * SCALE}" height="36" fill="#6b3f22"/>` +
      `<rect x="${px + (pb.w - 27) * SCALE}" y="${py + pb.h * SCALE}" width="${5 * SCALE}" height="36" fill="#6b3f22"/>` +
      // Dates above the prayer board, Hijri over Gregorian, read right to left.
      `<g transform="translate(${px} ${py}) scale(${SCALE})">` +
      (view.dates === 'gregorian' ? '' : rtlLine(HIJRI_DAY_TOKENS(day), pb.w, view.dates === 'hijri' ? -22 : -42, CREAM, INK)) +
      (view.dates === 'hijri' ? '' : rtlLine(GREG_TOKENS(day), pb.w, -22, CREAM, INK)) +
      `${pb.svg}</g>`
    // The frame is cropped on the right when the box is narrower than 13:10
    // (a docked pane, a narrow window): step the prayer board left with it so
    // it stays in view. Each step uses its range's narrowest width.
    for (let a = 125; a >= 75; a -= 5) {
      const shift = Math.round(a * 10 - SKY_W)
      rightCss += `@media (max-aspect-ratio: ${a + 5}/100){.rt{transform:translate(${shift}px,0px)}}`
    }
    rightCss += pb.css
    right = `<g class="rt">${right}</g>`
  }

  const style =
    '<style>' +
    '.flr{fill:#e3cf9f}.flr2{fill:#d6bf8a}' +
    s.css +
    f.css +
    motion +
    b.css +
    d.css +
    rightCss +
    '</style>'

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SKY_W} 1000" width="100%" height="100%" preserveAspectRatio="xMinYMax slice">` +
    style +
    `<defs>${s.defs}${f.defs}</defs>` +
    s.body +
    (day === undefined ? '' : `<g class="rt">${moon(day.moon.lit, day.moon.waxing, SKY_W - 400, 400)}</g>`) +
    `<rect class="flr" x="0" y="${floorY}" width="${SKY_W}" height="${1000 - floorY}"/>` +
    `<rect class="flr2" x="0" y="${floorY}" width="${SKY_W}" height="5"/>` +
    right +
    `<g transform="translate(${TX} ${TY}) scale(${SCALE})">` +
    legs +
    `<g transform="translate(${BX} 0)">${b.body}</g>` +
    leesho +
    '</g>' +
    '</svg>'

  return { svg, alt: act.alt }
}
