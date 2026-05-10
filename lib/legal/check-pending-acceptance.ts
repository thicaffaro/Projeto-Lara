/**
 * /lib/legal/check-pending-acceptance.ts
 * Verifica se o profissional tem documentos legais pendentes de aceite.
 *
 * LÓGICA:
 *   Para cada doc_type ('privacy_policy', 'terms_of_use'):
 *     1. Busca a versão mais recente com effective_at <= NOW()
 *     2. Verifica se o profissional aceitou EXATAMENTE essa versão
 *     3. Se não aceitou: adiciona ao array de pendentes com days_pending calculado
 *
 * HISTÓRICO:
 *   Aceitar a versão 3 NÃO invalida o aceite da versão 1 ou 2.
 *   Cada aceite é um registro distinto em professional_consents.
 *
 * BLOQUEIO GRADUAL:
 *   days_pending < 3  → só banner (não-dismissível)
 *   days_pending >= 3 → bloqueia ações de escrita via API (HTTP 451)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Tipos exportados ──────────────────────────────────────────────────────────

export type LegalDocType = 'privacy_policy' | 'terms_of_use'

export const LEGAL_DOC_LABELS: Record<LegalDocType, string> = {
  privacy_policy: 'Política de Privacidade',
  terms_of_use:   'Termos de Uso',
}

export interface PendingDoc {
  /** UUID do legal_document — usado no POST /api/legal/accept */
  id: string
  doc_type: LegalDocType
  version: number
  effective_at: string     // ISO date
  /** Dias desde effective_at — controla o bloqueio gradual */
  days_pending: number
  /** true se já passou do limite de dias de carência (3 dias) */
  write_blocked: boolean
}

export interface PendingAcceptanceResult {
  has_pending: boolean
  pending_docs: PendingDoc[]
  /** true se QUALQUER doc está bloqueando escrita (days_pending >= 3) */
  any_write_blocked: boolean
}

// ── Constante: dias de carência antes de bloquear escrita ─────────────────────

export const LEGAL_WRITE_BLOCK_DAYS = 3

// ── Função principal ──────────────────────────────────────────────────────────

/**
 * Verifica pendências legais para um profissional.
 * @param professionalId UUID do profissional
 * @param supabaseClient Cliente Supabase a usar (padrão: admin client)
 */
export async function checkPendingAcceptance(
  professionalId: string,
  supabaseClient?: SupabaseClient,
): Promise<PendingAcceptanceResult> {
  const supabase = supabaseClient ?? createAdminClient()
  const now      = new Date().toISOString()

  const DOC_TYPES: LegalDocType[] = ['privacy_policy', 'terms_of_use']
  const pending_docs: PendingDoc[] = []

  for (const docType of DOC_TYPES) {
    // 1. Versão mais recente publicada (effective_at <= NOW())
    const { data: latestRaw } = await supabase
      .from('legal_documents')
      .select('id, version, effective_at')
      .eq('doc_type', docType)
      .lte('effective_at', now)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const latest = latestRaw as unknown as {
      id: string; version: number; effective_at: string
    } | null

    if (!latest) continue // nenhuma versão publicada ainda

    // 2. Verifica se profissional aceitou ESTA versão específica
    const { data: consent } = await supabase
      .from('professional_consents')
      .select('id')
      .eq('professional_id', professionalId)
      .eq('doc_type', docType)
      .eq('legal_document_id', latest.id)
      .maybeSingle()

    if (consent) continue // já aceitou esta versão

    // 3. Não aceitou — calcula dias de pendência
    const effectiveDate = new Date(latest.effective_at)
    const daysPending   = Math.floor((Date.now() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24))

    pending_docs.push({
      id:            latest.id,
      doc_type:      docType,
      version:       latest.version,
      effective_at:  latest.effective_at,
      days_pending:  Math.max(0, daysPending),
      write_blocked: daysPending >= LEGAL_WRITE_BLOCK_DAYS,
    })
  }

  return {
    has_pending:       pending_docs.length > 0,
    pending_docs,
    any_write_blocked: pending_docs.some(d => d.write_blocked),
  }
}
