/**
 * /lib/strings/index.ts
 * Ponto de entrada das strings do produto.
 *
 * Idioma ativo: pt-BR (único suportado no MVP).
 *
 * ── Guia para i18n futuro ──────────────────────────────────────────────────
 * 1. Criar /lib/strings/en-US.ts com a mesma estrutura de `ptBR`
 * 2. Criar um hook `useStrings()` que lê o locale do contexto/cookie
 * 3. Substituir a exportação estática abaixo por `export { useStrings }`
 * 4. O tipo `Strings` garante que todo novo idioma implementa todas as chaves
 *
 * Exemplo futuro:
 *   import { ptBR } from './pt-BR'
 *   import { enUS } from './en-US'
 *   const locales = { 'pt-BR': ptBR, 'en-US': enUS } satisfies Record<string, Strings>
 * ──────────────────────────────────────────────────────────────────────────
 */

import { ptBR, type PtBR } from './pt-BR'

/**
 * Tipo canônico das strings do produto.
 * Usar para validar que novos idiomas implementam todas as chaves.
 */
export type Strings = PtBR

/**
 * Strings ativas.
 * Componentes importam: `import { strings } from '@/lib/strings'`
 */
export const strings: Strings = ptBR

export default strings
