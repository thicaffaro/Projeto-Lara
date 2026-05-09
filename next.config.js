/** @type {import('next').NextConfig} */

// =============================================================================
// Content Security Policy
//
// Estrutura: cada diretiva é um objeto { directive, sources[], comment }
// para facilitar revisão de segurança e documentação inline.
//
// Ver /docs/security.md para justificativa detalhada de cada origem.
// =============================================================================

/**
 * Monta a string CSP a partir de um array de diretivas.
 * @param {Array<{ directive: string, sources: string[] }>} directives
 * @returns {string}
 */
function buildCsp(directives) {
  return directives
    .map(({ directive, sources }) => `${directive} ${sources.join(' ')}`)
    .join('; ')
}

const cspDirectives = [
  // Baseline: bloqueia tudo que não estiver explicitamente permitido abaixo.
  // Garante que novas diretivas não herdadas sejam restritivas por padrão.
  {
    directive: 'default-src',
    sources: ["'self'"],
  },

  // Fetch / XHR / WebSocket — origens que o browser pode acessar diretamente.
  //
  // DELIBERADAMENTE AUSENTES (server-side only — ver /docs/security.md):
  //   api.x.ai, api.anthropic.com — chamados apenas em /lib/grok.ts e
  //   /lib/anthropic.ts. Incluir aqui criaria superfície de ataque: JS injetado
  //   poderia tentar chamar LLMs diretamente usando a API key do env.
  {
    directive: 'connect-src',
    sources: [
      "'self'",
      'https://*.supabase.co',      // DB, Auth, Storage — NEXT_PUBLIC_SUPABASE_URL
      'wss://*.supabase.co',        // Supabase Realtime (WebSocket) — dashboard ao vivo
      'https://graph.facebook.com', // WhatsApp Cloud API — envio/status de mensagens
      'https://api.mercadopago.com',// Mercado Pago — status de assinatura, checkout
      'https://nominatim.openstreetmap.org', // Geocodificação primária — modo domicílio
      'https://maps.googleapis.com',         // Google Places — geocodificação fallback
    ],
  },

  // Scripts — 'unsafe-inline' necessário para o bootstrap de hidratação do Next.js.
  // Ideal futuro: migrar para nonce-based CSP quando Next.js oferecer suporte
  // estável via Middleware (rastreado em github.com/vercel/next.js).
  {
    directive: 'script-src',
    sources: [
      "'self'",
      "'unsafe-inline'",                   // hidratação Next.js + SDK inline snippets
      'https://connect.facebook.net',      // Facebook SDK — Embedded Signup do WhatsApp
      'https://www.mercadopago.com.br',    // Mercado Pago — checkout hospedado
    ],
  },

  // Estilos — 'unsafe-inline' necessário para Tailwind CSS (utility classes inline)
  // e para o style injection do Next.js durante hidratação.
  {
    directive: 'style-src',
    sources: ["'self'", "'unsafe-inline'"],
  },

  // Imagens — origens restritas ao necessário.
  // https: deliberadamente removido — ver /docs/security.md.
  {
    directive: 'img-src',
    sources: [
      "'self'",
      'data:',                               // SVGs e ícones base64 (Recharts, shadcn/ui)
      'https://*.supabase.co',               // URLs assinadas do Storage (fotos de clientes)
      'https://*.googleusercontent.com',     // Avatar do perfil Facebook no Embedded Signup
      'https://www.facebook.com',            // Assets do widget Meta / Embedded Signup
    ],
  },

  // Fontes — data: cobre fontes base64 injetadas por alguns frameworks de UI.
  {
    directive: 'font-src',
    sources: ["'self'", 'data:'],
  },

  // Iframes — apenas o Facebook Embedded Signup (modal de conexão do WhatsApp).
  // Nenhuma outra origem pode embutir conteúdo em iframe dentro da Lara.
  {
    directive: 'frame-src',
    sources: ['https://www.facebook.com'],
  },

  // A Lara não pode ser embutida em iframes de terceiros.
  // Previne clickjacking. Redundante com X-Frame-Options mas cobre browsers modernos.
  {
    directive: 'frame-ancestors',
    sources: ["'none'"],
  },

  // Bloqueia plugins (Flash, Java, Silverlight, etc.) — não utilizados.
  {
    directive: 'object-src',
    sources: ["'none'"],
  },

  // Restringe o atributo <base href> à própria origem. Previne ataques de
  // base-tag injection que redirecionariam recursos relativos.
  {
    directive: 'base-uri',
    sources: ["'self'"],
  },

  // Restringe para onde formulários podem ser submetidos.
  // Previne exfiltração de dados via <form action="https://atacante.com">.
  {
    directive: 'form-action',
    sources: ["'self'"],
  },

  // Força HTTPS para todos os recursos carregados via HTTP na página.
  {
    directive: 'upgrade-insecure-requests',
    sources: [],
  },
]

const cspHeader = buildCsp(cspDirectives)

// =============================================================================
// Headers de segurança adicionais (além do CSP)
// =============================================================================

/** @type {import('next').NextConfig['headers']} */
async function securityHeaders() {
  return [
    {
      // Aplica a todas as rotas
      source: '/(.*)',
      headers: [
        // CSP principal
        {
          key: 'Content-Security-Policy',
          value: cspHeader,
        },
        // Impede que browsers renderizem a página em iframe de qualquer origem.
        // Compatibilidade retroativa com browsers que não suportam frame-ancestors.
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        // Impede que browsers façam MIME-type sniffing.
        // Previne execução de scripts disfarçados de imagens/textos.
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        // Envia o referrer completo para mesma origem; apenas origem para cross-origin.
        // Protege URLs internas do dashboard de vazarem para serviços externos.
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        // Restringe APIs do navegador que a Lara não utiliza.
        // geolocation: não usada (geocodificação é server-side via Nominatim/Google)
        // camera / microphone: não usadas na v1
        {
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=()',
        },
      ],
    },
  ]
}

// =============================================================================
// Configuração principal do Next.js
// =============================================================================

const nextConfig = {
  // Detecta erros de hidratação em desenvolvimento
  reactStrictMode: true,

  // Headers de segurança
  headers: securityHeaders,

  // Domínios externos permitidos para next/image
  images: {
    remotePatterns: [
      // Supabase Storage — fotos de clientes (bucket client-media)
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },

  // Variáveis de ambiente expostas ao browser
  // (apenas as prefixadas NEXT_PUBLIC_ — incluídas automaticamente)
  // Listadas aqui como documentação; não alterar sem revisar /docs/security.md
  env: {
    // NEXT_PUBLIC_SUPABASE_URL — seguro (URL pública do projeto)
    // NEXT_PUBLIC_SUPABASE_ANON_KEY — seguro (RLS protege os dados)
    // NEXT_PUBLIC_APP_URL — seguro (URL da aplicação)
  },
}

module.exports = nextConfig
