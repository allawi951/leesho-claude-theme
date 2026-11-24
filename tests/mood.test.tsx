import { expect, mock, test } from 'claude-code/testing'
import { DAMMAM, clock, prayerDay } from '../hooks/prayer'
import type { On } from 'claude-code'

// The engine's state, in memory: what the mod's atoms read and write.
function memoryState(on: On) {
  const rows = new Map<string, { value: unknown; version: number }>()
  on('state.get', (_, e) => ({ value: rows.get(`${e.plugin}/${e.key}`) ?? { value: undefined, version: 0 } }))
  on('state.set', (_, e) => {
    const k = `${e.plugin}/${e.key}`
    const version = (rows.get(k)?.version ?? 0) + 1
    rows.set(k, { value: e.value, version })

    return { value: { isSet: true, version } }
  })
}

const BACKDROP = {
  plugin: 'leesho-theme',
  component: 'Backdrop',
  requestId: 'backdrop',
  surface: 'desktop',
  props: { scene: 'leesho-classroom', plugin: 'leesho-theme', glass: false },
} as const

async function alt($: any): Promise<string | undefined> {
  const ui = await $.ui.mount(BACKDROP)
  const svg = await ui.find({ type: 'Svg' })
  await ui.unmount()

  return svg?.props?.alt
}

test('a failed tool makes Leesho facepalm, then he goes back to work', async ($, on) => {
  memoryState(on)
  mock.store(on)
  const clock = mock.clock(on)
  on('tool.call', () => ({ result: { error: 'boom' }, isError: true }))

  await $.tool.call({ tool: 'Bash', command: 'false' })
  expect(await alt($)).toMatch(/facepalm/)

  await clock.advance(3600)
  expect(await alt($)).toMatch(/chalkboard/)
})

test('a good tool call returns Leesho from writing to working', async ($, on) => {
  memoryState(on)
  mock.store(on)
  mock.clock(on)
  on('tool.call', () => ({ result: { stdout: 'ok' } }))

  await $.tool.call({ tool: 'Bash', command: 'true' })
  expect(await alt($)).toMatch(/chalkboard/)
})

test('each reply sits on a glass box on desktop', async ($, on) => {
  memoryState(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>reply text</Text>
  })
  const ui = await $.ui.mount({
    plugin: 'leesho-theme',
    component: 'AssistantMessage',
    requestId: 'm1',
    surface: 'desktop',
    props: { text: 'reply text', isFirstOfReply: true },
  } as any)
  const box = await ui.find({ type: 'Box' })
  expect(box?.props?.backgroundColor).toMatch(/rgba\(250, 244, 230, 0\.82\)/)
  expect((await ui.find({ type: 'Text', text: /reply text/ }))?.text).toBe('reply text')
  await ui.unmount()
})

test('Hadi times for Dammam match the printed calendar (23 Nov 2026)', () => {
  const got = prayerDay({ year: 2026, month: 11, day: 23 }, DAMMAM, 'hadi').map(l => `${l.id} ${clock(l.minutes)}`)
  expect(got).toEqual([
    'imsak 04:34',
    'fajr 04:44',
    'sunrise 06:04',
    'dhuhr 11:26',
    'sunset 04:48',
    'maghrib 05:03',
    'midnight 10:46',
  ])
})

test('/leesho alerts keeps only the prayers the calendar has', async ($, on) => {
  memoryState(on)
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 10, 23, 9, 0) })
  on('ui.notify', () => ({ value: { isSent: true, channel: 'client' } }))
  on('ui.cancelNotify', () => ({ value: { isSent: true } }))
  await $.command.run({ command: 'leesho', args: 'calendar hadi' } as any)
  const out = await $.command.run({ command: 'leesho', args: 'alerts fajr,asr,maghrib' } as any)
  expect((out as any).text).toMatch(/^Alerts: fajr, maghrib\./)
})

async function startAndAsk($: any, on: On, store?: Record<string, unknown>): Promise<string> {
  memoryState(on)
  mock.store(on, store)
  mock.clock(on, { now: Date.UTC(2026, 10, 23, 9, 0) })
  on('theme.set', () => ({ value: { isDrawn: true, requestId: 'look' } }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'client' } }))
  on('ui.cancelNotify', () => ({ value: { isSent: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('command.register', (_, e) => ({ value: { command: (e as any).name } }))
  on('ui.toast', () => ({ value: undefined }))
  await $.session.start({ surface: 'terminal', cwd: 'C:/' } as any).catch(() => undefined)
  const out = await $.command.run({ command: 'leesho', args: '' } as any)

  return (out as any).text as string
}

test('a fresh install takes the city and calendar chosen at install', { options: { city: 'riyadh', calendar: 'ummalqura', alerts: 'none' } }, async ($, on) => {
  const text = await startAndAsk($, on)
  expect(text).toMatch(/تقويم أم القرى — الرياض/)
  expect(text).toMatch(/Alerts: none/)
})

test('a fresh install defaults to Umm al-Qura in Makkah with every alert', async ($, on) => {
  const text = await startAndAsk($, on)
  expect(text).toMatch(/تقويم أم القرى — مكة المكرمة/)
  expect(text).toMatch(/Alerts: fajr, dhuhr, asr, maghrib, isha/)
})

test('an install from before the options keeps its own Hadi settings in Dammam', async ($, on) => {
  const text = await startAndAsk($, on, {
    'prayer-settings': { calendar: 'hadi', alerts: ['fajr', 'dhuhr', 'maghrib'], hijriOffset: -1 },
  })
  expect(text).toMatch(/تقويم الهادي — الدمام/)
  expect(text).toMatch(/Alerts: fajr, dhuhr, maghrib/)
})
