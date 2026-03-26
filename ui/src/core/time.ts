const EASTERN_TIME_ZONE = 'America/New_York'

const easternTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
})

const easternPreciseTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
  hour12: true,
})

interface EasternTimeFormatOptions {
  precise?: boolean
}

export function formatEasternTime(value: string | Date, options?: EasternTimeFormatOptions): string {
  const date = typeof value === 'string' ? new Date(value) : value

  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : ''
  }

  const formatter = options?.precise ? easternPreciseTimeFormatter : easternTimeFormatter
  return `${formatter.format(date)} ET`
}
