# Dependências pendentes de instalação

Lista de todas as dependências usadas em imports durante o desenvolvimento,
mas ainda não adicionadas ao `package.json` (que será criado em Prompt separado).

Consolidar aqui antes de criar o `package.json` final.

---

## Dependências de produção (`dependencies`)

| Pacote | Versão fixada | Usado em | Motivo |
|---|---|---|---|
| `next` | `15.1.4` | toda a aplicação | Framework principal |
| `react` | `^19.0.0` | toda a aplicação | Runtime React |
| `react-dom` | `^19.0.0` | toda a aplicação | DOM renderer |
| `@supabase/supabase-js` | `2.45.4` | `lib/supabase/*`, API routes | Cliente Supabase |
| `@supabase/ssr` | `0.5.2` | middleware, auth | Supabase para Next.js SSR |
| `framer-motion` | `11.11.0` | `components/landing/*`, `components/onboarding/*` | Animações |
| `tailwindcss` | `3.4.13` | toda a aplicação | CSS utility-first |
| `@upstash/ratelimit` | `2.0.3` | `lib/ratelimit.ts` | Rate limiting |
| `@upstash/redis` | `^1.34.0` | `lib/ratelimit.ts` | Cliente Redis para Upstash |
| `@vercel/functions` | `1.4.0` | `app/api/webhooks/whatsapp/route.ts` | `waitUntil` para background tasks |
| `date-fns` | `3.6.0` | (futuro: formatação de datas no dashboard) | Manipulação de datas |
| `date-fns-tz` | `3.2.0` | (futuro: conversão de fuso horário) | Datas com timezone |
| `bcryptjs` | `2.4.3` | (futuro: hash de PIN do dashboard) | Hash de senhas |
| `jose` | `5.9.0` | (futuro: verificação de JWT em middleware) | JWT |
| `react-window` | `1.8.10` | (futuro: listas longas de contatos) | Virtualização de listas |
| `recharts` | `2.12.7` | (futuro: gráficos no dashboard) | Gráficos |

## Dependências de desenvolvimento (`devDependencies`)

| Pacote | Versão fixada | Usado em | Motivo |
|---|---|---|---|
| `vitest` | `2.1.0` | (futuro: testes) | Test runner |
| `typescript` | `^5.0.0` | toda a aplicação | TypeScript |
| `@types/react` | `^19.0.0` | toda a aplicação | Tipos React |
| `@types/node` | `^22.0.0` | toda a aplicação | Tipos Node.js |
| `@types/bcryptjs` | `^2.4.6` | (futuro) | Tipos bcryptjs |
| `tsx` | `^4.0.0` | `scripts/seed-admin.ts` | Execução TypeScript |

## Notas

- Versões sem `^` são **fixadas** (sem updates automáticos) — alinhado com as versões do Prompt 0
- `@upstash/redis` não tinha versão fixada no Prompt 0 — usando `^1.34.0` (latest estável)
- `tailwindcss` requer `postcss` e `autoprefixer` como peer deps (adicionar ao package.json)
- `@vercel/functions` expõe `waitUntil` para Vercel Edge/Serverless (confirmar compatibilidade com Next.js 15 App Router)

## Quando criar o package.json

Ao criar o `package.json`, incluir também:
- `"scripts"`: `dev`, `build`, `start`, `lint`, `test`
- `"engines"`: `{ "node": ">=20.0.0" }`
- Configurações de `tailwindcss`, `postcss` e `tsconfig.json`
