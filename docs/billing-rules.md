# Regras de Cobrança — Lara

**Versão:** 1.0 | **Última atualização:** 2025-01

Política completa de pausa e retomada de cobrança do plano Lara (R$ 99/mês via Mercado Pago).

---

## Plano e cobrança

- **Valor:** R$ 99/mês, recorrente via Mercado Pago Preapproval
- **Trial:** 7 dias gratuitos, inicia quando 4/5 (studio) ou 5/6 (home) templates Meta são aprovados
- **Registro:** `subscriptions.status`, `subscriptions.mp_subscription_id`

---

## Política de pausa automática

### Quando pausa

**Condição:** `whatsapp_status = 'token_invalid'` por **7 dias contínuos**.

Verificado via `whatsapp_status_changed_at`:
```sql
WHERE whatsapp_status = 'token_invalid'
  AND whatsapp_status_changed_at < NOW() - INTERVAL '7 days'
  AND billing_paused_at IS NULL
  AND subscriptions.status NOT IN ('cancelled', 'past_due')
```

**Importante — janela CONTÍNUA, não acumulada:**
- A janela conta a partir do momento em que o status entrou em `token_invalid`
- O trigger `trg_whatsapp_status_changed` registra `whatsapp_status_changed_at = NOW()` a cada mudança de status
- Se profissional reconectou no dia 5 e voltou a falhar no dia 6 → janela reinicia do 0 (não acumula os 5 dias anteriores)

### Como pausa

1. `mercadopago.pausePreapproval(mp_subscription_id)` — PUT `/preapproval/:id` com `{ status: 'paused' }`
2. `professionals.billing_paused_at = NOW()` — registra timestamp da pausa
3. `subscriptions.status = 'past_due'`, `subscriptions.mp_paused_at = NOW()`
4. Notificação WhatsApp: "💛 Pausamos sua cobrança porque sua conexão com a Meta expirou há mais de 7 dias."
5. Audit log: `action='billing_paused_token_invalid'`

### Idempotência

`billing_paused_at IS NULL` no WHERE garante que rodar a função 10x em sequência pausa apenas **uma vez**. As chamadas subsequentes não encontram nenhum resultado elegível.

---

## Política de retomada automática

### Quando retoma

Imediatamente após reconexão bem-sucedida via `POST /api/onboarding/reconnect`.

### Como retoma

1. Verifica `billing_paused_at IS NOT NULL` — se NULL, retorna sem ação
2. `mercadopago.resumePreapproval(mp_subscription_id)` — PUT `/preapproval/:id` com `{ status: 'authorized' }`
3. `professionals.billing_paused_at = NULL`
4. `subscriptions.status = 'active'`, `subscriptions.mp_paused_at = NULL`
5. Notificação WhatsApp: "🎉 Sua cobrança foi retomada. Bom te ter de volta!"
6. Audit log: `action='billing_resumed_token_recovered'`

### Degradação graceful

A retomada é fire-and-forget no endpoint de reconexão. Se a API MP falhar:
- A reconexão do WhatsApp **não é bloqueada** — profissional pode usar o serviço
- `billing_paused_at` permanece preenchido
- Audit log registra `billing_resume_failed`
- No próximo run do cron `checkAndPauseInvalidTokens`, se a profissional já reconectou, ela não reaparece na lista (não está mais em `token_invalid`)
- A retomada manual via cron separado `checkAndResumePending` (a implementar no Prompt E) deve ser criada para cobrir este cenário

---

## Edge cases

### Profissional reconecta antes dos 7 dias

**Resultado:** Cobrança **não pausa**. `billing_paused_at` continua NULL.

- `checkAndPauseInvalidTokens` só age em `whatsapp_status_changed_at < NOW() - 7 days`
- Reconexão antes desse prazo atualiza `whatsapp_status = 'connected'` e `whatsapp_status_changed_at = NOW()`
- A janela de 7 dias nunca é atingida

### Profissional cancela durante a pausa

**Resultado:** Cobrança **não retoma**.

- `cancelamento → subscriptions.status = 'cancelled'`
- `resumeBillingForProfessional` verifica `billing_paused_at IS NOT NULL` mas não verifica o status de cancelamento
- **ATENÇÃO:** se profissional cancelou e depois tenta reconectar, a `resumePreapproval` será chamada mas o MP deverá rejeitar (assinatura cancelada). O erro é capturado, logado e não bloqueia a reconexão.
- Melhoria futura: verificar `subscriptions.status !== 'cancelled'` antes de tentar retomar

### API Mercado Pago falha ao pausar

**Resultado:** `billing_pause_failed` no audit_log, `billing_paused_at` permanece NULL.

- `checkAndPauseInvalidTokens` trata o erro com `catch`, loga e continua para o próximo profissional
- No próximo run do cron, a mesma profissional reaparece (ainda em `token_invalid` > 7 dias e `billing_paused_at IS NULL`)
- Retry automático garantido pelo design do cron (Prompt E)

### API Mercado Pago falha ao retomar

**Resultado:** `billing_resume_failed` no audit_log, `billing_paused_at` permanece preenchido.

- Profissional já reconectou e pode usar o serviço normalmente
- Cobrança ainda está pausada no MP — pode haver ciclo sem cobrança inesperado
- Necessário criar `checkAndResumePending` no Prompt E para processar esses casos

### Profissional cancela durante a pausa

**Resultado:** Cobrança **não retoma** — verificação de status impede chamada ao MP.

Fluxo do risco sem proteção:
1. Token expira → 7 dias → `billing_paused_at` preenchido, `subscriptions.status = 'past_due'`
2. Profissional cancela assinatura → `subscriptions.status = 'cancelled'`
3. Meses depois, reconecta por qualquer motivo
4. Sem proteção: `resumePreapproval` reativaria assinatura cancelada → **cobrança indevida**

**Proteção implementada em `auto-resume.ts`:**

```typescript
// 1. Bloqueia se cancelada — não há cobrança legítima a retomar
if (sub.status === 'cancelled' || sub.status === 'cancelled_pending_anonymization') {
  // Limpa billing_paused_at (sem chamar MP) + audit log
  return  // saída limpa
}

// 2. Bloqueia se status inesperado — só retoma quando 'past_due'
if (sub.status !== 'past_due') {
  // audit log + return
}

// 3. Seguro: status é 'past_due' → resumePreapproval()
```

Audit logs gerados:
- `billing_resume_skipped_cancelled` — cancelamento detectado, billing_paused_at limpo
- `billing_resume_skipped_unexpected_status` — estado inconsistente, nenhuma ação

### Profissional sem `mp_subscription_id`

**Resultado:** Pausa e retomada são ignoradas com warning.

- Pode ocorrer se profissional está em trial ou se o MP não registrou a assinatura
- `auto-resume.ts` limpa `billing_paused_at = NULL` mesmo sem chamar o MP (para não travar a conta)

---

## Execução do cron

`checkAndPauseInvalidTokens()` deve ser chamada pelo n8n (Railway) — a ser configurado no Prompt E.

Frequência recomendada: **1x por dia** (ex: 6h da manhã, horário de Brasília).

Teste manual:
```bash
# A implementar no Prompt E
tsx scripts/billing/check-pause.ts
```

---

## Arquivos relacionados

| Arquivo | Responsabilidade |
|---|---|
| `/lib/mercadopago.ts` | `pausePreapproval`, `resumePreapproval` — calls à API MP com retry |
| `/lib/billing/auto-pause.ts` | `checkAndPauseInvalidTokens` — batch de pausa |
| `/lib/billing/auto-resume.ts` | `resumeBillingForProfessional` — retomada individual |
| `/app/api/onboarding/reconnect/route.ts` | Chama `resumeBillingForProfessional` após reconexão |
| `/app/api/webhooks/mercadopago/route.ts` | Recebe webhooks do MP (criado, atualizado, cancelado) |
