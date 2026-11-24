import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, ThemeSetArgs } from 'claude-code'

import type { Mood, Stats } from '../types'

import { makeColors } from './make-colors.js'
import { CITIES } from './cities'
import { DEFAULT_SETTINGS, clock, dayInfo, epochOf, hijriOf, placeOf, prayerDay } from './prayer'
import type { CalendarId, DatesShown, PrayerId, Settings } from './prayer'
import { scene } from './scene'

const mood = atom({ plugin: 'leesho-theme', key: 'mood' } as const, 'idle' as Mood)
const stats = atom({ plugin: 'leesho-theme', key: 'stats' } as const, {} as Stats)
// Counts up every few seconds: which little scene Leesho is in while he waits or works.
const variant = atom({ plugin: 'leesho-theme', key: 'variant' } as const, 0)
// How opaque the glass box behind each reply is, in percent.
const veil = atom({ plugin: 'leesho-theme', key: 'veil' } as const, 82)
// Prayer settings (/leesho), and the time now to the minute, which redraws the board.
const settings = atom({ plugin: 'leesho-theme', key: 'settings' } as const, DEFAULT_SETTINGS)
const nowMin = atom({ plugin: 'leesho-theme', key: 'nowMin' } as const, 0)
// True for a minute after /leesho test: the prayer call shows as if it were time.
const testCall = atom({ plugin: 'leesho-theme', key: 'testCall' } as const, false)

const SETTINGS_KEY = 'prayer-settings'
const CALLED_KEY = 'prayer-called'
const ALL_PRAYERS: PrayerId[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']
const NAMES: Record<string, string> = {
  imsak: 'الإمساك',
  fajr: 'الفجر',
  sunrise: 'الشروق',
  dhuhr: 'الظهر',
  asr: 'العصر',
  sunset: 'الغروب',
  maghrib: 'المغرب',
  isha: 'العشاء',
  midnight: 'منتصف الليل',
}
const CALENDAR_NAMES: Record<CalendarId, string> = { hadi: 'تقويم الهادي', ummalqura: 'تقويم أم القرى' }

const OPTIONS_KEY = 'install-options'
const DATES: DatesShown[] = ['both', 'gregorian', 'hijri']

/** The prayers a calendar lists: the Hadi calendar joins them into three times. */
const poolOf = (calendar: CalendarId): PrayerId[] => (calendar === 'hadi' ? ['fajr', 'dhuhr', 'maghrib'] : ALL_PRAYERS)

function alertsFrom(asked: string, calendar: CalendarId): PrayerId[] | undefined {
  const pool = poolOf(calendar)
  const a = asked.trim().toLowerCase()

  if (a === 'all' || a === '') return pool
  if (a === 'none') return []
  const picked = a.split(/[ ,]+/).filter(x => pool.includes(x as PrayerId)) as PrayerId[]

  return picked.length > 0 ? picked : undefined
}

/** The settings chosen at install (the plugin's userConfig). */
function fromOptions(o: PluginOptions): Settings {
  const calendar: CalendarId = o.calendar === 'hadi' ? 'hadi' : 'ummalqura'
  const city = typeof o.city === 'string' && CITIES[o.city] !== undefined ? o.city : DEFAULT_SETTINGS.city
  const num = (v: unknown, lo: number, hi: number, dflt: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : dflt
  const place =
    city === 'custom'
      ? { lat: num(o.latitude, -66, 66, 21.4225), lng: num(o.longitude, -180, 180, 39.8262), tz: num(o.utcOffset, -12, 14, 3) }
      : undefined

  return {
    calendar,
    city,
    ...(place ? { place } : {}),
    dates: DATES.includes(o.dates as DatesShown) ? (o.dates as DatesShown) : 'both',
    board: o.prayerBoard !== false,
    alerts: alertsFrom(typeof o.alerts === 'string' ? o.alerts : 'all', calendar) ?? poolOf(calendar),
    hijriOffset: calendar === 'hadi' ? -1 : 0,
  }
}

/** What /leesho changed since, laid over `base`. A store from before the city
 * option was the Dammam one. */
function storedSettings(raw: unknown, base: Settings): Settings {
  if (raw === undefined || raw === null || typeof raw !== 'object') return base
  const r = raw as Partial<Settings>
  const calendar: CalendarId = r.calendar === 'ummalqura' ? 'ummalqura' : r.calendar === 'hadi' ? 'hadi' : base.calendar
  const city = typeof r.city === 'string' && CITIES[r.city] !== undefined ? r.city : r.city === undefined ? 'dammam' : base.city
  const p = r.place
  const place =
    p && typeof p.lat === 'number' && typeof p.lng === 'number' && typeof p.tz === 'number'
      ? { place: p }
      : base.place
        ? { place: base.place }
        : {}

  return {
    calendar,
    city,
    ...place,
    dates: DATES.includes(r.dates as DatesShown) ? (r.dates as DatesShown) : base.dates,
    board: typeof r.board === 'boolean' ? r.board : base.board,
    alerts: Array.isArray(r.alerts) ? r.alerts.filter(a => poolOf(calendar).includes(a)) : base.alerts,
    hijriOffset: typeof r.hijriOffset === 'number' ? r.hijriOffset : base.hijriOffset,
  }
}

/** Install options win when they change; otherwise what /leesho set stands. */
async function loadSettings($: EngineInterface, options: PluginOptions): Promise<Settings> {
  const chosen = fromOptions(options)
  const sig = JSON.stringify(chosen)
  const seen = await $.store.get(OPTIONS_KEY)
  const raw = await $.store.get(SETTINGS_KEY)
  let set: Settings

  if (seen === sig || (seen === undefined && raw !== undefined && raw !== null)) {
    set = storedSettings(raw, chosen)
  } else {
    set = chosen
    await $.store.set(SETTINGS_KEY, set)
  }
  if (seen !== sig) await $.store.set(OPTIONS_KEY, sig)

  return set
}

const cityName = (set: Settings): string => CITIES[set.city]?.ar ?? set.city

/** The desktop app holds these and raises each at its time, even with the session out of view. */
async function bookAlerts($: EngineInterface, set: Settings): Promise<number> {
  const now = await $.clock.now()
  const place = placeOf(set)
  let booked = 0

  for (let i = 0; i < 3; i += 1) {
    const local = new Date(now + place.tz * 3600000 + i * 86400000)
    const y = local.getUTCFullYear()
    const m = local.getUTCMonth() + 1
    const d = local.getUTCDate()
    const isRamadan = hijriOf(y, m, d, set.hijriOffset).month === 9
    const lines = prayerDay({ year: y, month: m, day: d }, place, set.calendar, isRamadan)

    for (const id of ALL_PRAYERS) {
      const key = `prayer-${y}-${m}-${d}-${id}`
      const line = lines.find(l => l.id === id)
      const at = line === undefined ? 0 : epochOf(place, y, m, d, line.minutes)

      // Take back what an earlier choice booked; book again what is still wanted.
      try {
        await $.ui.cancelNotify(key)
      } catch {
        // Nothing booked under that key.
      }
      if (line === undefined || !set.alerts.includes(id) || at <= now + 30000) continue
      try {
        const sent = await $.ui.notify(
          `حان وقت صلاة ${NAMES[id]} — ${clock(line.minutes)} (${CALENDAR_NAMES[set.calendar]}، ${cityName(set)})`,
          { title: 'ليشو', key, at },
        )
        // Only the app (a client) holds a notification for later; anything else raised it now.
        if (sent.isSent && sent.channel === 'client') booked += 1
      } catch {
        // A surface that cannot hold a notification for later: the in-session call still runs.
      }
    }
  }

  return booked
}

/** The knock on the glass: Windows' own sound player there (the app plays no
 * plugin sound on Windows), the app's player elsewhere. */
async function knock($: EngineInterface): Promise<void> {
  // A Windows plugin folder starts with a drive letter (C:\...).
  const isWindows = /^[A-Za-z]:/.test($.plugin.root)

  if (!isWindows) {
    try {
      await $.audio.play({ asset: 'sounds/glass-knock.wav' })
    } catch {
      // No sound: the scene still calls.
    }

    return
  }
  try {
    const file = `${$.plugin.root}/sounds/glass-knock.wav`.replace(/\//g, '\\')
    await $.process.run([
      'powershell',
      '-NoProfile',
      '-Command',
      `(New-Object Media.SoundPlayer '${file}').PlaySync()`,
    ])
  } catch {
    // No sound at all: the scene still calls.
  }
}

/** Once a minute: move the board's clock, and call a prayer when its time comes. */
async function tick($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const minute = Math.floor(now / 60000)

  if ((await read($, nowMin)) === minute) return
  await update($, nowMin, () => minute)
  const set = await read($, settings)
  const day = dayInfo(now, placeOf(set), set)

  if (day.praying === undefined) return
  const call = `${day.year}-${day.month}-${day.day}-${day.praying}`

  if ((await $.store.get(CALLED_KEY)) === call) return
  await $.store.set(CALLED_KEY, call)
  await knock($)
}

// Ali & Leesho palette: Leesho's teal and cream, the logo's coral.
const { theme, problems } = makeColors({
  label: 'Ali & Leesho',
  roles: { accent: '#078a89', danger: '#e0503f', success: '#3f8f4a', warning: '#c98a17', pro: '#7a4fb0' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#f1e4c4',
        'surface-1': '#f6ecd2',
        'surface-2': '#fbf4e2',
        'text-primary': '#132a27',
        'text-secondary': '#2f4a45',
        'text-muted': '#4f625c',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0b2422',
        'surface-1': '#112d2a',
        'surface-2': '#163532',
        'surface-3': '#1b3b37',
        'text-primary': '#f6ecd6',
        'text-secondary': '#d6cdb7',
        'text-muted': '#aaa591',
      },
    },
  },
})
// The Leesho colors are held back until the scene is settled in the app.
void theme

// The app's own glass covers the whole window, so it stays faint; readability
// comes from the glass box behind each reply instead (/leesho-glass).
// The scene and the boxes are made for a light window, so the look asks for one.
const LOOK: ThemeSetArgs = {
  backdrop: { scene: 'leesho-classroom', glass: { blur: 0, tint: '#f6ecd6', opacity: 0.08 } },
  overrideColorScheme: 'light',
}

const VEIL_KEY = 'veil-percent'

// The plan windows as every session last saw them. A session only learns them
// from its own API replies, so an idle one goes stale and none sees what the
// others spend: each writes its reading to the store (one file for all
// sessions) and the board shows the freshest.
const LIMITS_KEY = 'plan-limits'
type Window = 'five_hour' | 'seven_day'
type Reading = { percent: number; resetsAt?: string; at: number }
type Limits = Partial<Record<Window, Reading>>

async function shareLimits(
  $: EngineInterface,
  seen: Record<Window, { percentUsed: number; resetsAt?: string } | undefined>,
): Promise<void> {
  const at = await $.clock.now()
  const kept = ((await $.store.get(LIMITS_KEY)) ?? {}) as Limits
  let changed = false

  for (const w of ['five_hour', 'seven_day'] as const) {
    const r = seen[w]
    if (r === undefined) continue
    const old = kept[w]
    // Same window: use only grows, so the larger figure is the newer one, from
    // whichever session. A later reset time means a new window: take it.
    // Two readings of one window can name reset times a moment apart.
    const gap = old === undefined ? NaN : Date.parse(r.resetsAt ?? '') - Date.parse(old.resetsAt ?? '')
    const isSameWindow = old !== undefined && (old.resetsAt === r.resetsAt || Math.abs(gap) <= 10 * 60000)
    const isNewer =
      old === undefined ||
      (isSameWindow ? r.percentUsed >= old.percent : gap > 0 || Number.isNaN(gap) || old.at < at - 6 * 3600000)
    if (isNewer) {
      kept[w] = { percent: r.percentUsed, resetsAt: r.resetsAt, at }
      changed = true
    }
  }
  if (changed) await $.store.set(LIMITS_KEY, kept)
}

/** The freshest reading per window; none once that window has reset. */
async function sharedLimits($: EngineInterface): Promise<Partial<Record<Window, number>>> {
  const now = await $.clock.now()
  const kept = ((await $.store.get(LIMITS_KEY)) ?? {}) as Limits
  const out: Partial<Record<Window, number>> = {}

  for (const w of ['five_hour', 'seven_day'] as const) {
    const r = kept[w]
    if (r === undefined) continue
    const ends = Date.parse(r.resetsAt ?? '')
    if (Number.isFinite(ends) && ends <= now) continue
    out[w] = r.percent
  }

  return out
}
const VEIL_DEFAULT = 82
const VARIANT_MS = 9000

function veilColor(percent: number): string {
  return `rgba(250, 244, 230, ${(percent / 100).toFixed(2)})`
}

async function storedVeil($: EngineInterface): Promise<number> {
  const raw = await $.store.get(VEIL_KEY)

  return typeof raw === 'number' && raw >= 0 && raw <= 100 ? raw : VEIL_DEFAULT
}

// Moods that pass on their own: after this long, fall back to the next one.
let timer: { cancel: () => void } | undefined

async function setMood($: EngineInterface, next: Mood, thenMs?: number, then?: Mood): Promise<void> {
  timer?.cancel()
  timer = undefined
  await update($, variant, () => 0)
  await update($, mood, () => next)

  if (thenMs !== undefined && then !== undefined) {
    timer = $.clock.after(thenMs, () => {
      timer = undefined
      void update($, variant, () => 0)
      void update($, mood, () => then)
    })
  }
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(`leesho-theme: ${unpainted}`)
    }
    // Clear a status line an earlier version left behind.
    $.ui.status(undefined)
    const set = await $.theme.set(LOOK)

    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }
    const kept = await storedVeil($)
    await update($, veil, () => kept)
    await update($, settings, () => DEFAULT_SETTINGS)
    const set0 = await loadSettings($, options)
    await update($, settings, () => set0)
    await tick($)
    $.clock.every(20000, () => {
      void tick($)
    })
    if (e.surface !== 'terminal') {
      void bookAlerts($, set0).then(n => $.store.set('alerts-booked', n))
    }
    await $.command.register({
      name: 'leesho',
      description: 'Leesho prayer board: /leesho, /leesho city riyadh, /leesho calendar ummalqura|hadi, /leesho date both|gregorian|hijri, /leesho board on|off, /leesho alerts all|none|fajr,maghrib, /leesho hijri -1, /leesho glass 80, /leesho test',
    })
    await $.command.register({
      name: 'leesho-glass',
      description: 'Set how opaque the glass box behind each reply is: /leesho-glass 0-100',
    })
    await setMood($, 'idle')
    // Leesho moves on to his next little scene every few seconds.
    $.clock.every(VARIANT_MS, () => {
      void update($, variant, n => n + 1)
    })

    return next(e)
  })

  on('command.run', { command: 'leesho-glass' }, async ($, e) => {
    const asked = e.args.trim()

    if (asked === '') {
      return { text: `The glass box behind replies is ${await read($, veil)}% opaque. Use /leesho-glass 0-100.` }
    }
    const n = Math.round(Number(asked.replace('%', '')))

    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { text: 'Give a number from 0 to 100, for example /leesho-glass 80.' }
    }
    await $.store.set(VEIL_KEY, n)
    await update($, veil, () => n)

    return { text: `The glass box behind replies is now ${n}% opaque.` }
  })

  on('command.run', { command: 'leesho' }, async ($, e) => {
    const [sub0 = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ')
    const set = await read($, settings)
    const save = async (next: Settings): Promise<string> => {
      await $.store.set(SETTINGS_KEY, next)
      await update($, settings, () => next)
      await update($, nowMin, () => 0)
      await tick($)
      const booked = await bookAlerts($, next)
      await $.store.set('alerts-booked', booked)

      return `${booked} alerts booked for the next 3 days.`
    }

    if (sub0 === 'calendar') {
      if (arg !== 'hadi' && arg !== 'ummalqura') return { text: 'Use /leesho calendar hadi or /leesho calendar ummalqura.' }
      const hijriOffset = arg === 'hadi' ? -1 : 0
      const alerts = arg === 'hadi' ? set.alerts.filter(a => a !== 'asr' && a !== 'isha') : set.alerts

      return { text: `Calendar set to ${arg}. ${await save({ ...set, calendar: arg, hijriOffset, alerts })}` }
    }
    if (sub0 === 'city') {
      const id = arg.toLowerCase()

      if (CITIES[id] === undefined || id === 'custom') {
        return { text: `Pick a city: ${Object.keys(CITIES).filter(c => c !== 'custom').join(', ')}. For another place, set city "custom" with its latitude, longitude and UTC offset in the plugin's settings.` }
      }

      return { text: `City set to ${CITIES[id]!.en}. ${await save({ ...set, city: id })}` }
    }
    if (sub0 === 'date' || sub0 === 'dates') {
      if (!DATES.includes(arg as DatesShown)) return { text: 'Use /leesho date both, /leesho date gregorian or /leesho date hijri.' }
      const next = { ...set, dates: arg as DatesShown }
      await $.store.set(SETTINGS_KEY, next)
      await update($, settings, () => next)

      return { text: `Dates shown: ${arg}.` }
    }
    if (sub0 === 'board') {
      if (arg !== 'on' && arg !== 'off') return { text: 'Use /leesho board on or /leesho board off.' }
      const next = { ...set, board: arg === 'on' }
      await $.store.set(SETTINGS_KEY, next)
      await update($, settings, () => next)

      return { text: `Prayer board ${arg}.` }
    }
    if (sub0 === 'alerts') {
      const pool = poolOf(set.calendar)
      const asked = alertsFrom(arg, set.calendar)

      if (asked === undefined) {
        return { text: `Name the prayers from: ${pool.join(', ')}, or all, or none.` }
      }

      return { text: `Alerts: ${asked.join(', ') || 'none'}. ${await save({ ...set, alerts: asked })}` }
    }
    if (sub0 === 'hijri') {
      const n = Math.round(Number(arg))

      if (!Number.isFinite(n) || Math.abs(n) > 3) return { text: 'Give a day shift from -3 to 3, for example /leesho hijri -1.' }

      return { text: `Hijri date shifted by ${n} days from Umm al-Qura. ${await save({ ...set, hijriOffset: n })}` }
    }
    if (sub0 === 'glass') {
      const n = Math.round(Number(arg.replace('%', '')))

      if (!Number.isFinite(n) || n < 0 || n > 100) return { text: 'Give a number from 0 to 100, for example /leesho glass 80.' }
      await $.store.set(VEIL_KEY, n)
      await update($, veil, () => n)

      return { text: `The glass box behind replies is now ${n}% opaque.` }
    }
    if (sub0 === 'test') {
      // Shows the prayer call for one minute and knocks, to check the look and the sound.
      await update($, testCall, () => true)
      $.clock.after(60000, () => {
        void update($, testCall, () => false)
      })
      await knock($)

      return { text: 'Prayer call shown for one minute.' }
    }
    const day = dayInfo(await $.clock.now(), placeOf(set), set)
    const times = day.lines.map(l => `${NAMES[l.id]} ${clock(l.minutes)}`).join(' · ')

    return {
      text:
        `${CALENDAR_NAMES[set.calendar]} — ${cityName(set)}\n${times}\n` +
        `Alerts: ${set.alerts.join(', ') || 'none'} (${String((await $.store.get('alerts-booked')) ?? 0)} held by the app for the next 3 days) · Hijri ${day.hijri.day}/${day.hijri.month}/${day.hijri.year} (shift ${set.hijriOffset})\n` +
        'Change with /leesho city riyadh, /leesho calendar ummalqura|hadi, /leesho date both|gregorian|hijri, /leesho board on|off, /leesho alerts all|none|fajr,maghrib, /leesho hijri -1, /leesho glass 80, /leesho test',
    }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await setMood($, 'thinking')
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const main = e.agentId === undefined

    if (main && (await read($, mood)) !== 'tool' && (await read($, mood)) !== 'working') {
      await setMood($, 'tool')
    }
    const result = await next(e)

    if (main) {
      if ('isError' in result && result.isError === true) {
        await setMood($, 'error', 3500, 'working')
      } else if ((await read($, mood)) === 'tool') {
        await update($, mood, () => 'working')
      }
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      if (e.isAborted) {
        await setMood($, 'aborted', 6000, 'waiting')
      } else {
        await setMood($, 'done', 4000, 'waiting')
      }
    }

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const five = e.rateLimits.find(r => r.kind === 'five_hour')
    const seven = e.rateLimits.find(r => r.kind === 'seven_day')
    await shareLimits($, { five_hour: five, seven_day: seven })
    const s: Stats = {
      context: e.context.percent,
      fiveHour: five?.percentUsed,
      sevenDay: seven?.percentUsed,
      costUsd: e.cost?.usd,
    }
    await update($, stats, () => s)

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (
      (e.surface !== 'desktop' && e.surface !== 'mobile') ||
      (e.props.plugin !== 'leesho-theme' && e.props.scene !== 'leesho-classroom')
    ) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)
    await read($, nowMin) // redraw each minute
    const set = await read($, settings)
    const day = dayInfo(await $.clock.now(), placeOf(set), set)
    if ((await read($, testCall)) && day.praying === undefined) {
      day.praying = set.calendar === 'hadi' ? 'maghrib' : 'isha'
    }
    const own = await read($, stats)
    const limits = await sharedLimits($)
    const shown: Stats = { ...own, fiveHour: limits.five_hour, sevenDay: limits.seven_day }
    const drawn = scene(await read($, mood), shown, await read($, variant), day, set)

    return <Svg source={drawn.svg} alt={drawn.alt} isInteractive />
  })

  // The glass box: each reply and each tool row sits on its own frosted card,
  // so the text stays readable wherever it passes over Leesho or the board.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'desktop') {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    const row = await next(e)

    return (
      <Box backgroundColor={veilColor(await read($, veil))} paddingX={1}>
        {row}
      </Box>
    )
  })

  // The same glass card under every other row that carries text.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'desktop') {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    const row = await next(e)

    return (
      <Box backgroundColor={veilColor(await read($, veil))} paddingX={1}>
        {row}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.surface !== 'desktop') {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    const row = await next(e)

    return (
      <Box backgroundColor={veilColor(await read($, veil))} paddingX={1}>
        {row}
      </Box>
    )
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (e.surface !== 'desktop') {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    const row = await next(e)

    return (
      <Box backgroundColor={veilColor(await read($, veil))} paddingX={1}>
        {row}
      </Box>
    )
  })

  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => {
    if (e.surface !== 'desktop') {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    const row = await next(e)

    return (
      <Box backgroundColor={veilColor(await read($, veil))} paddingX={1}>
        {row}
      </Box>
    )
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (e.surface !== 'desktop') {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    const row = await next(e)

    return (
      <Box backgroundColor={veilColor(await read($, veil))} paddingX={1}>
        {row}
      </Box>
    )
  })
}
