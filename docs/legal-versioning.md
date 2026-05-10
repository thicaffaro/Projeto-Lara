# Versionamento de Documentos Legais — Lara

**Versão:** 1.0 | **Última atualização:** 2025-01

Como o sistema detecta, exibe e registra aceites de Política de Privacidade e Termos de Uso.

---

## Como adicionar nova versão (sem deploy de código)

Administrador acessa o painel admin e insere um novo registro em `legal_documents`:

```sql
INSERT INTO legal_documents (doc_type, version, content, effective_at)
VALUES (
  'privacy_policy',   -- ou 'terms_of_use'
  3,                  -- versão sequencial
  '# Política de Privacidade v3\n\n...',  -- markdown ou HTML
  '2025-03-01 00:00:00+00'  -- data de vigência futura
);
```

**Pontos importantes:**
- `effective_at` pode ser no futuro — o sistema só exibe ao profissional quando `effective_at <= NOW()`
- `version` deve ser monotonicamente crescente por `doc_type`
- Não alterar versões já publicadas — histórico de aceite fica inconsistente
- O campo `content` aceita Markdown ou HTML — renderizado no modal de aceite

**Sem deploy necessário:** A detecção é feita em runtime via `checkPendingAcceptance()`.
Nova versão publicada → profissionais veem o banner automaticamente na próxima visita.

---

## Como o sistema detecta gap automaticamente

A função `checkPendingAcceptance(professionalId)` em `/lib/legal/check-pending-acceptance.ts`:

```
Para cada doc_type ('privacy_policy', 'terms_of_use'):
  1. Busca a versão mais recente com effective_at <= NOW()
  2. Verifica se professional_consents tem registro para ESSA versão específica
  3. Se não tem: adiciona ao array de pendentes com days_pending calculado
```

**Sem necessidade de flag manual:** O gap é detectado automaticamente pela ausência de registro em `professional_consents`. Publicar nova versão = banner aparece sem intervenção técnica.

---

## Bloqueio gradual

| Período | Comportamento |
|---|---|
| Dia 0–2 após `effective_at` | Banner amarelo não-dismissível. Operações de escrita liberadas. |
| Dia 3+ após `effective_at` | Banner vermelho + modal forçado. Operações de escrita retornam **HTTP 451**. |
| Logout | Sempre disponível — mesmo durante bloqueio total. |

**HTTP 451** "Unavailable For Legal Reasons" é o código semântico correto para bloqueio por motivo legal. O middleware bloqueia a nível de API — não apenas na UI — impedindo bypass via curl/Postman.

**Padrão denylist ("block by default, exempt by exception"):**
O middleware usa a lista `LEGAL_EXEMPT_ROUTES` — rotas que funcionam SEM aceite legal.
Todas as demais rotas de escrita ficam protegidas automaticamente. Novos endpoints
criados no Prompt C/D já são bloqueados sem intervenção manual.

```typescript
// Rotas ISENTAS (funcionam mesmo sem aceite legal):
const LEGAL_EXEMPT_ROUTES = [
  '/api/auth/',       // login, logout, reset-pin
  '/api/legal/',      // current, accept, pending — necessário para aceitar!
  '/api/onboarding/', // onboarding aceita ao concluir (sem exigência prévia)
  '/api/webhooks/',   // webhooks Meta/MP não podem ser bloqueados
]
// Qualquer outra rota de escrita → bloqueia automaticamente
```

---

## Edge cases

### Profissional novo (cadastrado após publicação da versão)

**✅ Implementado.** Ao concluir o passo 7 do onboarding, `PATCH /api/onboarding/state` com `professionals.onboarding_completed=true` registra automaticamente o aceite da versão vigente de cada documento legal em `professional_consents`.

Profissionais novas **nunca veem o banner** logo após o cadastro. A lógica está em `/app/api/onboarding/state/route.ts`:

```typescript
// Quando onboarding_completed=true:
// 1. Busca versão mais recente de cada doc_type com effective_at <= NOW()
// 2. Agrupa por doc_type (mais recente de cada)
// 3. INSERT em professional_consents (upsert idempotente)
const latestByType = new Map<string, string>()
for (const doc of currentDocs) {
  if (!latestByType.has(doc.doc_type)) latestByType.set(doc.doc_type, doc.id)
}
for (const [docType, docId] of latestByType) {
  await supabase.from('professional_consents').upsert({ ... }, { ignoreDuplicates: true })
}
```

### Profissional cancelado

`checkPendingAcceptance` não é chamado. `/api/legal/pending` verifica o status da subscription e retorna `{ has_pending: false }` para profissionais com status `cancelled` ou `cancelled_pending_anonymization`. Banner não aparece.

### Nova versão publicada após cancelamento

Mesma regra: profissional cancelado não vê banner e não é obrigado a aceitar. Se eventualmente reativar a conta, o banner aparecerá normalmente.

### Dois documentos pendentes simultaneamente

O banner mostra o primeiro documento pendente. Após aceitar, re-verifica e mostra o segundo se necessário. O badge `(+1 documento)` indica múltiplas pendências.

---

## Histórico de aceite

Aceitar a versão 3 NÃO invalida os aceites das versões 1 e 2.
Cada aceite é um registro distinto em `professional_consents`:

```
professional_consents:
  professional_id | doc_type       | legal_document_id | accepted_at
  ----------------+----------------+-------------------+------------
  uuid-prof-1     | privacy_policy | uuid-v1           | 2025-01-01
  uuid-prof-1     | privacy_policy | uuid-v2           | 2025-02-15
  uuid-prof-1     | privacy_policy | uuid-v3           | 2025-03-02  ← versão atual
```

O sistema sempre verifica o aceite da versão **mais recente vigente**.

---

## Arquivos relacionados

| Arquivo | Responsabilidade |
|---|---|
| `/lib/legal/check-pending-acceptance.ts` | Lógica principal de detecção de gap |
| `/app/api/legal/current/route.ts` | GET versões atuais (cache 1h) |
| `/app/api/legal/accept/route.ts` | POST registro de aceite |
| `/app/api/legal/pending/route.ts` | GET pendências do usuário autenticado |
| `/components/dashboard/LegalUpdateBanner.tsx` | UI do banner + modal |
| `middleware.ts` | HTTP 451 em rotas de escrita após 3 dias |
| `/sql/migrations/0001_initial.sql` | Tabelas `legal_documents` e `professional_consents` |
| `/sql/migrations/0004_seed_legal_documents.sql` | Versão 1 placeholder (preencher com advogado) |
