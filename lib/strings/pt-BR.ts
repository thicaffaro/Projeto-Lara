/**
 * /lib/strings/pt-BR.ts
 * Strings da landing page em português brasileiro.
 *
 * Estrutura preparada para i18n futuro:
 *   - Cada chave de primeiro nível corresponde a um componente
 *   - Para adicionar novo idioma: criar /lib/strings/en-US.ts com a mesma estrutura
 *   - O tipo `Strings` (exportado via index.ts) pode ser usado para validar completude
 *
 * Vocabulário obrigatório (ver /docs/glossary.md):
 *   - "sessão"    em vez de "horário"
 *   - "protocolo" em vez de "serviço"
 *   - "cliente"   = cliente final da esteticista
 *   - "profissional" = esteticista que usa o Lara (nunca "cliente" na UI)
 */

// ── Tipos internos ─────────────────────────────────────────────────────────

interface ChatMessage {
  /** Remetente: 'client' | 'mae' | 'lara' | 'system' */
  from: string
  text: string
}

interface Step {
  title: string
  description: string
}

interface BenefitCard {
  title: string
  body: string
}

// ── Strings ────────────────────────────────────────────────────────────────

export const ptBR = {

  // ── HeroSection ───────────────────────────────────────────────────────────
  hero: {
    badge: 'Sem cartão de crédito • CPF aceito • Studio ou domicílio',
    headline: 'Sua agenda de estética sem responder cliente o dia todo',
    subheadline:
      'A Lara cuida das mensagens de agendamento das suas clientes pelo seu próprio número. ' +
      'Suas conversas pessoais continuam suas — família, amigos, tudo onde sempre esteve.',
    cta: 'Começar teste grátis por 7 dias',
    methodologyNote: {
      text: 'Mais tempo na agenda, sem perder o toque pessoal',
      linkLabel: '*',
    },
  },

  // ── ProductExplainerSection ───────────────────────────────────────────────
  productExplainer: {
    title: 'O que a Lara faz — e o que fica com você',

    laraColumn: {
      title: 'A Lara cuida',
      items: [
        'Cliente nova manda "tem horário pra limpeza?" → Lara oferece sessões disponíveis e confirma',
        'Clientes confirmando ou cancelando sessão',
        'Lembretes 24h e 2h antes da sessão',
        'Coleta de endereço para atendimento em domicílio',
      ] as string[],
    },

    youColumn: {
      title: 'Você responde',
      items: [
        'Sua mãe ou marido te mandando mensagem',
        'Cliente que virou amiga — conversa pessoal',
        'Fornecedor ou distribuidora de produtos',
        'Qualquer assunto fora do escopo de agendamento',
      ] as string[],
    },

    bottomText:
      'Você decide quem a Lara conversa e quem ela deixa para você. ' +
      'Modo cuidadoso recomendado: Lara fica em silêncio para todo contato novo ' +
      'até você dizer "pode responder".',

    learnMoreLink: {
      label: 'Ver como funciona →',
      href: '/docs/lara-modes',
    },
  },

  // ── BenefitsSection ────────────────────────────────────────────────────────
  benefits: {
    notResponding: {
      title: 'Você não responde mais "tem horário?" 50 vezes por dia',
      body: 'A Lara conversa com suas clientes que querem agendar, oferece sessões, confirma e te avisa. Você fica livre pra fazer o que importa: atender bem.',
    } satisfies BenefitCard,

    reminders: {
      title: 'Lembretes automáticos diminuem no-show',
      body: '24 horas e 2 horas antes da sessão, a Lara manda lembrete. Sua cliente não esquece, sua agenda não fica vazia.',
    } satisfies BenefitCard,

    personalLifeStaysYours: {
      title: 'Sua vida pessoal continua sua',
      body: 'Família, amigas, mensagens fora do trabalho — a Lara entende e fica em silêncio. Você responde quando puder, exatamente como sempre fez.',
    } satisfies BenefitCard,
  },

  // ── DemoSection ────────────────────────────────────────────────────────────
  // "horário" nas falas das clientes é intencional: é o vocabulário real
  // que as clientes usam. "sessão" é o vocabulário da profissional e da UI.
  demo: {
    clientBooking: {
      title: 'Cliente agendando — Lara responde',
      messages: [
        { from: 'client', text: 'Oi! Tem horário pra limpeza essa semana?' },
        { from: 'lara',   text: 'Oi Carla! 😊 Tenho quinta às 14h ou sexta às 10h. Qual fica melhor?' },
        { from: 'client', text: 'Quinta às 14h!' },
        { from: 'lara',   text: 'Perfeito! Confirmado: limpeza quinta às 14h. Te mando lembrete na quarta. Até quinta! 💛' },
        { from: 'system', text: '✅ Confirmação enviada' },
      ] as ChatMessage[],
    },

    personalMessage: {
      title: 'Mensagem pessoal — Lara em silêncio',
      messages: [
        { from: 'mae',    text: 'Filha, você vem almoçar domingo?' },
        { from: 'system', text: '🔔 Sua mãe está esperando você no painel. A Lara não respondeu — é assunto pessoal.' },
      ] as ChatMessage[],
    },
  },

  // ── PricingSection ─────────────────────────────────────────────────────────
  pricing: {
    plan: 'Plano único',
    /** Valor numérico como string para permitir formatação customizada no componente */
    price: '99',
    trialNote: '7 dias grátis para começar',
    cta: 'Começar agora grátis',
    included: [
      'WhatsApp no seu número atual',
      'Lara cuida de mensagens de agendamento das suas clientes',
      'Confirmação automática + lembretes 24h e 2h',
      'Conversas pessoais continuam suas (Lara em silêncio)',
      'Painel completo no celular para gerenciar tudo',
      'Atendimento studio OU domicílio',
      'Sem limite de mensagens ou clientes',
    ] as string[],
    notes: [
      'Pessoa física aceita. Não precisa de CNPJ.',
      'Trial começa quando seus templates forem aprovados pela Meta (1-2 dias).',
    ] as string[],
  },

  // ── WhatsAppQASection ──────────────────────────────────────────────────────
  whatsappQA: {
    title: 'Dúvidas sobre o WhatsApp',
    questions: [
      {
        q: 'Vou perder meu WhatsApp?',
        a: 'Não. Suas clientes continuam mandando para o mesmo número de sempre. O que muda é que você passa a usar o painel da Lara em vez do app verde — ele para de funcionar pra esse número específico.',
      },
      {
        q: 'E minhas conversas pessoais?',
        a: 'Sua família, amigos, fornecedores — todos continuam te mandando mensagem normalmente. A Lara entende que não é cliente e fica em silêncio. As mensagens chegam no painel e você responde quando puder, igual antes.',
      },
      {
        q: 'E as conversas que já tenho com clientes?',
        a: 'Faça backup do WhatsApp atual antes da conexão (Configurações → Conversas → Backup). Suas conversas antigas ficam acessíveis pelo painel. Conversas novas são organizadas com histórico por cliente.',
      },
      {
        q: 'E se uma cliente virou minha amiga?',
        a: 'Você marca esse contato como "modo flexível" — a Lara responde só quando ela quiser agendar. Pra conversa pessoal, fica em silêncio. Você decide o nível de automação por contato.',
      },
      {
        q: 'E se eu mando áudio pras minhas clientes?',
        a: 'No início, você responde por texto pelo painel da Lara (igual digitar no WhatsApp). Áudio e foto vão ser adicionados nos próximos meses.',
      },
      {
        q: 'E se eu quiser cancelar?',
        a: 'Você desconecta na hora pelo painel. Em até 24 horas seu número volta a funcionar no WhatsApp normal.',
      },
    ] as Array<{ q: string; a: string }>,
  },

  // ── OnboardingSteps ────────────────────────────────────────────────────────
  onboarding: {
    step1: {
      title: 'Conecte seu número',
      description: 'Em 2 minutos, sem trocar de chip',
    } satisfies Step,
    step2: {
      title: 'Configure em 5 minutos',
      description: 'Onde atende, horários, protocolos, contatos pessoais',
    } satisfies Step,
    step3: {
      title: 'A Lara assume a agenda',
      description: 'Você cuida do resto pelo painel',
    } satisfies Step,
  },

  // ── InstagramTeaser ────────────────────────────────────────────────────────
  instagram: {
    text: 'Quer receber agendamentos pelo Instagram DM também? Em breve.',
  },

  // ── LGPDFooter ─────────────────────────────────────────────────────────────
  footer: {
    consent:
      'Ao usar a Lara, você concorda com o tratamento dos seus dados para prestação do ' +
      'serviço de agendamentos. Base legal: execução de contrato (Art. 7º, V, LGPD). ' +
      'Consulte nossa Política de Privacidade para detalhes sobre seus direitos, ' +
      'inclusive de exportação e exclusão.',
    privacy: 'Política de Privacidade',
    terms: 'Termos de Uso',
    contact: 'contato@laraassistente.com.br',
  },
}

export type PtBR = typeof ptBR
