# Canais de comunicação — Lara

A Lara usa dois canais de WhatsApp com papéis distintos.
Ambos trafegam pelo número oficial (+5511978663056) como **remetente**,
mas têm **destinatários** e **propósitos** diferentes.

---

## Canal 1 — Comunicação com esteticistas (profissionais)

**Variável:** `LARA_OFFICIAL_PHONE` = `+5511978663056`
**Identificador Meta:** `LARA_OFFICIAL_PHONE_ID` + `LARA_OFFICIAL_ACCESS_TOKEN`
**Função:** `sendFromOfficialNumber(toPhoneNumber, text)` em `/lib/whatsapp.ts`

### Quando usar

| Situação | Mensagem enviada |
|---|---|
| Token Meta inválido detectado (code=190) | "Sua conexão com o WhatsApp expirou. Acesse o painel para reconectar." |
| Trial iniciado (4/5 ou 5/6 templates aprovados) | "Seus templates foram aprovados! Seu período de teste de 7 dias começou." |
| Notificações proativas futuras (Prompt C) | Lembretes, no-show, slots liberados, etc. |

### Destinatário

A **esteticista** que assina o Lara. O número vem de `professionals.phone_number`.

---

## Canal 2 — Alertas operacionais (equipe ops/admin)

**Variável:** `LARA_OPS_PHONE`
**Default:** mesmo valor de `LARA_OFFICIAL_PHONE` (+5511978663056) no MVP
**Função:** `sendFromOfficialNumber(process.env.LARA_OPS_PHONE, alertMsg)`

### Quando usar

| Situação | Alerta enviado |
|---|---|
| `sendTemplate()` falha por `no_approved_variant` | "⚠️ Profissional [nome] sem variante aprovada para [template]. Verificar em /admin/ops/templates." |
| Falhas críticas de sistema (futuros alertas) | Erros de webhook_dlq não processados, etc. |

### Destinatário

A **equipe de operações** da Lara (não a esteticista). Em produção, pode ser:
- Um número de WhatsApp pessoal do responsável ops
- Um grupo de WhatsApp interno da equipe
- O mesmo +5511978663056 se a equipe ops monitora esse número diretamente

### Por que separar de LARA_OFFICIAL_PHONE

Em escala, a Lara terá centenas de esteticistas. Misturar alertas ops com
mensagens de esteticistas no mesmo número/inbox dificulta o monitoramento.
A separação permite:
- Rotear alertas para um número interno silencioso (só ops lê)
- Manter o número oficial limpo para comunicação com esteticistas
- Futuramente: substituir por webhook Slack/Discord/PagerDuty sem mudar o código

---

## Configuração de produção

```bash
# .env.local (produção)

# Remetente de todas as mensagens WhatsApp da Lara
LARA_OFFICIAL_PHONE=+5511978663056
LARA_OFFICIAL_PHONE_ID=<phone_number_id_da_meta>
LARA_OFFICIAL_ACCESS_TOKEN=<token_do_numero_oficial>

# Destinatário de alertas operacionais (pode ser diferente do oficial)
# MVP: usar o mesmo número. Separar quando a equipe crescer.
LARA_OPS_PHONE=+5511978663056
```

---

## Arquivos que usam esses canais

| Arquivo | Canal | Contexto |
|---|---|---|
| `lib/whatsapp.ts` — `handleTokenInvalid()` | Canal 1 | Notifica esteticista sobre token expirado |
| `lib/templates.ts` — `maybeStartTrial()` | Canal 1 | Notifica esteticista sobre início do trial |
| `lib/templates.ts` — `sendTemplate()` | Canal 2 | Alerta ops sobre template sem variante aprovada |
| (futuro) `lib/notifications.ts` | Canal 1 | Lembretes, confirmações, no-show |
| (futuro) `lib/ops-alerts.ts` | Canal 2 | Erros críticos, DLQ acumulado |
