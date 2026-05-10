# Templates Meta — Lara

**Versão:** 1.0 | **Última atualização:** 2025-01

Documentação da gestão de templates WhatsApp Business (categoria UTILITY).
Ver `/docs/onboarding.md` para contexto de como os templates se relacionam com o trial.

---

## Catálogo de templates

6 nomes × 3 variantes = 18 templates submetidos por profissional.

| Nome | Parâmetros | Variante A | Variante B | Variante C |
|---|---|---|---|---|
| `booking_confirmation` | nome, protocolo, dia, hora | Amigável (💛) | Neutro | Formal |
| `reminder_24h` | nome, hora, protocolo | Amigável (✨) | Neutro | Formal |
| `reminder_2h` | nome, protocolo | Amigável (💛) | Neutro | Formal |
| `cancellation` | nome, protocolo, dia | Amigável (💛) | Neutro | Formal |
| `reschedule_request` | nome, protocolo, diaAntigo, novoDia | Amigável (💛) | Neutro | Formal |
| `home_visit_confirmation` | nome, protocolo, dia, hora, endereço | Amigável (💛) | Neutro | Formal |

**Categoria:** UTILITY (todos) — permite notificações proativas fora da janela 24h.

**Idioma:** `pt_BR`

**Nome no Meta:** `{nome}_{variante}` — ex: `booking_confirmation_a`

---

## Hierarquia de fallback A → B → C

```
Seleção de variante por sendTemplate():

  1. Busca templates WHERE name = ? AND status = 'approved' ORDER BY variant ASC
  2. Usa a PRIMEIRA encontrada na ordem: A → B → C
  3. Se nenhuma aprovada: retorna erro 'no_approved_variant'
     → registra em audit_log (action='template_send_no_approved_variant')
     → sendMessageWithFallback() retorna error='cannot_send_outside_window'
```

**Por que 3 variantes?** A Meta pode rejeitar uma variante específica por tom, emoji ou estrutura. Com A/B/C progressivamente mais formais, aumenta a chance de aprovação.

---

## Diagrama de decisão: sendMessageWithFallback()

```
sendMessageWithFallback({ professionalId, contactId, templateName, ... })
  │
  ├── is_within_meta_window(contactId) = true?
  │   │
  │   YES → sendTextMessage(fallbackText)
  │          Usa texto livre via TEMPLATE_FALLBACKS
  │          Mais barato, tom mais natural
  │          Retorna: { ok: true, method: 'free_text' }
  │
  └── NO (janela expirada ou sem mensagem inbound)
      │
      └── sendTemplate(professionalId, templateName, params)
          │
          ├── Variante A approved? → envia
          ├── Variante B approved? → envia
          ├── Variante C approved? → envia
          │
          └── Nenhuma approved?
              → audit_log: window_expired_no_template
              → Retorna: { ok: false, error: 'cannot_send_outside_window' }
```

---

## Fluxo de submissão (submitAllTemplates)

```
submitAllTemplates(professionalId)
  │
  ├── Decriptografa access_token do profissional
  ├── Para cada um dos 18 templates (SEQUENCIAL):
  │   ├── POST /{waba_id}/message_templates
  │   ├── Aguarda 200ms (rate limit: 100 templates/dia por WABA)
  │   ├── Em 429: retry com backoff 2s → 4s → 8s (máx 3 tentativas)
  │   │   ├── Respeita Retry-After se disponível
  │   │   └── Após 3 retries: status='rejected', audit_log
  │   └── Persiste resultado em templates (name, variant, status, submitted_at)
  │
  └── Retorna SubmitResult[] — um por template, incluindo falhas
```

**Importante:** `submitAllTemplates` apenas registra `status='pending'` e `submitted_at`.
O trial NÃO inicia aqui.

---

## Início do trial

O trial inicia automaticamente quando o webhook da Meta notifica aprovação
de templates suficientes:

```
Webhook Meta → field='message_template_status_update'
  │
  └── handleTemplateStatusUpdate(value, wabaId)
      ├── Atualiza templates.status
      └── maybeStartTrial(professionalId)
          │
          ├── COUNT(DISTINCT name WHERE status='approved') >= 4?
          │   │
          │   YES → UPDATE professionals SET trial_started_at = NOW()
          │           UPDATE subscriptions SET status = 'trial'
          │           Notifica profissional via número oficial Lara
          │
          └── NO → aguarda mais aprovações
```

**Condição:** 4 **nomes** distintos com ≥1 variante approved (não 4 variantes do mesmo nome).

---

## Status de template

| Status Meta | Status no banco | Significado |
|---|---|---|
| `APPROVED` | `approved` | Pronto para uso |
| `REJECTED` | `rejected` | Meta rejeitou — tentar próxima variante |
| `DISABLED` | `paused` | Desativado temporariamente pela Meta |
| `IN_APPEAL` | `pending` | Em recurso |
| `PENDING` | `pending` | Aguardando revisão Meta (normal: 1-2 dias) |

---

## Rate limit Meta

- **Limite:** 100 templates submetidos por dia por WABA
- **18 templates** cabe folgado (18 de 100)
- **Espaçamento:** 200ms entre submissões no `submitAllTemplates`
- **429 handling:** backoff exponencial 2s → 4s → 8s, máx 3 tentativas

---

## Uso programático

### Enviar confirmação de sessão

```typescript
import { TEMPLATE_FALLBACKS, sendMessageWithFallback } from '@/lib/templates'

await sendMessageWithFallback({
  professionalId: 'uuid-da-profissional',
  contactId: 'uuid-do-contato',
  toPhoneNumber: '5511999998888',
  templateName: 'booking_confirmation',
  templateParams: ['Ana', 'Limpeza de pele profunda', '15/01', '14h'],
  fallbackText: TEMPLATE_FALLBACKS.booking_confirmation(
    'Ana', 'Limpeza de pele profunda', '15/01', '14h'
  ),
})
```

### Submeter todos os templates no onboarding

```typescript
import { submitAllTemplates } from '@/lib/templates'

const results = await submitAllTemplates(professionalId)
const failed = results.filter(r => !r.success)
if (failed.length > 0) {
  console.warn('Templates com falha:', failed.map(r => r.template.metaName))
}
```

---

## Política de início de trial por service_mode

Conforme `REQUIRED_TEMPLATES_BY_MODE` em `/lib/templates.ts`:

| service_mode | Templates obrigatórios | Threshold (80%) |
|---|---|---|
| `studio` | 5 (sem `home_visit_confirmation`) | 4 de 5 aprovados |
| `home` | 6 (todos) | 5 de 6 aprovados |

`home_visit_confirmation` é irrelevante para profissionais em mode=`studio` —
não faz sentido exigi-lo. O trial não é bloqueado por ele neste caso.

## O que acontece quando todas 3 variantes do mesmo nome falham

1. `sendTemplate()` retorna `{ ok: false, error: 'no_approved_variant' }`
2. Registra em `audit_log` com `action='template_no_variant_available'`
3. Notifica equipe ops via `LARA_OPS_PHONE` (Canal 2 — ver `/docs/communication-channels.md`)
4. `sendMessageWithFallback()` retorna `{ error: 'cannot_send_outside_window' }`
5. A mensagem não é enviada — a profissional precisa reenviar manualmente pelo painel

Nenhum variant aprovado + janela 24h expirada = comunicação impossível para aquele template.
A solução é sempre ter pelo menos 1 variante aprovada dos templates obrigatórios.

---

## Arquivos relacionados

| Arquivo | Responsabilidade |
|---|---|
| `/lib/templates.ts` | LARA_TEMPLATES, submitAllTemplates, sendTemplate, TEMPLATE_FALLBACKS, sendMessageWithFallback, handleTemplateStatusUpdate, REQUIRED_TEMPLATES_BY_MODE |
| `/lib/whatsapp.ts` | sendTextMessage, graphRequest, detecção token_invalid, Retry-After em 429 |
| `/app/api/webhooks/whatsapp/route.ts` | Recebe webhook de status_update, chama handleTemplateStatusUpdate |
| `/sql/migrations/0001_initial.sql` | Tabela templates, enum template_status, enum template_variant |
| `/docs/communication-channels.md` | Canais LARA_OFFICIAL_PHONE e LARA_OPS_PHONE |
| `/docs/onboarding.md` | Contexto de trial e submissão de templates no onboarding |
