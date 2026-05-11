# Lara — Setup inicial

Guia de configuração do zero para ambiente de desenvolvimento ou produção.

---

## Pré-requisitos

- Node.js 20+
- `tsx` instalado globalmente ou via devDependencies: `npm i -D tsx`
- Conta Supabase Cloud Pro com projeto criado
- Variáveis de ambiente configuradas (ver `.env.example`)

---

## 1. Variáveis de ambiente

Copie o arquivo de exemplo e preencha todos os valores:

```bash
cp .env.example .env.local
```

Variáveis obrigatórias para o setup inicial:

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon (pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role (secreta — nunca exponha no client) |
| `DATABASE_URL` | Connection string PostgreSQL (Supabase → Settings → Database) |
| `ADMIN_EMAIL` | Email do primeiro administrador |
| `ADMIN_INITIAL_PASSWORD` | Senha temporária do admin. **Trocar após o primeiro login.** |
| `TOKEN_ENCRYPTION_KEY` | Chave AES-256 para criptografar access tokens Meta (32 chars mínimo) |

---

## 2. Executar migrations

As migrations devem ser executadas na ordem numérica. O banco já deve ter as
extensões `uuid-ossp`, `pgcrypto` e `btree_gist` habilitadas (disponíveis por
padrão no Supabase Cloud Pro).

### Via Supabase CLI (recomendado)

```bash
# Instalar CLI
npm i -g supabase

# Autenticar
supabase login

# Linkar ao projeto
supabase link --project-ref <PROJECT_REF>

# Executar todas as migrations
supabase db push
```

### Via psql

```bash
psql $DATABASE_URL -f sql/migrations/0001_initial.sql
psql $DATABASE_URL -f sql/migrations/0002_seed_admin.sql
psql $DATABASE_URL -f sql/migrations/0003_seed_proactive_rules.sql
psql $DATABASE_URL -f sql/migrations/0004_seed_legal_documents.sql
psql $DATABASE_URL -f sql/migrations/0005_storage_policies.sql
psql $DATABASE_URL -f sql/migrations/0006_subscriptions_unique.sql
psql $DATABASE_URL -f sql/migrations/0007_fix_working_hours.sql
psql $DATABASE_URL -f sql/migrations/0008_dashboard.sql
psql $DATABASE_URL -f sql/migrations/0009_dashboard_extras.sql
psql $DATABASE_URL -f sql/migrations/0010_partitions_2027.sql
```

> **Atenção:** `0005_storage_policies.sql` requer que os buckets já existam.
> Execute `storage-setup.ts` antes (passo 4).

### Resumo das migrations

| Arquivo | O que faz |
|---|---|
| `0001_initial.sql` | Schema completo: tabelas, partições 2025–2026, funções, triggers, RLS |
| `0002_seed_admin.sql` | Seed da tabela `admin_users` |
| `0003_seed_proactive_rules.sql` | 8 regras de mensagens proativas |
| `0004_seed_legal_documents.sql` | Placeholder para PP e Termos de Uso v1 |
| `0005_storage_policies.sql` | Políticas RLS para buckets `client-media` e `audit-archive` |
| `0006_subscriptions_unique.sql` | Constraint UNIQUE em `subscriptions.professional_id` + coluna `cancelled_at` |
| `0007_fix_working_hours.sql` | Recria `is_slot_available` com suporte a array de janelas por dia |
| `0008_dashboard.sql` | Tabela `dashboard_sessions`, colunas PIN em `professionals` |
| `0009_dashboard_extras.sql` | Coluna `lara_settings` em `professionals`, índices em `admin_actions_log` |
| `0010_partitions_2027.sql` | Partições mensais 2027 para appointments, messages, audit\_log |

---

## 3. Criar o usuário administrador

O script `scripts/seed-admin.ts` cria o auth user via `supabase.auth.admin.createUser`
e insere o registro em `admin_users`. É idempotente — seguro executar múltiplas vezes.

```bash
npx tsx scripts/seed-admin.ts
```

**O que o script faz:**
1. Valida variáveis de ambiente (`ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`, etc.)
2. Chama `supabase.auth.admin.createUser()` com `email_confirm: true`
3. Define `user_metadata: { role: "super_admin", is_admin: true }` no JWT
4. Faz upsert em `admin_users` vinculando `auth_user_id`
5. Se o usuário já existir, atualiza os metadados sem recriar

**Após executar:**
- Acesse o Supabase Dashboard → Authentication → Users para confirmar
- Faça login no painel admin com `ADMIN_EMAIL` + `ADMIN_INITIAL_PASSWORD`
- **Troque a senha imediatamente** pelo painel ou via:

```bash
# Via Supabase CLI
supabase auth admin update-user <USER_ID> --password 'nova-senha-segura'
```

- Remova `ADMIN_INITIAL_PASSWORD` do `.env.local` após a troca

---

## 4. Configurar buckets de Storage

```bash
npx tsx lib/supabase/storage-setup.ts
```

Cria os buckets `client-media` e `audit-archive` com as configurações corretas.
As políticas RLS são aplicadas no passo seguinte.

---

## 5. Aplicar políticas RLS de Storage

```bash
psql $DATABASE_URL -f sql/migrations/0005_storage_policies.sql
```

**Políticas aplicadas:**
- `client-media`: profissional acessa apenas arquivos em `{professional_id}/...`
  (SELECT, INSERT, UPDATE, DELETE)
- `audit-archive`: acesso negado para todas as roles autenticadas. Apenas
  `service_role` (backend/n8n) tem acesso implícito.

---

## 6. Configurar n8n (Railway)

O n8n é responsável por:
- `REFRESH MATERIALIZED VIEW CONCURRENTLY busy_slots` a cada minuto
- Criar partições mensais futuras (como fallback, pois os triggers já fazem isso)
- Jobs de retenção (mover mídia antiga para `audit-archive`)
- Envio de mensagens proativas

Configure no Railway com volume persistente e as variáveis `N8N_BASE_URL`,
`N8N_API_KEY`, `N8N_ENCRYPTION_KEY`.

Os workflows do n8n estão em `/n8n/*.yaml` e devem ser importados manualmente
via n8n UI (Settings → Import from file).

---

## 7. Tipos TypeScript do Supabase

Os tipos já estão em `lib/supabase/types.ts` (gerados manualmente a partir das
migrations 0001–0009). Para regenerar com dados reais do Supabase Cloud Pro:

```bash
npx supabase gen types typescript \
  --project-id <PROJECT_ID> \
  --schema public \
  > lib/supabase/types.ts
```

> **Após regenerar:** verifique se os tipos `ProfessionalRow`, `ContactRow` etc.
> continuam exportados para compatibilidade com o código existente.

---

## 8. Verificação final

```sql
-- Verificar tabelas criadas
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Verificar partições de appointments
SELECT inhrelid::regclass AS partition
FROM pg_inherits
WHERE inhparent = 'appointments'::regclass
ORDER BY partition;

-- Verificar admin criado
SELECT email, role FROM admin_users;

-- Verificar buckets
SELECT id, name, public FROM storage.buckets;

-- Verificar regras proativas
SELECT name, enabled FROM proactive_message_rules ORDER BY name;

-- Verificar documentos legais (substituir por conteúdo real antes do go-live)
SELECT doc_type, version, effective_at FROM legal_documents ORDER BY doc_type, version;
```

---

## Checklist pós-setup

- [ ] Migrations executadas (0001 → 0010)
- [ ] Usuário admin criado e senha trocada
- [ ] `ADMIN_INITIAL_PASSWORD` removida do `.env.local`
- [ ] Buckets `client-media` e `audit-archive` criados
- [ ] Políticas RLS de storage aplicadas
- [ ] n8n configurado no Railway com cron de `busy_slots`
- [ ] Workflows n8n importados (`/n8n/*.yaml`)
- [ ] Documentos legais revisados por advogado (`0004_seed_legal_documents.sql`)
- [ ] Variáveis de ambiente configuradas no Vercel (Settings → Environment Variables)
- [ ] Deploy Vercel conectado ao repositório GitHub (branch `main`)
- [ ] CI passando em `.github/workflows/ci.yml`
- [ ] Domínio `laraassistente.com.br` configurado no Vercel
- [ ] Webhook Meta (WhatsApp) apontando para `https://laraassistente.com.br/api/webhooks/whatsapp`
- [ ] Webhook Mercado Pago apontando para `https://laraassistente.com.br/api/webhooks/mercadopago`
