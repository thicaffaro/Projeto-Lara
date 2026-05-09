/**
 * /lib/strings/index.ts
 * Ponto de entrada das strings do produto.
 *
 * Idioma ativo: pt-BR (único suportado no MVP).
 *
 * ── Guia para i18n futuro ──────────────────────────────────────────────────
 * 1. Criar /lib/strings/en-US.ts:
 *      import type { Strings } from './pt-BR'
 *      export const enUS: Strings = { ... }
 *
 * 2. O tipo `Strings` garante que todo novo idioma implementa todas as chaves.
 *    TypeScript emite erro em compile-time se alguma chave estiver faltando.
 *
 * 3. Para locale dinâmico, criar hook useStrings():
 *      const locales: Record<string, Strings> = { 'pt-BR': ptBR, 'en-US': enUS }
 *      export function useStrings(): Strings { return locales[locale()] }
 *
 * 4. Substituir a exportação estática abaixo por `export { useStrings }`.
 *    Os componentes não precisam mudar — continuam importando `{ strings }`.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { ptBR, type Strings } from './pt-BR'

export type { Strings }

/**
 * Strings ativas.
 * Componentes importam: `import { strings } from '@/lib/strings'`
 */
export const strings: Strings = ptBR

export default strings
