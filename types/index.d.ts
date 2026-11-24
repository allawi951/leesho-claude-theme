export type Mood = 'idle' | 'thinking' | 'working' | 'tool' | 'done' | 'waiting' | 'error' | 'aborted'

export type PrayerSettings = {
  calendar: 'ummalqura' | 'hadi'
  alerts: ('imsak' | 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'sunset' | 'maghrib' | 'isha' | 'midnight')[]
  hijriOffset: number
  city: string
  place?: { lat: number; lng: number; tz: number }
  dates: 'both' | 'gregorian' | 'hijri'
  board: boolean
}

export type Stats = {
  /** Context window fill, 0-100, absent before the first response. */
  context?: number
  /** Five-hour rate-limit window, 0-100. */
  fiveHour?: number
  /** Seven-day rate-limit window, 0-100. */
  sevenDay?: number
  /** Session cost estimate in USD. */
  costUsd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'leesho-theme': {
      mood: Mood
      stats: Stats
      variant: number
      veil: number
      settings: PrayerSettings
      nowMin: number
      testCall: boolean
    }
  }
}
