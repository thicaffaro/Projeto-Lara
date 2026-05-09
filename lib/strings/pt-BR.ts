/**
 * /lib/strings/pt-BR.ts
 * Strings da landing page em português brasileiro.
 *
 * Estrutura preparada para i18n futuro:
 *   - Cada chave de primeiro nível corresponde a um componente
 *   - `Strings` é a interface canônica — novos idiomas devem implementá-la
 *   - Para adicionar en-US: criar /lib/strings/en-US.ts satisfies Strings
 *
 * Vocabulário obrigatório (ver /docs/glossary.md):
 *   - "sessão"       em vez de "horário" — na voz da Lara e da profissional
 *   - "protocolo"    em vez de "serviço" — na voz da Lara e da profissional
 *   - "cliente"      = cliente final da esteticista
 *   - "profissional" = esteticista que usa o Lara (nunca "cliente" na UI)
 *
 * Regra de vocabulário em falas simuladas (demos, mockups):
 *   - Fala de CLIENTE (inbound):  vocabulário leigo natural ("tem horário?")
 *   - Fala da LARA   (outbound):  vocabulário do nicho ("sessão", "protocolo")
 *   - Fala da PROFISSIONAL:       vocabulário do nicho (igual à Lara)
 *   - "às 14h" / hora do dia:     OK em qualquer contexto (é hora, não agendamento)
 */

// ── Interfaces reutilizadas ────────────────────────────────────────────────

/** Mensagem de conversa simulada no DemoSection */
interface ChatMessage {
  /** 'client' | 'mae' | 'lara' | 'system' */
  from: string
  text: string
}

/** Passo do OnboardingSteps */
interface Step {
  title: string
  description: string
}

/** Uma seção de conteúdo do modal de pré-onboarding */
interface ModalSection {
  heading: string
  items: readonly string[]
}

/** Uma tela do tutorial de backup */
interface BackupScreen {
  title: string
  description: string
  /** 'all' = exibe em qualquer plataforma, 'android' | 'ios' = específico */
  platform: 'all' | 'android' | 'ios'
  /** Caminho de menu exibido como breadcrumb visual (opcional) */
  pathLabel?: string
}

/** Card da BenefitsSection */
interface BenefitCard {
  title: string
  body: string
}

// ── Interface canônica das strings ─────────────────────────────────────────

export interface Strings {
  hero: {
    badge: string
    headline: string
    subheadline: string
    cta: string
    methodologyNote: {
      text: string
      linkLabel: string
    }
  }

  productExplainer: {
    title: string
    laraColumn: {
      title: string
      items: readonly string[]
    }
    youColumn: {
      title: string
      items: readonly string[]
    }
    bottomText: string
    learnMoreLink: {
      label: string
      href: string
    }
  }

  benefits: {
    notResponding: BenefitCard
    reminders: BenefitCard
    personalLifeStaysYours: BenefitCard
  }

  demo: {
    clientBooking: {
      title: string
      messages: ReadonlyArray<ChatMessage>
    }
    personalMessage: {
      title: string
      messages: ReadonlyArray<ChatMessage>
    }
  }

  pricing: {
    plan: string
    /** Valor numérico como string — formatação (R$, /mês) fica no componente */
    price: string
    trialNote: string
    cta: string
    included: readonly string[]
    notes: readonly string[]
  }

  whatsappQA: {
    title: string
    questions: ReadonlyArray<{ q: string; a: string }>
  }

  onboarding: {
    step1: Step
    step2: Step
    step3: Step
  }

  instagram: {
    text: string
  }

  footer: {
    consent: string
    privacy: string
    terms: string
    contact: string
  }

  preOnboarding: {
    modal: {
      title: string
      subtitle: string
      continuesSection: ModalSection
      laraSection: ModalSection
      youDecideSection: ModalSection
      changesSection: ModalSection
      backupButtonLabel: string
      /** Exatamente 3 itens — um por checkbox obrigatório */
      checkboxes: readonly [string, string, string]
      ctaLabel: string
      supportLabel: string
      supportHref: string
    }
    backup: {
      title: string
      screens: ReadonlyArray<BackupScreen>
      navBack: string
      navNext: string
      navDone: string
      /** Template "Tela X de Y" — usa {current} e {total} como placeholders */
      screenCountTemplate: string
    }
  }
}

// ── Conteúdo em pt-BR ──────────────────────────────────────────────────────

export const ptBR: Strings = {

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
      ],
    },

    youColumn: {
      title: 'Você responde',
      items: [
        'Sua mãe ou marido te mandando mensagem',
        'Cliente que virou amiga — conversa pessoal',
        'Fornecedor ou distribuidora de produtos',
        'Qualquer assunto fora do escopo de agendamento',
      ],
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
    },

    reminders: {
      title: 'Lembretes automáticos diminuem no-show',
      body: '24 horas e 2 horas antes da sessão, a Lara manda lembrete. Sua cliente não esquece, sua agenda não fica vazia.',
    },

    personalLifeStaysYours: {
      title: 'Sua vida pessoal continua sua',
      body: 'Família, amigas, mensagens fora do trabalho — a Lara entende e fica em silêncio. Você responde quando puder, exatamente como sempre fez.',
    },
  },

  // ── DemoSection ────────────────────────────────────────────────────────────
  // Regra de vocabulário aplicada:
  //   "horário" nas falas dos clientes é intencional — é o vocabulário leigo real.
  //   A Lara responde com "sessão" / "limpeza às 14h" — vocabulário do nicho.
  demo: {
    clientBooking: {
      title: 'Cliente agendando — Lara responde',
      messages: [
        { from: 'client', text: 'Oi! Tem horário pra limpeza essa semana?' },
        { from: 'lara',   text: 'Oi Carla! 😊 Tenho sessão quinta às 14h ou sexta às 10h. Qual fica melhor?' },
        { from: 'client', text: 'Quinta às 14h!' },
        { from: 'lara',   text: 'Perfeito! Confirmado: limpeza de pele quinta às 14h. Te mando lembrete na quarta. Até quinta! 💛' },
        { from: 'system', text: '✅ Confirmação enviada' },
      ],
    },

    personalMessage: {
      title: 'Mensagem pessoal — Lara em silêncio',
      messages: [
        { from: 'mae',    text: 'Filha, você vem almoçar domingo?' },
        { from: 'system', text: '🔔 Sua mãe está esperando você no painel. A Lara não respondeu — é assunto pessoal.' },
      ],
    },
  },

  // ── PricingSection ─────────────────────────────────────────────────────────
  pricing: {
    plan: 'Plano único',
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
    ],
    notes: [
      'Pessoa física aceita. Não precisa de CNPJ.',
      'Trial começa quando seus templates forem aprovados pela Meta (1-2 dias).',
    ],
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
    ],
  },

  // ── OnboardingSteps ────────────────────────────────────────────────────────
  onboarding: {
    step1: {
      title: 'Conecte seu número',
      description: 'Em 2 minutos, sem trocar de chip',
    },
    step2: {
      title: 'Configure em 5 minutos',
      description: 'Onde atende, horários, protocolos, contatos pessoais',
    },
    step3: {
      title: 'A Lara assume a agenda',
      description: 'Você cuida do resto pelo painel',
    },
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

  // ── PreOnboardingModal + BackupTutorialModal ───────────────────────────────
  preOnboarding: {
    modal: {
      title: 'Antes de começar — leia com atenção',
      subtitle:
        'A Lara conecta seu número ao WhatsApp Business Cloud API oficial da Meta.',

      continuesSection: {
        heading: '✅ O que continua funcionando:',
        items: [
          'Suas clientes mandam mensagem para o mesmo número de sempre',
          'Você gerencia tudo pelo painel da Lara',
          'Suas conversas pessoais (família, amigos) continuam funcionando',
        ],
      },

      laraSection: {
        heading: '🤖 O que a Lara cuida automaticamente:',
        items: [
          'Mensagens de clientes que querem agendar, confirmar ou cancelar',
          'Lembretes 24h e 2h antes das sessões',
        ],
      },

      youDecideSection: {
        heading: '👤 O que você decide:',
        items: [
          'Quem é cliente (Lara responde) e quem é pessoal (Lara fica em silêncio)',
        ],
      },

      changesSection: {
        heading: '⚠️ O que muda:',
        items: [
          'O app WhatsApp comum (verde) para de funcionar nesse número',
          'Você passa a usar o painel da Lara',
          'Conversas antigas continuam acessíveis após backup',
        ],
      },

      backupButtonLabel: 'Ver tutorial de backup do WhatsApp',

      checkboxes: [
        'Eu fiz backup das minhas conversas (ou não preciso)',
        'Entendi que vou gerenciar meu WhatsApp pelo painel da Lara',
        'Entendi que conversas pessoais continuam minhas pelo painel',
      ],

      ctaLabel: 'Continuar para conexão',
      supportLabel: 'Tenho dúvidas — falar com suporte',
      supportHref: 'https://wa.me/5511978663056',
    },

    backup: {
      title: 'Tutorial de backup do WhatsApp',
      screens: [
        {
          title: 'Por que fazer backup?',
          description:
            'Ao conectar ao WhatsApp Business, suas conversas existentes ficam salvas ' +
            'no backup. Recomendamos fazer agora para não perder nenhum histórico.',
          platform: 'all',
        },
        {
          title: 'Android — Passo 1 de 2',
          description:
            'Abra o WhatsApp e toque nos 3 pontos (⋮) no canto superior direito ' +
            'para abrir o menu de configurações.',
          platform: 'android',
          pathLabel: 'Configurações → Conversas',
        },
        {
          title: 'Android — Passo 2 de 2',
          description:
            'Toque em "Backup de conversas" e depois em "FAZER BACKUP". ' +
            'Aguarde a conclusão antes de prosseguir.',
          platform: 'android',
          pathLabel: 'Configurações → Conversas → Backup de conversas → FAZER BACKUP',
        },
        {
          title: 'iPhone — Passo 1 de 2',
          description:
            'Abra o WhatsApp e toque em "Configurações" (ícone de engrenagem) ' +
            'no menu inferior direito.',
          platform: 'ios',
          pathLabel: 'Configurações → Conversas',
        },
        {
          title: 'iPhone — Passo 2 de 2',
          description:
            'Toque em "Backup de conversas" e depois em "Fazer backup agora". ' +
            'Aguarde a conclusão antes de prosseguir.',
          platform: 'ios',
          pathLabel: 'Configurações → Conversas → Backup de conversas → Fazer backup agora',
        },
        {
          title: 'Pronto! Backup concluído.',
          description:
            'Suas conversas estão seguras. Agora você pode prosseguir ' +
            'para a conexão da Lara com tranquilidade.',
          platform: 'all',
        },
      ],
      navBack: 'Voltar',
      navNext: 'Próximo',
      navDone: 'Entendi, voltar',
      screenCountTemplate: 'Tela {current} de {total}',
    },
  },
}
