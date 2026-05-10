/**
 * /lib/security/blocked-pins.ts
 * Lista de PINs de 4 dígitos proibidos.
 * Total: 29 PINs bloqueados.
 *
 * Categorias:
 *   - Sequências repetidas (10): 0000–9999
 *   - Sequências numéricas crescentes (7): 0123–6789
 *   - Sequências numéricas decrescentes (7): 9876–3210
 *   - PINs culturais comuns (5): 1212, 2121, 1010, 0101, 0007
 */

export const BLOCKED_PINS: ReadonlySet<string> = new Set([
  // Sequências repetidas (10)
  '0000', '1111', '2222', '3333', '4444',
  '5555', '6666', '7777', '8888', '9999',

  // Sequências crescentes (7)
  '0123', '1234', '2345', '3456', '4567', '5678', '6789',

  // Sequências decrescentes (7)
  '9876', '8765', '7654', '6543', '5432', '4321', '3210',

  // PINs culturais comuns (5)
  '1212', '2121', '1010', '0101', '0007',
])

/** Total de PINs bloqueados — deve ser 29 */
export const BLOCKED_PINS_COUNT = BLOCKED_PINS.size

/**
 * Verifica se um PIN é trivial/bloqueado.
 * @param pin string de exatamente 4 dígitos
 */
export function isBlockedPin(pin: string): boolean {
  return BLOCKED_PINS.has(pin)
}

/**
 * Valida o formato e conteúdo de um PIN.
 * @returns null se válido, string de erro se inválido
 */
export function validatePin(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) {
    return 'PIN deve ter exatamente 4 dígitos numéricos.'
  }
  if (isBlockedPin(pin)) {
    return 'Esse PIN é muito fácil de adivinhar. Escolha um diferente.'
  }
  return null // válido
}
