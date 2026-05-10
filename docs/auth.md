# Autenticação — Lara

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

**Fluxo:** `/api/onboarding/recovery-email/route.ts` (Parte 2 do Prompt B2).
**Componente:** `/components/forms/RecoveryEmailForm.tsx`.

Até que este fluxo seja implementado, recuperação de acesso é feita pelo
suporte via `wa.me/5511978663056`.
