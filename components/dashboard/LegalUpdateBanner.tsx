'use client'

/**
 * LegalUpdateBanner.tsx
 * Banner fixo que aparece quando há documentos legais pendentes de aceite.
 *
 * BLOQUEIO GRADUAL:
 *   Dias 0-2: banner amarelo não-dismissível (sem botão X)
 *   Dia 3+:   banner vermelho + modal bloqueia ações de escrita
 *
 * O bloqueio de escrita é DUPLO:
 *   1. UI: modal forçado antes de qualquer ação de escrita
 *   2. API: rotas de escrita retornam 451 (check no middleware/handler)
 *      → Curl/Postman não bypassa
 *
 * Não tem botão X — profissional só sai lendo + aceitando ou fazendo logout.
 */

import { useState, useEffect, useCallback } from 'react'
import type { PendingDoc, PendingAcceptanceResult } from '@/lib/legal/check-pending-acceptance'
import { LEGAL_DOC_LABELS } from '@/lib/legal/check-pending-acceptance'

// ── Modal de leitura + aceite ──────────────────────────────────────────────────

function LegalAcceptModal({
  doc,
  onAccepted,
  onClose,
}: {
  doc: PendingDoc
  onAccepted: () => void
  onClose?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string>()

  async function handleAccept() {
    setLoading(true)
    setError(undefined)
    try {
      const res = await fetch('/api/legal/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: doc.doc_type, version_id: doc.id }),
      })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) { setError(json.error ?? 'Erro ao registrar aceite.'); return }
      onAccepted()
    } catch {
      setError('Erro de rede. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const label = LEGAL_DOC_LABELS[doc.doc_type]

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div>
          <h2 id="legal-modal-title" className="text-base font-bold text-gray-900">
            Atualização: {label}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Versão {doc.version} — vigente desde{' '}
            {new Date(doc.effective_at).toLocaleDateString('pt-BR')}
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 max-h-60 overflow-y-auto">
          <p className="text-xs text-gray-500">
            Para ler o documento completo, clique no link abaixo:
          </p>
          <a
            href={`/api/legal/current`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block text-sm text-rose-500 underline-offset-2 hover:underline"
          >
            Ler {label} completa →
          </a>
        </div>

        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={handleAccept}
            disabled={loading}
            className="flex-1 rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50"
          >
            {loading ? 'Registrando…' : 'Li e aceito'}
          </button>
          {onClose && (
            <a
              href="/auth/signout"
              className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-500 hover:bg-gray-50"
            >
              Sair
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function LegalUpdateBanner() {
  const [result,       setResult]       = useState<PendingAcceptanceResult | null>(null)
  const [showModal,    setShowModal]    = useState(false)
  const [activeDoc,    setActiveDoc]    = useState<PendingDoc | null>(null)
  const [loading,      setLoading]      = useState(true)

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch('/api/legal/pending', { cache: 'no-store' })
      if (res.ok) setResult(await res.json() as PendingAcceptanceResult)
    } catch {
      // Fail silencioso — banner não aparece em falha de rede
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPending() }, [fetchPending])

  function handleDocAccepted() {
    setShowModal(false)
    setActiveDoc(null)
    // Re-verifica pendências — pode ainda ter outro doc pendente
    fetchPending()
  }

  function openModal(doc: PendingDoc) {
    setActiveDoc(doc)
    setShowModal(true)
  }

  // Nada pendente ou carregando
  if (loading || !result?.has_pending) return null

  const firstPending   = result.pending_docs[0]
  const isWriteBlocked = result.any_write_blocked

  const label = LEGAL_DOC_LABELS[firstPending.doc_type]

  return (
    <>
      {/* Banner fixo no topo — SEM botão X (não-dismissível) */}
      <div
        role="alert"
        aria-live="polite"
        className={`w-full px-4 py-3 ${
          isWriteBlocked
            ? 'bg-red-500 text-white'
            : 'bg-amber-400 text-amber-900'
        }`}
      >
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <span aria-hidden="true" className="shrink-0 text-lg">
              {isWriteBlocked ? '🚫' : '⚠️'}
            </span>
            <p className="text-sm font-medium">
              {isWriteBlocked
                ? `Ações bloqueadas. Você precisa aceitar a ${label} antes de continuar.`
                : `Atualizamos nossa ${label}. Por favor, leia e aceite para continuar usando a Lara.`}
              {result.pending_docs.length > 1 && (
                <span className="ml-1 font-normal opacity-80">
                  (+{result.pending_docs.length - 1} documento{result.pending_docs.length - 1 > 1 ? 's' : ''})
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => openModal(firstPending)}
              className={`rounded-xl px-4 py-1.5 text-sm font-semibold transition ${
                isWriteBlocked
                  ? 'bg-white text-red-600 hover:bg-red-50'
                  : 'bg-amber-700 text-white hover:bg-amber-800'
              }`}
            >
              Ler e aceitar
            </button>
            {/* Logout sempre disponível — mesmo em bloqueio total */}
            <a
              href="/auth/signout"
              className={`text-xs underline-offset-2 hover:underline ${
                isWriteBlocked ? 'text-red-100' : 'text-amber-700'
              }`}
            >
              Sair
            </a>
          </div>
        </div>
      </div>

      {/* Modal de leitura + aceite */}
      {showModal && activeDoc && (
        <LegalAcceptModal
          doc={activeDoc}
          onAccepted={handleDocAccepted}
          onClose={isWriteBlocked ? undefined : () => setShowModal(false)}
        />
      )}

      {/* Bloqueio de escrita: modal forçado quando isWriteBlocked */}
      {isWriteBlocked && !showModal && (
        <LegalAcceptModal
          doc={firstPending}
          onAccepted={handleDocAccepted}
          // sem onClose = modal não pode ser fechado
        />
      )}
    </>
  )
}
