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
```

> **Atenção:** `0005_storage_policies.sql` requer que os buckets já existam.
> Execute `storage-setup.ts` antes (passo 4).

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

---

## 7. Verificação final

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
```

---

## Checklist pós-setup

- [ ] Migrations executadas (0001 → 0005)
- [ ] Usuário admin criado e senha trocada
- [ ] `ADMIN_INITIAL_PASSWORD` removida do `.env.local`
- [ ] Buckets `client-media` e `audit-archive` criados
- [ ] Políticas RLS de storage aplicadas
- [ ] n8n configurado no Railway com cron de `busy_slots`
- [ ] Documentos legais revisados por advogado (`0004_seed_legal_documents.sql`)
