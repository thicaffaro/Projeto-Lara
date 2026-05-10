/**
 * POST /api/onboarding/test-send
 * Executa os 3 micro-testes do passo 7 do onboarding.
 *
 * Micro-teste 1: Envia mensagem de teste via LARA_OFFICIAL_PHONE para o número da profissional
 * Micro-teste 2: Simula resposta da Lara a "tem horário pra limpeza?" (stub MVP)
 * Micro-teste 3: Mostra template booking_confirmation com dados reais (não envia)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendFromOfficialNumber } from '@/lib/whatsapp'

interface TestSendBody {
  professionalId: string
  testIndex: 0 | 1 | 2
}

function validateBody(body: unknown): body is TestSendBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    typeof b.professionalId === 'string' && b.professionalId.length > 0 &&
    (b.testIndex === 0 || b.testIndex === 1 || b.testIndex === 2)
  )
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  if (!validateBody(body)) {
    return NextResponse.json({ error: 'professionalId e testIndex são obrigatórios' }, { status: 400 })
  }

  const { professionalId, testIndex } = body
  const supabase = createAdminClient()

  const { data: professional, error: profError } = await supabase
    .from('professionals')
    .select('name, phone_number, protocols, service_mode, working_hours')
    .eq('id', professionalId)
    .single()

  if (profError || !professional) {
    return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })
  }

  // ── Micro-teste 1: mensagem de teste via número oficial Lara ─────────────
  if (testIndex === 0) {
    try {
      await sendFromOfficialNumber(
        professional.phone_number,
        `Oi ${professional.name}! Esta é a Lara confirmando que sua configuração funciona. 💛 `
        + `Se recebeu esta mensagem, pode clicar em "Recebi!".`,
      )
      return NextResponse.json({ ok: true, test: 'generic_message' }, { status: 200 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar'
      console.error('[test-send] Micro-teste 1 falhou:', msg, 'professional:', professionalId)

      await supabase.from('audit_log').insert({
        professional_id: professionalId,
        actor: 'system',
        action: 'onboarding_test_message_failed',
        new_data: { error: msg },
      }).catch(() => {})

      return NextResponse.json({ ok: false, error: msg }, { status: 502 })
    }
  }

  // ── Micro-teste 2: simulação de resposta da Lara (stub MVP) ──────────────
  // Será substituído pelo flow_inbound real no Prompt C.
  if (testIndex === 1) {
    const protocols = (professional.protocols as Array<{ name: string }> | null) ?? []
    const firstProtocol = protocols[0]?.name ?? 'limpeza de pele'

    // Gera horários disponíveis fictícios com base nos horários configurados
    const simulatedResponse =
      `Oi! 😊 Tenho sessão de ${firstProtocol} disponível `
      + `quinta às 14h ou sexta às 10h. Qual fica melhor para você?`

    return NextResponse.json({
      ok: true,
      test: 'booking_simulation',
      simulatedResponse,
      note: 'Stub MVP — resposta real gerada pelo motor de IA no Prompt C',
    }, { status: 200 })
  }

  // ── Micro-teste 3: preview do template booking_confirmation ───────────────
  // Mostra na tela — NÃO envia para WhatsApp.
  if (testIndex === 2) {
    const protocols = (professional.protocols as Array<{ name: string }> | null) ?? []
    const exampleProtocol = protocols[0]?.name ?? 'Limpeza de pele profunda'
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const exampleDate = tomorrow.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

    const templatePreview =
      `Olá Ana! Sua sessão de ${exampleProtocol} dia ${exampleDate} às 14h `
      + `está confirmada. Qualquer alteração é só me avisar. Obrigada! 💛`

    return NextResponse.json({
      ok: true,
      test: 'template_preview',
      templatePreview,
      templateName: 'booking_confirmation',
      variant: 'a',
      note: 'Preview com dados de exemplo. Template real usará dados da cliente.',
    }, { status: 200 })
  }

  return NextResponse.json({ error: 'testIndex inválido' }, { status: 400 })
}
