/**
 * /lib/protocols.ts
 * Catálogo de protocolos disponíveis na Lara.
 *
 * "protocolo" = serviço estético (nunca usar "serviço" na UI — ver /docs/glossary.md)
 * Catálogo inicial: 26 protocolos em 3 categorias.
 */

export type ProtocolCategory = 'facial' | 'corporal' | 'complementar'

export interface ProtocolSuggestion {
  /** Nome exibido na UI e armazenado em appointments.protocol_name */
  name: string
  /** Duração padrão em minutos (editável pela profissional) */
  duration_min: number
  /** Categoria do protocolo */
  category: ProtocolCategory
}

/**
 * Catálogo completo de protocolos sugeridos.
 * 10 faciais + 10 corporais + 6 complementares = 26 total.
 *
 * A profissional pode adicionar protocolos personalizados além deste catálogo.
 * Esses são armazenados em professionals.protocols (JSONB).
 */
export const PROTOCOL_CATALOG: ProtocolSuggestion[] = [
  // ── Faciais (10) ─────────────────────────────────────────────────────────
  { name: 'Limpeza de pele profunda',   duration_min: 90, category: 'facial' },
  { name: 'Limpeza de pele simples',    duration_min: 60, category: 'facial' },
  { name: 'Peeling químico',            duration_min: 60, category: 'facial' },
  { name: 'Peeling de diamante',        duration_min: 45, category: 'facial' },
  { name: 'Microagulhamento',           duration_min: 60, category: 'facial' },
  { name: 'Radiofrequência facial',     duration_min: 45, category: 'facial' },
  { name: 'Hidratação facial',          duration_min: 60, category: 'facial' },
  { name: 'Drenagem facial',            duration_min: 60, category: 'facial' },
  { name: 'Alta frequência',            duration_min: 30, category: 'facial' },
  { name: 'Jato de plasma',             duration_min: 60, category: 'facial' },

  // ── Corporais (10) ───────────────────────────────────────────────────────
  { name: 'Massagem relaxante',         duration_min: 60, category: 'corporal' },
  { name: 'Massagem modeladora',        duration_min: 60, category: 'corporal' },
  { name: 'Drenagem linfática',         duration_min: 60, category: 'corporal' },
  { name: 'Massagem desportiva',        duration_min: 60, category: 'corporal' },
  { name: 'Pedras quentes',             duration_min: 90, category: 'corporal' },
  { name: 'Reflexologia podal',         duration_min: 45, category: 'corporal' },
  { name: 'Ventosaterapia',             duration_min: 60, category: 'corporal' },
  { name: 'Bambuterapia',               duration_min: 60, category: 'corporal' },
  { name: 'Drenagem pós-operatório',    duration_min: 90, category: 'corporal' },
  { name: 'Microcorrente corporal',     duration_min: 60, category: 'corporal' },

  // ── Complementar (6) ─────────────────────────────────────────────────────
  { name: 'Design de sobrancelha',      duration_min: 30, category: 'complementar' },
  { name: 'Hena de sobrancelha',        duration_min: 45, category: 'complementar' },
  { name: 'Lash lifting',               duration_min: 60, category: 'complementar' },
  { name: 'Extensão de cílios',         duration_min: 90, category: 'complementar' },
  { name: 'Depilação a cera quente',    duration_min: 60, category: 'complementar' },
  { name: 'Depilação a laser',          duration_min: 45, category: 'complementar' },
]

/** Retorna protocolos filtrados por categoria */
export function getProtocolsByCategory(category: ProtocolCategory): ProtocolSuggestion[] {
  return PROTOCOL_CATALOG.filter(p => p.category === category)
}

/** Retorna protocolo pelo nome exato (case-insensitive) */
export function findProtocolByName(name: string): ProtocolSuggestion | undefined {
  return PROTOCOL_CATALOG.find(
    p => p.name.toLowerCase() === name.toLowerCase()
  )
}

/** Retorna duração padrão de um protocolo pelo nome, ou 60 min como fallback */
export function getDefaultDuration(protocolName: string): number {
  return findProtocolByName(protocolName)?.duration_min ?? 60
}

/** Total de protocolos no catálogo */
export const PROTOCOL_COUNT = PROTOCOL_CATALOG.length // 26
