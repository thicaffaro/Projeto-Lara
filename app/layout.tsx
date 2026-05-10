/**
 * /app/layout.tsx
 * Root layout mínimo — apenas estrutura HTML.
 * Cada route group define seu próprio chrome de UI.
 *
 * (marketing) → layout limpo, sem sidebar/header
 * (dashboard) → layout com header sticky + bottom tab bar mobile (Prompt D)
 */

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://laraassistente.com.br'),
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
