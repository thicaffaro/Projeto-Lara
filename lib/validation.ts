/**
 * /lib/validation.ts
 * Validadores de CPF, CNPJ e telefone brasileiro.
 * Sem dependências externas — lógica pura, testável.
 *
 * ALGORITMOS IMPLEMENTADOS (não apenas máscara):
 *
 * CPF:
 *   - Rejeita todos dígitos iguais: /^(\d)\1{10}$/ → "11111111111" = false ✓
 *   - 1º DV: Σ d[i] × (10-i) para i=0..8; rem = (soma×10) % 11; rem∈{10,11} → 0
 *   - 2º DV: Σ d[i] × (11-i) para i=0..9; rem = (soma×10) % 11; rem∈{10,11} → 0
 *
 * CNPJ:
 *   - Rejeita todos dígitos iguais: /^(\d)\1{13}$/ → "00000000000000" = false ✓
 *   - 1º DV: pesos [5,4,3,2,9,8,7,6,5,4,3,2] (len=12, pos=len-7=5, cicla de volta a 9)
 *   - 2º DV: pesos [6,5,4,3,2,9,8,7,6,5,4,3,2] (len=13, pos=len-7=6, cicla de volta a 9)
 *   - r = soma % 11; r < 2 → DV=0; caso contrário DV = 11-r
 */

// ── CPF ───────────────────────────────────────────────────────────────────────

/** Remove formatação e retorna apenas dígitos */
export function stripMask(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Valida CPF pelo algoritmo de dígitos verificadores.
 * Rejeita sequências triviais como 000.000.000-00 e 111.111.111-11.
 */
export function isValidCPF(raw: string): boolean {
  const d = stripMask(raw)

  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false // todos dígitos iguais

  // Primeiro dígito verificador
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i)
  let rem = (sum * 10) % 11
  if (rem === 10 || rem === 11) rem = 0
  if (rem !== Number(d[9])) return false

  // Segundo dígito verificador
  sum = 0
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i)
  rem = (sum * 10) % 11
  if (rem === 10 || rem === 11) rem = 0
  return rem === Number(d[10])
}

/**
 * Valida CNPJ pelo algoritmo de dígitos verificadores.
 * Rejeita sequências triviais como 00.000.000/0000-00.
 */
export function isValidCNPJ(raw: string): boolean {
  const d = stripMask(raw)

  if (d.length !== 14) return false
  if (/^(\d)\1{13}$/.test(d)) return false

  function calcDigit(digits: string, len: number): number {
    let sum = 0
    let pos = len - 7
    for (let i = len; i >= 1; i--) {
      sum += Number(digits[len - i]) * pos--
      if (pos < 2) pos = 9
    }
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }

  return (
    calcDigit(d, 12) === Number(d[12]) &&
    calcDigit(d, 13) === Number(d[13])
  )
}

/** Detecta se o valor tem 14 dígitos (CNPJ) ou 11 (CPF) */
export function isCNPJ(raw: string): boolean {
  return stripMask(raw).length > 11
}

/** Valida CPF ou CNPJ automaticamente conforme o comprimento */
export function isValidCpfOrCnpj(raw: string): boolean {
  return isCNPJ(raw) ? isValidCNPJ(raw) : isValidCPF(raw)
}

// ── Telefone ──────────────────────────────────────────────────────────────────

/**
 * Valida número de telefone brasileiro.
 * Aceita celular (11 dígitos com 9) e fixo (10 dígitos).
 * DDD: 11–99.
 */
export function isValidBrazilianPhone(raw: string): boolean {
  const d = stripMask(raw)
  if (d.length < 10 || d.length > 11) return false
  const ddd = Number(d.slice(0, 2))
  if (ddd < 11 || ddd > 99) return false
  // Celular: 9 dígitos, começa com 9
  if (d.length === 11 && d[2] !== '9') return false
  return true
}

// ── Máscaras (para uso em inputs React) ──────────────────────────────────────

/** Aplica máscara de telefone: (11) 99999-9999 ou (11) 9999-9999 */
export function maskPhone(value: string): string {
  const d = stripMask(value).slice(0, 11)
  if (d.length <= 2)  return d.replace(/(\d{2})/, '($1')
  if (d.length <= 6)  return d.replace(/(\d{2})(\d+)/, '($1) $2')
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d+)/, '($1) $2-$3')
  return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
}

/** Aplica máscara de CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00) */
export function maskCpfCnpj(value: string): string {
  const d = stripMask(value).slice(0, 14)
  if (d.length <= 11) {
    // CPF progressivo
    if (d.length <= 3)  return d
    if (d.length <= 6)  return d.replace(/(\d{3})(\d+)/, '$1.$2')
    if (d.length <= 9)  return d.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3')
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4')
  }
  // CNPJ progressivo
  if (d.length <= 2)   return d
  if (d.length <= 5)   return d.replace(/(\d{2})(\d+)/, '$1.$2')
  if (d.length <= 8)   return d.replace(/(\d{2})(\d{3})(\d+)/, '$1.$2.$3')
  if (d.length <= 12)  return d.replace(/(\d{2})(\d{3})(\d{3})(\d+)/, '$1.$2.$3/$4')
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d+)/, '$1.$2.$3/$4-$5')
}
