/**
 * /lib/working-hours.ts
 * Helpers para conversão entre representação de UI (nomes de dias)
 * e formato de armazenamento no banco (chaves ISO numéricas '1'-'7').
 *
 * Formato canônico no banco (professionals.working_hours JSONB):
 *   {
 *     "1": [{"start": "09:00", "end": "12:00"}, {"start": "14:00", "end": "18:00"}],
 *     "2": [{"start": "09:00", "end": "18:00"}],
 *     "7": null   // dia fechado
 *   }
 *
 * Chave ISO: TO_CHAR(timestamp, 'ID') → '1'=Segunda ... '7'=Domingo
 * Compatível com is_slot_available em /sql/migrations/0007_fix_working_hours.sql
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

/** Chave ISO de dia da semana: '1'=Segunda ... '7'=Domingo */
export type WeekdayISO = '1' | '2' | '3' | '4' | '5' | '6' | '7'

export interface TimeWindow {
  start: string // "09:00"
  end: string   // "18:00"
}

/** working_hours no formato canônico do banco */
export type WorkingHoursISO = Partial<Record<WeekdayISO, TimeWindow[] | null>>

// ── Constantes ────────────────────────────────────────────────────────────────

/** Dias em ordem ISO (Segunda = 1) */
export const ISO_WEEKDAYS: WeekdayISO[] = ['1', '2', '3', '4', '5', '6', '7']

/** Rótulos em português para exibição na UI */
export const WEEKDAY_LABELS: Record<WeekdayISO, string> = {
  '1': 'Segunda-feira',
  '2': 'Terça-feira',
  '3': 'Quarta-feira',
  '4': 'Quinta-feira',
  '5': 'Sexta-feira',
  '6': 'Sábado',
  '7': 'Domingo',
}

/** Abreviações para displays compactos */
export const WEEKDAY_SHORT: Record<WeekdayISO, string> = {
  '1': 'Seg',
  '2': 'Ter',
  '3': 'Qua',
  '4': 'Qui',
  '5': 'Sex',
  '6': 'Sáb',
  '7': 'Dom',
}

// ── Conversões ────────────────────────────────────────────────────────────────

/**
 * Converte número ISO para rótulo legível.
 * @example dayIsoToLabel('1') → 'Segunda-feira'
 */
export function dayIsoToLabel(iso: WeekdayISO): string {
  return WEEKDAY_LABELS[iso]
}

/**
 * Converte rótulo de nome de dia para chave ISO.
 * Case-insensitive. Retorna null se não encontrar.
 * @example dayLabelToIso('segunda-feira') → '1'
 */
export function dayLabelToIso(name: string): WeekdayISO | null {
  const lower = name.toLowerCase().trim()
  const entry = Object.entries(WEEKDAY_LABELS).find(
    ([, label]) => label.toLowerCase() === lower
  )
  return entry ? (entry[0] as WeekdayISO) : null
}

// ── Validação de horários ─────────────────────────────────────────────────────

/**
 * Verifica se duas janelas de tempo se sobrepõem.
 */
export function windowsOverlap(a: TimeWindow, b: TimeWindow): boolean {
  return a.start < b.end && b.start < a.end
}

/**
 * Verifica se um array de janelas contém sobreposições.
 * Retorna o par que se sobrepõe, ou null se não houver.
 */
export function findOverlap(
  windows: TimeWindow[]
): [TimeWindow, TimeWindow] | null {
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start))
  for (let i = 0; i < sorted.length - 1; i++) {
    if (windowsOverlap(sorted[i], sorted[i + 1])) {
      return [sorted[i], sorted[i + 1]]
    }
  }
  return null
}

// ── Serialização ──────────────────────────────────────────────────────────────

/**
 * Serializa working_hours para o formato JSON do banco.
 * Remove dias com array vazio (substitui por null).
 */
export function serializeWorkingHours(hours: WorkingHoursISO): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [day, windows] of Object.entries(hours)) {
    if (!windows || windows.length === 0) {
      result[day] = null
    } else {
      result[day] = windows
    }
  }
  return result
}

/**
 * Desserializa working_hours do banco para o formato do componente.
 * Trata null como array vazio para facilitar edição na UI.
 */
export function deserializeWorkingHours(
  raw: Record<string, unknown> | null
): WorkingHoursISO {
  if (!raw) return {}
  const result: WorkingHoursISO = {}
  for (const day of ISO_WEEKDAYS) {
    const val = raw[day]
    if (Array.isArray(val)) {
      result[day] = val as TimeWindow[]
    } else if (val === null) {
      result[day] = null
    }
    // Se a chave não existe, o dia não é exibido na UI
  }
  return result
}

// ── Janela padrão ─────────────────────────────────────────────────────────────

export const DEFAULT_TIME_WINDOW: TimeWindow = { start: '09:00', end: '18:00' }
