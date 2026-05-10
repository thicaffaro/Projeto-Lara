/**
 * /lib/mask-email.ts
 * Mascara email preservando apenas o 1º caractere do usuário e do domínio.
 *
 * Exemplos:
 *   maria@gmail.com   → m***@g****.com
 *   ana@outlook.com   → a***@o****.com
 *   e@e.co            → e***@e****.co
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***.***'

  const [user, domain] = email.split('@')
  if (!user || !domain) return '***@***.***'

  const maskedUser = (user[0] ?? '*') + '***'

  const lastDot = domain.lastIndexOf('.')
  if (lastDot <= 0) return `${maskedUser}@${domain[0] ?? '*'}****`

  const domainName = domain.slice(0, lastDot)
  const tld        = domain.slice(lastDot) // ".com", ".com.br", etc.
  const maskedDomain = (domainName[0] ?? '*') + '****'

  return `${maskedUser}@${maskedDomain}${tld}`
}
