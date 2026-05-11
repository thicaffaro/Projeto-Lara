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
      }).then(null, () => {})

      return NextResponse.json({ ok: false, error: msg }, { status: 502 })
    }
  }

  // ── Micro-teste 2: envia mensagem real via número da profissional ───────────
  // Testa que a profissional consegue ENVIAR via WhatsApp Business (não apenas receber).
  // Usa sendTextMessage do número da profissional para o próprio número dela.
  if (testIndex === 1) {
    const phoneNumberId = (professional as unknown as { meta_phone_number_id: string | null }).meta_phone_number_id

    if (!phoneNumberId) {
      return NextResponse.json({ ok: false, error: 'meta_phone_number_id não configurado' }, { status: 400 })
    }

    try {
      const { sendTextMessage, getProfessionalToken } = await import('@/lib/whatsapp')
      // Decriptografa token para envio
      const token = await getProfessionalToken(professionalId)

      // Envia do número da profissional → para o próprio número dela (confirma envio)
      await sendTextMessage(
        phoneNumberId,
        token,
        (professional as unknown as { phone_number: string }).phone_number,
        `Olá! Esta é a Lara testando sua conexão. 😊 Se recebeu, está tudo funcionando!`,
        professionalId,
      )

      const protocols = (professional.protocols as Array<{ name: string }> | null) ?? []
      const firstProtocol = protocols[0]?.name ?? 'limpeza de pele'

      return NextResponse.json({
        ok: true,
        test: 'booking_simulation',
        simulatedResponse: `Oi! 😊 Tenho sessão de ${firstProtocol} disponível quinta às 14h ou sexta às 10h. Qual fica melhor para você?`,
        note: 'Mensagem de teste enviada via número da profissional (Prompt C implementado)',
      }, { status: 200 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar'
      return NextResponse.json({ ok: false, error: msg }, { status: 502 })
    }
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
