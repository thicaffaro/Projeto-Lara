'use client'

/**
 * SetupTestStep.tsx — Passo 7 do onboarding
 * 3 micro-testes end-to-end sequenciais.
 *
 * Micro-teste 1: Mensagem de teste via LARA_OFFICIAL_PHONE → WhatsApp da profissional
 * Micro-teste 2: Simulação de resposta da Lara a "tem horário?" (stub MVP)
 * Micro-teste 3: Preview do template booking_confirmation com dados reais
 *
 * onboarding_completed=TRUE apenas se todos 3 passaram (✅ ou ⚠️).
 * ❌ bloqueia conclusão e oferece "Tentar novamente" ou "Falar com suporte".
 */

import { useState } from 'react'
import type { TestResult } from '@/lib/onboarding-types'

interface SetupTestStepProps {
  professionalId: string
  initial: TestResult[]
  onComplete: (results: TestResult[]) => void
}

const LARA_SUPPORT_HREF = 'https://wa.me/5511978663056'

const TEST_META = [
  {
    title: 'Mensagem de teste',
    description: 'A Lara vai te enviar uma mensagem de teste. Verifica se chegou no seu WhatsApp?',
    confirmLabel: 'Recebi a mensagem!',
    failLabel: 'Não recebi',
  },
  {
    title: 'Simulação de pergunta de cliente',
    description: 'Vamos simular: a Lara vai mostrar como responderia a "tem horário pra limpeza essa semana?"',
    confirmLabel: 'Tá bom!',
    failLabel: 'Tá estranho',
  },
  {
    title: 'Preview de confirmação de sessão',
    description: 'Última: vamos mostrar como a Lara confirma uma sessão para a cliente.',
    confirmLabel: 'Faz sentido!',
    failLabel: 'Quero mudar',
  },
]

type TestStatus = 'idle' | 'running' | 'waiting_user' | 'passed' | 'warned' | 'failed'

export function SetupTestStep({ professionalId, initial, onComplete }: SetupTestStepProps) {
  const [statuses, setStatuses] = useState<TestStatus[]>([
    initial[0].passed === null ? 'idle' : initial[0].passed ? 'passed' : 'failed',
    initial[1].passed === null ? 'idle' : initial[1].passed ? 'passed' : 'failed',
    initial[2].passed === null ? 'idle' : initial[2].passed ? 'passed' : 'failed',
  ])
  const [currentTest, setCurrentTest] = useState(0)
  const [apiResult, setApiResult]     = useState<Record<number, string>>({})
  const [results, setResults]         = useState<TestResult[]>(initial)

  async function runTest(index: number) {
    setStatuses(s => {
      const copy = [...s]
      copy[index] = 'running'
      return copy
    })

    try {
      const res = await fetch('/api/onboarding/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professionalId, testIndex: index }),
      })
      const json = await res.json()

      if (!res.ok || !json.ok) {
        setStatuses(s => { const c = [...s]; c[index] = 'failed'; return c })
        return
      }

      // Micro-teste 1: aguarda confirmação do usuário (a mensagem foi enviada)
      if (index === 0) {
        setStatuses(s => { const c = [...s]; c[index] = 'waiting_user'; return c })
        return
      }

      // Micro-testes 2 e 3: mostra resultado simulado e aguarda confirmação
      const display = json.simulatedResponse ?? json.templatePreview ?? ''
      setApiResult(r => ({ ...r, [index]: display }))
      setStatuses(s => { const c = [...s]; c[index] = 'waiting_user'; return c })

    } catch {
      setStatuses(s => { const c = [...s]; c[index] = 'failed'; return c })
    }
  }

  function handleUserConfirm(index: number, passed: boolean) {
    const status: TestStatus = passed ? 'passed' : (index === 0 ? 'failed' : 'warned')
    setStatuses(s => { const c = [...s]; c[index] = status; return c })

    const testName = ['generic_message', 'booking_simulation', 'template_preview'][index] as TestResult['test']
    const newResults = results.map((r, i) =>
      i === index
        ? { ...r, passed, warning: !passed && index > 0 ? 'Profissional marcou como estranho' : undefined }
        : r
    )
    setResults(newResults)

    // Avança para próximo teste automaticamente
    if (index < 2) {
      setCurrentTest(index + 1)
    }
  }

  function handleComplete() {
    onComplete(results)
  }

  const allDone = statuses.every(s => s === 'passed' || s === 'warned')
  const anyFailed = statuses.some(s => s === 'failed')

  const STATUS_ICON: Record<TestStatus, string> = {
    idle:         '○',
    running:      '⏳',
    waiting_user: '👀',
    passed:       '✅',
    warned:       '⚠️',
    failed:       '❌',
  }

  return (
    <div className="space-y-4">
      {TEST_META.map((meta, index) => {
        const status = statuses[index]
        const isActive = index === currentTest
        const isLocked = index > currentTest && statuses[index - 1] === 'idle'

        return (
          <div
            key={index}
            className={`rounded-2xl border-2 p-5 transition ${
              status === 'passed' || status === 'warned' ? 'border-green-200 bg-green-50'
              : status === 'failed'     ? 'border-red-200 bg-red-50'
              : isActive                ? 'border-rose-300 bg-white'
              : 'border-gray-100 bg-gray-50 opacity-60'
            }`}
          >
            {/* Cabeçalho do teste */}
            <div className="flex items-center gap-3">
              <span className="text-xl" aria-hidden="true">{STATUS_ICON[status]}</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Teste {index + 1}: {meta.title}
                </p>
                <p className="text-xs text-gray-500">{meta.description}</p>
              </div>
            </div>

            {/* Resultado da API (testes 2 e 3) */}
            {(status === 'waiting_user' || status === 'passed' || status === 'warned') &&
             apiResult[index] && (
              <div className="mt-3 rounded-xl bg-white p-3 border border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-1">Resposta simulada:</p>
                <p className="text-sm text-gray-800 leading-relaxed">{apiResult[index]}</p>
              </div>
            )}

            {/* Ações */}
            {isActive && status === 'idle' && !isLocked && (
              <button
                onClick={() => runTest(index)}
                className="mt-3 w-full rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white hover:bg-rose-600"
              >
                {index === 0 ? 'Enviar mensagem de teste' : 'Iniciar teste'}
              </button>
            )}

            {status === 'running' && (
              <p className="mt-3 text-center text-xs text-gray-400 animate-pulse">Executando...</p>
            )}

            {status === 'waiting_user' && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleUserConfirm(index, true)}
                  className="flex-1 rounded-xl bg-green-500 py-2.5 text-sm font-semibold text-white hover:bg-green-600"
                >
                  {meta.confirmLabel}
                </button>
                <button
                  onClick={() => handleUserConfirm(index, false)}
                  className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  {meta.failLabel}
                </button>
              </div>
            )}

            {status === 'failed' && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-red-600">
                  {index === 0
                    ? 'Não recebeu a mensagem. Verifique sua conexão e se o número está correto.'
                    : 'Anotamos! Você poderá ajustar isso pelo painel depois.'}
                </p>
                <button
                  onClick={() => {
                    setStatuses(s => { const c = [...s]; c[index] = 'idle'; return c })
                    runTest(index)
                  }}
                  className="w-full rounded-xl border border-red-300 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {status === 'warned' && (
              <p className="mt-2 text-xs text-amber-600">
                Anotamos! Você poderá ajustar isso pelo painel depois.
              </p>
            )}
          </div>
        )
      })}

      {/* Suporte sempre visível em caso de falha */}
      {anyFailed && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-sm text-amber-800 mb-2">Precisa de ajuda? Fale com nosso suporte.</p>
          <a
            href={LARA_SUPPORT_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-amber-700 underline-offset-2 hover:underline"
          >
            💬 Falar com suporte pelo WhatsApp
          </a>
        </div>
      )}

      {/* Botão de conclusão */}
      {allDone && (
        <button
          onClick={handleComplete}
          className="w-full rounded-xl bg-rose-500 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-rose-600"
        >
          Concluir configuração ✨
        </button>
      )}
    </div>
  )
}
