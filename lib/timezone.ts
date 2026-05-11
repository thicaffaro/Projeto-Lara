/**
 * /lib/timezone.ts
 * Helpers para formatação de datas no timezone da profissional.
 * Usa date-fns-tz (já instalado).
 */

import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz'
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek } from 'date-fns'

const DEFAULT_TZ = 'America/Sao_Paulo'

/** Formata data no timezone especificado */
export function formatTz(
  date: Date | string | number,
  pattern: string,
  timezone: string = DEFAULT_TZ,
): string {
  return formatInTimeZone(date, timezone, pattern)
}

/** Hora atual no formato HH:mm no timezone */
export function nowTimeInTz(timezone: string = DEFAULT_TZ): string {
  return formatInTimeZone(new Date(), timezone, 'HH:mm')
}

/** Retorna início do dia (00:00:00) no timezone da profissional como Date UTC */
export function startOfDayInTz(date: Date | string, timezone: string = DEFAULT_TZ): Date {
  const zoned = toZonedTime(date, timezone)
  const dayStart = startOfDay(zoned)
  return fromZonedTime(dayStart, timezone)
}

/** Retorna fim do dia (23:59:59) no timezone da profissional como Date UTC */
export function endOfDayInTz(date: Date | string, timezone: string = DEFAULT_TZ): Date {
  const zoned = toZonedTime(date, timezone)
  const dayEnd = endOfDay(zoned)
  return fromZonedTime(dayEnd, timezone)
}

/** Retorna início da semana (segunda) no timezone */
export function startOfWeekInTz(date: Date | string, timezone: string = DEFAULT_TZ): Date {
  const zoned = toZonedTime(date, timezone)
  const weekStart = startOfWeek(zoned, { weekStartsOn: 1 })
  return fromZonedTime(weekStart, timezone)
}

/** Retorna fim da semana (domingo) no timezone */
export function endOfWeekInTz(date: Date | string, timezone: string = DEFAULT_TZ): Date {
  const zoned = toZonedTime(date, timezone)
  const weekEnd = endOfWeek(zoned, { weekStartsOn: 1 })
  return fromZonedTime(weekEnd, timezone)
}

/** Converte timestamp UTC para Date no timezone da profissional (para exibição) */
export function toZonedDate(utcDate: Date | string, timezone: string = DEFAULT_TZ): Date {
  return toZonedTime(utcDate, timezone)
}

/** Formata horário para exibição: "14:00" */
export function formatTime(date: Date | string, timezone: string = DEFAULT_TZ): string {
  return formatTz(date, 'HH:mm', timezone)
}

/** Formata data para exibição: "seg, 15/01" */
export function formatDateShort(date: Date | string, timezone: string = DEFAULT_TZ): string {
  return formatTz(date, "EEE, dd/MM", timezone)
}

/** Formata data longa: "Segunda-feira, 15 de janeiro" */
export function formatDateLong(date: Date | string, timezone: string = DEFAULT_TZ): string {
  return formatTz(date, "EEEE, dd 'de' MMMM", timezone)
}

/** Verifica se uma data está "hoje" no timezone da profissional */
export function isTodayInTz(date: Date | string, timezone: string = DEFAULT_TZ): boolean {
  const todayStr  = formatTz(new Date(), 'yyyy-MM-dd', timezone)
  const dateStr   = formatTz(date, 'yyyy-MM-dd', timezone)
  return todayStr === dateStr
}

/** Retorna array de 7 dias da semana (segunda a domingo) no timezone */
export function getWeekDays(referenceDate: Date, timezone: string = DEFAULT_TZ): Date[] {
  const weekStart = startOfWeekInTz(referenceDate, timezone)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
}

/** Retorna "hoje", "amanhã" ou a data formatada */
export function formatRelativeDate(date: Date | string, timezone: string = DEFAULT_TZ): string {
  const today    = formatTz(new Date(), 'yyyy-MM-dd', timezone)
  const tomorrow = formatTz(new Date(Date.now() + 86_400_000), 'yyyy-MM-dd', timezone)
  const dateStr  = formatTz(date, 'yyyy-MM-dd', timezone)

  if (dateStr === today)    return 'hoje'
  if (dateStr === tomorrow) return 'amanhã'
  return formatTz(date, "dd/MM", timezone)
}

export { format }
