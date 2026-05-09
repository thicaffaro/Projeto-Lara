/**
 * /app/page.tsx
 * Landing page da Lara — composição pura, sem lógica.
 *
 * Ordem dos componentes:
 * 1. HeroSection              — proposta de valor principal
 * 2. ProductExplainerSection  — explica o que Lara faz vs. o que profissional faz
 * 3. BenefitsSection          — 3 benefícios concretos
 * 4. DemoSection              — mockups: cliente agendando + mensagem pessoal
 * 5. PricingSection           — plano único R$ 99/mês
 * 6. WhatsAppQASection        — 6 perguntas frequentes sobre WhatsApp
 * 7. OnboardingSteps          — 3 passos para começar
 * 8. InstagramTeaser          — aviso "em breve" para Instagram DM
 * 9. LGPDFooter               — consentimento LGPD + links legais
 */

import type { Metadata } from 'next'

import { HeroSection }             from '@/components/landing/HeroSection'
import { ProductExplainerSection } from '@/components/landing/ProductExplainerSection'
import { BenefitsSection }         from '@/components/landing/BenefitsSection'
import { DemoSection }             from '@/components/landing/DemoSection'
import { PricingSection }          from '@/components/landing/PricingSection'
import { WhatsAppQASection }       from '@/components/landing/WhatsAppQASection'
import { OnboardingSteps }         from '@/components/landing/OnboardingSteps'
import { InstagramTeaser }         from '@/components/landing/InstagramTeaser'
import { LGPDFooter }              from '@/components/landing/LGPDFooter'

export const metadata: Metadata = {
  title: 'Lara — Sua agenda de estética sem responder cliente o dia todo',
  description:
    'A Lara cuida das mensagens de agendamento das suas clientes pelo seu próprio número. ' +
    'Suas conversas pessoais continuam suas — família, amigos, tudo onde sempre esteve.',
  openGraph: {
    title: 'Lara — Agenda automática para esteticistas',
    description:
      'Automatize agendamentos de clientes. Suas conversas pessoais continuam suas.',
    url: 'https://laraassistente.com.br',
    siteName: 'Lara',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lara — Agenda automática para esteticistas',
    description: 'Automatize agendamentos de clientes. Suas conversas pessoais continuam suas.',
  },
  alternates: {
    canonical: 'https://laraassistente.com.br',
  },
}

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white antialiased">
      <HeroSection />
      <ProductExplainerSection />
      <BenefitsSection />
      <DemoSection />
      <PricingSection />
      <WhatsAppQASection />
      <OnboardingSteps />
      <InstagramTeaser />
      <LGPDFooter />
    </main>
  )
}
