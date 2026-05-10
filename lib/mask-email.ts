/**
 * /lib/mask-email.ts
 * Mascara email preservando apenas o 1º caractere do usuário e do domínio.
 *
 * Regras:
 *   - Usuário:     1º char + "***" (fixo 3 asteriscos, independente do tamanho)
 *   - Domain name: 1º char + asteriscos para cada char restante (mínimo 2)
 *   - TLD (.com, .com.br, etc.): preservado sem mascaramento
 *
 * Exemplos:
 *   mariana@gmail.com        → m***@g****.com       (gmail=5 → 4 asteriscos)
 *   mariana.silva@hotmail.com→ m***@h******.com      (hotmail=7 → 6 asteriscos)
 *   m@ex.com                 → m***@e**.com          (ex=2 → min 2 asteriscos)
 *   ana@outlook.com          → a***@o******.com      (outlook=7 → 6 asteriscos)
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***.***'

  const [user, domain] = email.split('@')
  if (!user || !domain) return '***@***.***'

  // Usuário: 1º char + 3 asteriscos fixos (independente do tamanho)
  const maskedUser = (user[0] ?? '*') + '***'

  const lastDot = domain.lastIndexOf('.')
  if (lastDot <= 0) {
    // Sem TLD identificável: mascara com mínimo 2 asteriscos
    return `${maskedUser}@${domain[0] ?? '*'}**`
  }

  const domainName = domain.slice(0, lastDot)
  const tld        = domain.slice(lastDot) // ".com", ".com.br", etc.

  // Domain name: 1º char + asteriscos para cada char restante (mínimo 2)
  const restLength   = Math.max(2, domainName.length - 1)
  const maskedDomain = (domainName[0] ?? '*') + '*'.repeat(restLength)

  return `${maskedUser}@${maskedDomain}${tld}`
}
