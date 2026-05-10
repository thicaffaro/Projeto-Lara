# Autenticação — Lara

**Versão:** 1.0 | **Última atualização:** 2025-01

Documentação do esquema de autenticação de profissionais.

---

## Esquema de email derivado

### Problema

A Lara autentica profissionais via WhatsApp (número de telefone), não via email.
O Supabase Auth exige um email único por usuário.

### Solução: email `@laraassistente.local`

**Formato:** `{phone_number}@laraassistente.local`

**Exemplo:** `5511999998888@laraassistente.local`

**Por que `@laraassistente.local`:**
- Domínio `.local` não é roteável na internet — zero risco de entrega acidental de email
- Torna evidente que é um placeholder artificial (não um email real)
- Único por design: `phone_number` é `UNIQUE NOT NULL` em `professionals`

### Onde é criado

`/app/api/onboarding/exchange-token/route.ts` — Etapa 4 do Embedded Signup:

```typescript
const derivedEmail = `${phoneNumber}@laraassistente.local`

await supabase.auth.admin.createUser({
  email: derivedEmail,
  email_confirm: true,          // pula verificação de email
  user_metadata: {
    professional_id: professionalId,
    phone_number: phoneNumber,
  },
})
```

`email_confirm: true` é obrigatório — sem isso, a conta ficaria bloqueada
aguardando confirmação de um email que nunca existirá.

### Limitações e dívida técnica

| Limitação | Impacto | Solução futura |
|---|---|---|
| Profissional não consegue usar "esqueci minha senha" padrão do Supabase | Médio — fluxo de recuperação é via `/api/dashboard/auth/reset-pin` + SMS/email real | Implementar recovery_email como canal primário (coluna já existe em `professionals`) |
| Email derivado não recebe notificações do Supabase | Baixo — notificações são feitas pelo WhatsApp oficial | Migrar para email real no plano pago |
| Se `phone_number` mudar, o email derivado fica desatualizado | Baixo — número muda raramente e há uma coluna `recovery_email` | Atualizar ao detectar mudança de número |

---

## Fluxo completo de autenticação

```
Profissional acessa laraassistente.com.br/cadastro
  ↓
EmbeddedSignupForm (nome + telefone + CPF/CNPJ)
  ↓
PreOnboardingModal (3 checkboxes obrigatórios)
  ↓
Etapa 1: loadFacebookSDK() — lazy load, timeout 10s
  ↓
Etapa 2: openEmbeddedSignup() — FB.login() com config_id
  ↓
Etapa 3: waitForAuthCode() — postMessage de facebook.com, timeout 5min
  ↓
Etapa 4: /api/onboarding/exchange-token
  ├── code → short-lived token (GET /oauth/access_token)
  ├── short-lived → long-lived token (~60 dias)
  ├── encrypt_access_token(token, TOKEN_ENCRYPTION_KEY) → BYTEA
  ├── Upsert professionals (por phone_number)
  └── supabase.auth.admin.createUser(phone@laraassistente.local)
  ↓
Etapa 5: /api/onboarding/register-number
  └── POST /{phone_number_id}/register { pin: '000000' }
  ↓
Etapa 6: /api/onboarding/verify-code
  ├── action='request_code' → POST /{phone_number_id}/request_code
  ├── UI: input de 6 dígitos
  └── action='verify' → POST /{phone_number_id}/verify_code
        ├── Cria subscriptions { status: 'trial_pending_templates' }
        └── Redireciona para /onboarding/setup
```

---

## Fluxo de reconexão (token inválido)

Quando `whatsapp_status='token_invalid'` é detectado:

1. Banner no dashboard `/dashboard/lara` informa a profissional
2. Profissional clica "Reconectar WhatsApp"
3. `EmbeddedSignupForm mode='reconnect'` pula a fase de formulário
4. Mesmo fluxo OAuth (etapas 1–4)
5. `POST /api/onboarding/reconnect`:
   - Atualiza apenas: `access_token_encrypted`, `whatsapp_status`, WABA IDs
   - **NÃO** reseta: `trial_started_at`, `trial_ends_at`, appointments
   - `whatsapp_status_changed_at` é atualizado automaticamente pelo trigger
6. Continua com `/register-number` e `/verify-code`

---

## Segurança do token

| Regra | Implementação |
|---|---|
| Token nunca em logs | Variável zerada com `= null` após uso; catch blocks não relançam com token |
| Token nunca em respostas HTTP | API routes retornam apenas `{ professionalId }` |
| Token nunca em client-side | Todas as funções de token são server-only |
| Token criptografado em repouso | AES-256 via `pgp_sym_encrypt` (pgcrypto) |
| Chave de criptografia protegida | `TOKEN_ENCRYPTION_KEY` em env server-side only |

---

## Recovery email

A coluna `professionals.recovery_email` (TEXT NULL) armazena o email real
da profissional para fluxos de recuperação de PIN e reconexão Meta.

**Fluxo:** Passo 6 do onboarding (`/components/forms/RecoveryEmailForm.tsx`).

Se pulado no onboarding, pode ser configurado depois em `/dashboard/lara/security`.
Até configurar, recuperação de acesso é feita pelo suporte via `wa.me/5511978663056`.

### Política de unicidade do recovery_email

**Decisão: recovery_email NÃO tem constraint UNIQUE.**

**Justificativa:** Emails familiares compartilhados são um caso real e legítimo
(ex: mãe e filha esteticistas usando o mesmo email de casa). Forçar unicidade
criaria fricção desnecessária neste cenário.

**Como a ambiguidade é resolvida com segurança:**
- Cada link de recuperação contém um `token` UUID único (tabela `recovery_tokens`)
- O `token` identifica **qual conta** deve ser resetada, não o email
- Ambas as profissionais recebem o link por email, mas cada link só atua na conta correta
- O token expira após uso (`used_at` preenchido) e tem `expires_at`

```sql
-- recovery_tokens
-- token UUID → professional_id específico → uma conta específica
SELECT purpose, expires_at, used_at
FROM recovery_tokens
WHERE professional_id = $1 AND token = $2;
```

**O que NÃO implementar:** `UNIQUE (recovery_email)` — geraria erro
"e-mail já em uso" para casos legítimos de família.

---

## Mapeamento auth.users ↔ professionals

```
auth.users.id  ←→  professionals.auth_user_id
    │                        │
    │                        └─ Usado em RLS: WHERE auth.uid() = auth_user_id
    │
    └─ user_metadata: {
         professional_id: UUID,
         onboarding_completed: boolean,  ← lido pelo middleware sem DB query
         phone_number: string
       }
```

O `user_metadata.onboarding_completed` é atualizado em:
- Criação (`false`) — etapa 4 do Embedded Signup
- Conclusão (`true`) — `PATCH /api/onboarding/state` com `professionals.onboarding_completed=true`

O middleware lê este campo do JWT para redirecionar `/dashboard → /onboarding/setup`
sem precisar fazer query ao banco em cada request.

---

## Considerações de segurança

| Regra | Implementação |
|---|---|
| Token Meta nunca em logs | `catch` blocks genéricos; variável zerada após uso |
| Token nunca em resposta HTTP | API routes retornam apenas `{ professionalId }` |
| Token nunca client-side | Funções de token são server-only |
| Token criptografado em repouso | AES-256 via `pgp_sym_encrypt` (pgcrypto), chave em env |
| Rotação de token | `/api/onboarding/reconnect` — atualiza token sem resetar trial |
| Detecção de token inválido | `graphRequest()` → `code=190` → `whatsapp_status='token_invalid'` |
