# Onboarding — Lara

**Versão:** 1.0 | **Última atualização:** 2025-01

Documentação do fluxo completo de onboarding: do cadastro ao início do trial.
Ver `/docs/templates.md` para detalhes sobre aprovação de templates e início do trial.

---

## Visão geral do fluxo

```
/cadastro (landing page)
  │
  └── EmbeddedSignupForm (6 etapas)
      ├── Etapa 1: Carrega Facebook SDK
      ├── Etapa 2: Abre popup Meta (Embedded Signup)
      ├── Etapa 3: Aguarda code + sessionInfo (postMessage)
      ├── Etapa 4: POST /api/onboarding/exchange-token → cria professional + auth user
      ├── Etapa 5: POST /api/onboarding/register-number
      └── Etapa 6: POST /api/onboarding/verify-code
                    └── Cria subscription='trial_pending_templates'
                    └── Redireciona → /onboarding/setup

/onboarding/setup (7 passos — ver abaixo)
  │
  └── Ao concluir: /onboarding/setup/complete
        └── professionals.onboarding_completed = TRUE
        └── user_metadata.onboarding_completed = TRUE (JWT)
        └── Middleware libera acesso ao /dashboard
```

---

## 7 passos do setup pós-conexão

### Passo 1 — Modo de atendimento (`ServiceModeForm`)

**Pergunta:** Studio fixo ou domicílio?

| Escolha | Dados coletados | Colunas salvas |
|---|---|---|
| Studio | Endereço completo (rua, número, bairro, cidade, CEP) | `studio_address` (JSONB) |
| Domicílio | Raio máximo (5-50km) + buffer entre atendimentos (15-60min) | `home_service_radius_km`, `home_service_buffer_min` |

**Regra crítica:** Uma profissional opera em **studio OU home**, nunca ambos
(constraint `service_mode enum`).

> [Screenshot placeholder: tela com 2 opções grandes — 🏠 Studio e 🚗 Domicílio]

---

### Passo 2 — Horários de atendimento (`WorkingHoursForm`)

7 dias da semana com toggle on/off. Suporta múltiplas janelas por dia
(ex: 9h-12h e 14h-18h para pausa de almoço).

**Formato salvo em `working_hours` (JSONB):**
```json
{
  "monday": [{"start": "09:00", "end": "12:00"}, {"start": "14:00", "end": "18:00"}],
  "tuesday": [{"start": "09:00", "end": "18:00"}],
  "saturday": null
}
```

Validação: janelas do mesmo dia não podem se sobrepor.

> [Screenshot placeholder: lista de dias com toggle + inputs de horário]

---

### Passo 3 — Regiões de atendimento (`ServiceAreasForm`) — CONDICIONAL

**Visível APENAS se `service_mode='home'`.**

Em modo `studio`, este passo é marcado como auto-concluído (`service_areas=null`)
e o fluxo avança diretamente para o Passo 4.

**Opções:**
1. Sem restrição de região (aceita qualquer endereço dentro do raio)
2. Regiões por dia (ex: segunda=Vila Mariana, quinta=Pinheiros)

**Formato salvo em `service_areas` (JSONB):**
```json
{
  "monday": ["Vila Mariana", "Moema"],
  "thursday": ["Pinheiros", "Jardins"]
}
```

Se a profissional escolher opção 1, `service_areas=null` é salvo.

> [Screenshot placeholder: pergunta com 2 opções + editor de bairros por dia]

---

### Passo 4 — Protocolos (`ProtocolsForm`)

Seleção do catálogo de 26 protocolos (`PROTOCOL_CATALOG` em `/lib/protocols.ts`)
em 3 abas: 🌸 Faciais | 💆 Corporais | ✨ Complementar.

Para cada protocolo selecionado:
- Duração (editável, default do catálogo)
- **Preço em R$ (obrigatório)**

Botão "+ Adicionar protocolo personalizado" permite criar protocolos fora do catálogo.

**Validação:** ≥1 protocolo com preço para avançar.

**Salvo em `protocols` (JSONB array):**
```json
[
  {"name": "Limpeza de pele profunda", "category": "facial", "duration_min": 90, "price_brl": 150},
  {"name": "Drenagem linfática", "category": "corporal", "duration_min": 60, "price_brl": 120}
]
```

> [Screenshot placeholder: abas com cards de protocolo + checkbox + preço]

---

### Passo 5 — Modos da Lara (`LaraModesSetupForm`)

**Parte A — Comportamento padrão para contatos novos:**

| Modo | Descrição | Recomendado? |
|---|---|---|
| `cautious` | Lara fica em silêncio até profissional autorizar | ✅ Sim |
| `standard` | Lara responde mensagens de agendamento automaticamente | Não para MVP |

Salvo em `professionals.default_lara_mode`.

**Parte B — Pré-cadastro de contatos silenciosos (opcional):**

Cria contatos com `lara_mode='silent'` + `pre_registered=true` + `contact_type='personal'|'business'`.

> ⚠️ A Meta não permite que a Lara acesse contatos do celular. Pré-cadastro é manual.

> [Screenshot placeholder: cards de modo + form de contatos pessoais]

---

### Passo 6 — Email de recuperação (`RecoveryEmailForm`)

Coleta `professionals.recovery_email` para recuperação de PIN e reconexão Meta.

**Opções:**
- Preencher email → salva e avança
- Pular → registra `recovery_email_skipped` em `audit_log` e avança

Pode ser configurado depois em `/dashboard/lara/security`.

> [Screenshot placeholder: input de email + botões Salvar / Pular]

---

### Passo 7 — Micro-testes (`SetupTestStep`)

3 testes sequenciais para validar a configuração:

| Teste | O que faz | Confirmação |
|---|---|---|
| 1. Mensagem de teste | Envia WhatsApp via LARA_OFFICIAL_PHONE para o número da profissional | ✅ "Recebi!" / ❌ "Não recebi" |
| 2. Simulação de pergunta | Mostra como a Lara responderia a "tem horário pra limpeza?" | ✅ "Tá bom!" / ⚠️ "Tá estranho" |
| 3. Preview de confirmação | Mostra template `booking_confirmation_a` com dados reais | ✅ "Faz sentido!" / ⚠️ "Quero mudar" |

**Testes 2 e 3 são stubs no MVP** — substituídos pelo `flow_inbound` real do Prompt C.
O conteúdo simulado usa os protocolos reais da profissional.

> [Screenshot placeholder: cards sequenciais com indicadores ✅/⚠️/❌]

---

## Critérios de `onboarding_completed = TRUE`

```
3/3 micro-testes com status ✅ (passou) OU ⚠️ (aviso)
  │
  ├── ✅ = profissional confirmou que funcionou
  ├── ⚠️ = profissional reportou estranheza (não bloqueia — pode ajustar depois)
  └── ❌ = falha técnica (bloqueia conclusão — "Tentar novamente" ou "Suporte")
```

Quando `onboarding_completed=true`:
1. `PATCH /api/onboarding/state` → `professionals.onboarding_completed = true`
2. `supabase.auth.admin.updateUserById` → `user_metadata.onboarding_completed = true`
3. Middleware libera `/dashboard` sem mais redirects

---

## Estado preservado entre passos

O `SetupStepper` usa `useReducer` + `PATCH /api/onboarding/state` após cada passo.

**Fluxo de retomada:**
1. Profissional fecha o navegador no passo 3
2. Ao voltar para `/onboarding/setup`, o Server Component busca o estado atual do banco
3. `deriveCurrentStep()` determina em qual passo retomar
4. `SetupStepper` inicializa com `initialState` do servidor

**O que é persistido por passo:**

| Passo | Colunas atualizadas |
|---|---|
| 1 | `service_mode`, `studio_address` ou `home_service_radius_km`, `home_service_buffer_min` |
| 2 | `working_hours` |
| 3 | `service_areas` |
| 4 | `protocols` |
| 5 | `default_lara_mode` + cria contacts `pre_registered=true` |
| 6 | `recovery_email` |
| 7 | `onboarding_completed = true` |

---

## Integração com o trial (Prompt C)

O onboarding NÃO inicia o trial diretamente. O fluxo é:

```
Onboarding concluído (onboarding_completed=true)
  │
  └── submitAllTemplates() — chamado pelo onboarding setup (ou n8n job)
      └── 18 templates submetidos para aprovação Meta (1-2 dias)
            │
            └── Webhook Meta → message_template_status_update
                └── handleTemplateStatusUpdate() → maybeStartTrial()
                    └── 4/5 (studio) ou 5/6 (home) templates aprovados?
                        │
                        └── SIM → professionals.trial_started_at = NOW()
                                   subscriptions.status = 'trial'
                                   Notifica profissional via LARA_OFFICIAL_PHONE
```

**Ver:** `/docs/templates.md` — seção "Política de início de trial por service_mode"

---

## Como o passo 7 será integrado com flow_inbound (Prompt C)

Atualmente (MVP):
- Micro-teste 2: resposta simulada baseada nos protocolos da profissional
- Micro-teste 3: template `booking_confirmation_a` com dados fictícios

No Prompt C:
- `flow_inbound` processará mensagens reais via n8n
- Micro-teste 2 chamará `flow_inbound` com contexto completo da profissional
- A resposta gerada pelo Grok será exibida (não a resposta canned)

Ponto de integração: `POST /api/onboarding/test-send` com `testIndex=1`
deverá chamar `POST /api/n8n/simulate` (a criar no Prompt C).

---

## Reset do onboarding (admin)

Para resetar o onboarding de uma profissional (em casos de suporte):

```sql
-- Via painel admin /admin/professionals/[id]
UPDATE professionals
SET onboarding_completed = FALSE,
    protocols = NULL,
    working_hours = NULL,
    service_areas = NULL
WHERE id = '<professional_id>';
```

Também atualizar `user_metadata.onboarding_completed = false` via:
```typescript
await supabase.auth.admin.updateUserById(authUserId, {
  user_metadata: { onboarding_completed: false }
})
```

O middleware redirecionará a profissional de volta para `/onboarding/setup`
na próxima vez que tentar acessar o dashboard.
