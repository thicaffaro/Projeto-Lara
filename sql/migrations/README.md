# Lara — Migrations

Migrations do banco de dados Supabase. Executar em ordem numérica.

## Arquivos

| Arquivo | Descrição |
|---|---|
| `0001_initial.sql` | Schema completo: extensões, enums, tabelas, partições, views, funções, triggers, RLS |
| `0002_seed_admin.sql` | Seed do usuário super_admin |
| `0003_seed_proactive_rules.sql` | 8 regras de mensagens proativas automáticas |
| `0004_seed_legal_documents.sql` | Versão 1 placeholder de Política de Privacidade e Termos de Uso |

## Como executar

### Via Supabase CLI

```bash
# Autenticar
supabase login

# Linkar projeto
supabase link --project-ref <PROJECT_REF>

# Executar migrations
supabase db push
```

### Via psql direto

```bash
psql $DATABASE_URL -f sql/migrations/0001_initial.sql
psql $DATABASE_URL -f sql/migrations/0002_seed_admin.sql
psql $DATABASE_URL -f sql/migrations/0003_seed_proactive_rules.sql
psql $DATABASE_URL -f sql/migrations/0004_seed_legal_documents.sql
```

## Extensões necessárias

O Supabase Cloud Pro deve ter habilitado:
- `uuid-ossp` — geração de UUIDs v4
- `pgcrypto` — criptografia AES-256 para access tokens
- `btree_gist` — índices GiST para EXCLUSION CONSTRAINT de sobreposição de horários

## Notas importantes

### Particionamento

As tabelas `appointments`, `messages`, `audit_log` e `schedule_blocks` são particionadas por período.
Novas partições devem ser criadas antecipadamente — sugere-se criar trimestres com 3 meses de antecedência
via job no n8n.

### Materialized View

`busy_slots` deve ser atualizada a cada minuto via:
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY busy_slots;
```
Configurar no n8n (Railway) como cron `* * * * *`.

### Admin user

Após executar `0002_seed_admin.sql`, criar o auth user manualmente no Supabase Dashboard
e atualizar `admin_users.auth_user_id` com o UUID gerado.

### Documentos legais

`0004_seed_legal_documents.sql` insere placeholders. O conteúdo jurídico real deve ser
redigido por advogado especializado em LGPD antes do go-live.

### Storage buckets

Os buckets `client-media` e `audit-archive` são criados via código TypeScript em
`/lib/supabase/storage-setup.ts` usando a service role key (não via SQL).
