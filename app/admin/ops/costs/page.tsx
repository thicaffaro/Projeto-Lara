import { createAdminClient } from '@/lib/supabase/admin'

const LLM_COST_PER_MSG = 0.001   // ~US$0.001 por mensagem respondida pelo LLM
const SMS_COST         = 0.10    // R$0.10 por SMS (Twilio)
const TEMPLATE_COST    = 0.05    // R$0.05 por template enviado

export default async function AdminOpsCostsPage() {
  const supabase = createAdminClient()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [{ count: laraReplied }, { count: smsCount }, { count: templatesSent }] = await Promise.all([
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('sent_by', 'lara').gte('created_at', monthStart),
    supabase.from('recovery_tokens').select('id', { count: 'exact', head: true }).eq('channel', 'sms').gte('created_at', monthStart),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('direction', 'outbound').eq('message_type', 'template').gte('created_at', monthStart),
  ])

  const llmCost       = (laraReplied ?? 0) * LLM_COST_PER_MSG
  const smsCost       = (smsCount    ?? 0) * SMS_COST
  const templateCost  = (templatesSent ?? 0) * TEMPLATE_COST
  const total         = llmCost + smsCost + templateCost

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Custos estimados — {new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</h1>
      <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-4 py-2">Estimativa. Sem billing real de APIs no MVP.</p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'LLM (msgs respondidas)', value: `R$ ${llmCost.toFixed(2)}`, sub: `${laraReplied ?? 0} msgs` },
          { label: 'Twilio SMS', value: `R$ ${smsCost.toFixed(2)}`, sub: `${smsCount ?? 0} SMS` },
          { label: 'WhatsApp Templates', value: `R$ ${templateCost.toFixed(2)}`, sub: `${templatesSent ?? 0} enviados` },
          { label: 'Total estimado', value: `R$ ${total.toFixed(2)}`, sub: 'este mês' },
        ].map(k => (
          <div key={k.label} className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-xl font-bold text-gray-900">{k.value}</p>
            <p className="text-xs font-medium text-gray-500 mt-0.5">{k.label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
