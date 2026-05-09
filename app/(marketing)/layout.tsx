/**
 * /app/(marketing)/layout.tsx
 * Layout da landing page — limpo, sem chrome de aplicação.
 * Sem header sticky, sem sidebar, sem bottom tab bar.
 */

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
