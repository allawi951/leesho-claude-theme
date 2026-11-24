// Prayer times, the moon and the Hijri date, worked out from the sun and the
// moon alone: no network. The sun math follows the well-known PrayTimes
// method (praytimes.org); each calendar is a set of angles and offsets.

import { CITIES } from './cities'

export type CalendarId = 'ummalqura' | 'hadi'

export type PrayerId = 'imsak' | 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'sunset' | 'maghrib' | 'isha' | 'midnight'

/** One line of the board: what it is, and when, as minutes after local midnight. */
export type PrayerLine = { id: PrayerId; minutes: number; isPrayer: boolean }

export type Place = { lat: number; lng: number; tz: number }

export const DAMMAM: Place = { lat: 26.4207, lng: 50.0888, tz: 3 }

const rad = (d: number): number => (d * Math.PI) / 180
const deg = (r: number): number => (r * 180) / Math.PI
const fix = (a: number, b: number): number => {
  const r = a - b * Math.floor(a / b)

  return r < 0 ? r + b : r
}

function julian(year: number, month: number, day: number): number {
  let y = year
  let m = month

  if (m <= 2) {
    y -= 1
    m += 12
  }
  const a = Math.floor(y / 100)
  const b = 2 - a + Math.floor(a / 4)

  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5
}

/** The sun's declination and the equation of time, for a Julian day. */
function sun(jd: number): { decl: number; eqt: number } {
  const d = jd - 2451545.0
  const g = fix(357.529 + 0.98560028 * d, 360)
  const q = fix(280.459 + 0.98564736 * d, 360)
  const l = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360)
  const e = 23.439 - 0.00000036 * d
  const ra = fix(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(l)), Math.cos(rad(l)))) / 15, 24)

  return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(l)))), eqt: q / 15 - ra }
}

type Day = { jd: number; place: Place }

function noon(day: Day, hour: number): number {
  const { eqt } = sun(day.jd + hour / 24)

  return fix(12 - eqt, 24)
}

/** When the sun is `angle` degrees below the horizon, before (ccw) or after noon. */
function sunAngle(day: Day, angle: number, hour: number, ccw: boolean): number {
  const { decl } = sun(day.jd + hour / 24)
  const n = noon(day, hour)
  const lat = rad(day.place.lat)
  const t =
    deg(Math.acos((-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(lat)) / (Math.cos(rad(decl)) * Math.cos(lat)))) /
    15

  return n + (ccw ? -t : t)
}

/** When an object's shadow is `factor` times its length plus its noon shadow (Asr). */
function asrTime(day: Day, factor: number, hour: number): number {
  const { decl } = sun(day.jd + hour / 24)
  const angle = -deg(Math.atan(1 / (factor + Math.tan(Math.abs(rad(day.place.lat) - rad(decl))))))

  return sunAngle(day, angle, hour, false)
}

/** Local clock hours to minutes after midnight, rounded to the nearest minute. */
function toMinutes(localHours: number): number {
  return Math.round(fix(localHours, 24) * 60)
}

// Calibrated against the Hadi table for Dammam, 12-27 Nov 2026.
export const HADI = { fajr: 17.95, maghrib: 3.95, imsakBefore: 10, dhuhrPlus: 0.5, sunsetPlus: 0.5 }
const UQ = { fajr: 18.5, ishaAfter: 90, ishaAfterRamadan: 120 }

/**
 * The day's lines for a calendar, in order. `isRamadan` stretches the Umm
 * al-Qura Isha to two hours after Maghrib.
 */
export function prayerDay(
  date: { year: number; month: number; day: number },
  place: Place,
  calendar: CalendarId,
  isRamadan = false,
): PrayerLine[] {
  const day: Day = { jd: julian(date.year, date.month, date.day) - place.lng / 360, place }
  const shift = place.tz - place.lng / 15
  const at = (h: number): number => toMinutes(h + shift)

  const sunrise = sunAngle(day, 0.833, 6, true)
  const sunset = sunAngle(day, 0.833, 18, false)
  const dhuhr = noon(day, 12)

  if (calendar === 'hadi') {
    const fajr = sunAngle(day, HADI.fajr, 5, true)
    const maghrib = sunAngle(day, HADI.maghrib, 18, false)
    // Midnight: halfway from sunset to the next Fajr.
    const midnight = sunset + (fajr + 24 - sunset) / 2

    return [
      { id: 'imsak', minutes: at(fajr) - HADI.imsakBefore, isPrayer: false },
      { id: 'fajr', minutes: at(fajr), isPrayer: true },
      { id: 'sunrise', minutes: at(sunrise), isPrayer: false },
      { id: 'dhuhr', minutes: at(dhuhr + HADI.dhuhrPlus / 60), isPrayer: true },
      { id: 'sunset', minutes: at(sunset + HADI.sunsetPlus / 60), isPrayer: false },
      { id: 'maghrib', minutes: at(maghrib + HADI.sunsetPlus / 60), isPrayer: true },
      { id: 'midnight', minutes: at(midnight), isPrayer: false },
    ]
  }

  const fajr = sunAngle(day, UQ.fajr, 5, true)
  const asr = asrTime(day, 1, 13)
  const isha = toMinutes(sunset + shift) + (isRamadan ? UQ.ishaAfterRamadan : UQ.ishaAfter)

  return [
    { id: 'fajr', minutes: at(fajr), isPrayer: true },
    { id: 'sunrise', minutes: at(sunrise), isPrayer: false },
    { id: 'dhuhr', minutes: at(dhuhr), isPrayer: true },
    { id: 'asr', minutes: at(asr), isPrayer: true },
    { id: 'maghrib', minutes: at(sunset), isPrayer: true },
    { id: 'isha', minutes: isha, isPrayer: true },
  ]
}

/** The moon's age in days since the last new moon, and its lit fraction 0-1. */
export function moonPhase(when: Date): { age: number; lit: number; waxing: boolean } {
  const synodic = 29.530588853
  const knownNew = Date.UTC(2000, 0, 6, 18, 14) // a new moon
  const age = fix((when.getTime() - knownNew) / 86400000, synodic)
  const lit = (1 - Math.cos((2 * Math.PI * age) / synodic)) / 2

  return { age, lit, waxing: age < synodic / 2 }
}

/** "hh:mm" in 12-hour clock, as printed calendars in the Gulf show it. */
export function clock(minutes: number): string {
  const m = fix(minutes, 1440)
  let h = Math.floor(m / 60) % 12

  if (h === 0) h = 12

  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// ---------- the day as Leesho shows it ----------

export type DatesShown = 'both' | 'gregorian' | 'hijri'

export type Settings = {
  calendar: CalendarId
  /** A city id from cities.ts, or 'custom' for `place`. */
  city: string
  /** Used when `city` is 'custom'. */
  place?: Place
  /** Which dates show above the prayer board. */
  dates: DatesShown
  /** False hides the prayer board (and the dates above it). */
  board: boolean
  /** Prayers that raise an alert and bring Leesho to his prayer rug. */
  alerts: PrayerId[]
  /** Days added to the Umm al-Qura Hijri date (the Hadi calendar runs a day behind it in 1448). */
  hijriOffset: number
}

export const DEFAULT_SETTINGS: Settings = {
  calendar: 'ummalqura',
  city: 'makkah',
  dates: 'both',
  board: true,
  alerts: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'],
  hijriOffset: 0,
}

/** Where the times are worked out for. */
export function placeOf(set: Settings): Place {
  if (set.city === 'custom' && set.place !== undefined) return set.place
  const c = CITIES[set.city] ?? CITIES.makkah!

  return { lat: c.lat, lng: c.lng, tz: c.tz }
}

export type Hijri = { year: number; month: number; day: number }

/** The Umm al-Qura date, from the platform's calendar where it has one, else the civil arithmetic one. */
export function hijriOf(y: number, m: number, d: number, offsetDays: number): Hijri {
  const when = new Date(Date.UTC(y, m - 1, d, 12) + offsetDays * 86400000)

  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(when)
    const get = (t: string): number => Number(parts.find(p => p.type === t)?.value)
    const out = { year: get('year'), month: get('month'), day: get('day') }

    if (out.year > 1300 && out.month >= 1 && out.month <= 12 && out.day >= 1) return out
  } catch {
    // No Islamic calendar in this runtime: fall through to arithmetic.
  }
  // Tabular (civil) Islamic calendar from the Julian day.
  const jd = Math.floor(when.getTime() / 86400000 + 2440587.5) + 0.5
  const l0 = Math.floor(jd - 1948439.5) + 10632
  const n = Math.floor((l0 - 1) / 10631)
  const l1 = l0 - 10631 * n + 354
  const j =
    Math.floor((10985 - l1) / 5316) * Math.floor((50 * l1) / 17719) +
    Math.floor(l1 / 5670) * Math.floor((43 * l1) / 15238)
  const l2 =
    l1 -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29
  const month = Math.floor((24 * l2) / 709)

  return { year: 30 * n + j - 30, month, day: l2 - Math.floor((709 * month) / 24) }
}

export type DayInfo = {
  /** Local date and weekday (0 = Sunday). */
  year: number
  month: number
  day: number
  weekday: number
  hijri: Hijri
  /** Minutes after local midnight now. */
  minute: number
  lines: PrayerLine[]
  /** The next prayer still to come (tomorrow's Fajr after the last one). */
  next: { id: PrayerId; inMinutes: number }
  /** The alerted prayer whose first ten minutes are now, if any. */
  praying?: PrayerId
  moon: { lit: number; waxing: boolean }
}

export const PRAYER_WINDOW_MIN = 10

export function dayInfo(nowMs: number, place: Place, settings: Settings): DayInfo {
  const local = new Date(nowMs + place.tz * 3600000)
  const year = local.getUTCFullYear()
  const month = local.getUTCMonth() + 1
  const day = local.getUTCDate()
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes()
  const hijri = hijriOf(year, month, day, settings.hijriOffset)
  const lines = prayerDay({ year, month, day }, place, settings.calendar, hijri.month === 9)
  const prayers = lines.filter(l => l.isPrayer)
  const upcoming = prayers.find(l => l.minutes > minute)
  let next: DayInfo['next']

  if (upcoming !== undefined) {
    next = { id: upcoming.id, inMinutes: upcoming.minutes - minute }
  } else {
    const t = new Date(Date.UTC(year, month - 1, day + 1))
    const tomorrow = prayerDay(
      { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() },
      place,
      settings.calendar,
    )
    const fajr = tomorrow.find(l => l.id === 'fajr')!
    next = { id: 'fajr', inMinutes: fajr.minutes + 1440 - minute }
  }
  const praying = prayers.find(
    l => settings.alerts.includes(l.id) && minute >= l.minutes && minute < l.minutes + PRAYER_WINDOW_MIN,
  )?.id
  const m = moonPhase(new Date(nowMs))

  return {
    year,
    month,
    day,
    weekday: local.getUTCDay(),
    hijri,
    minute,
    lines,
    next,
    praying,
    moon: { lit: m.lit, waxing: m.waxing },
  }
}

/** Epoch ms of a local minute-of-day on a local date. */
export function epochOf(place: Place, y: number, m: number, d: number, minute: number): number {
  return Date.UTC(y, m - 1, d) + minute * 60000 - place.tz * 3600000
}
