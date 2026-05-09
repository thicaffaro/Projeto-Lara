# Segurança — Lara Assistente

Documentação das decisões de segurança da aplicação.
Atualizar este arquivo sempre que alterar `next.config.js` ou as origens permitidas.

---

## Content Security Policy (CSP)

O CSP é configurado em `next.config.js` via `headers()` e aplicado a todas as rotas (`/(.*)`).

Princípio geral: **default-src 'self'** bloqueia tudo por padrão. Cada origem abaixo é um desvio explicitamente justificado desse princípio.

---

### `connect-src`

Controla para onde o browser pode fazer requisições fetch, XHR e abrir WebSockets.

| Origem | Motivo |
|---|---|
| `'self'` | API routes internas do Next.js (`/api/**`) — webhooks, autenticação, onboarding |
| `https://*.supabase.co` | Banco de dados PostgreSQL, autenticação Supabase Auth e Storage (bucket `client-media`). Wildcard necessário porque cada projeto tem subdomínio único (`<project-ref>.supabase.co`). Chave `NEXT_PUBLIC_SUPABASE_ANON_KEY` protegida por RLS. |
| `wss://*.supabase.co` | WebSocket do Supabase Realtime — atualizações ao vivo no dashboard (ex: nova mensagem recebida, status da Lara). Mesmo wildcard do HTTPS acima. |
| `https://graph.facebook.com` | WhatsApp Business Cloud API — envio de mensagens outbound, verificação de status de templates, leitura de webhooks de entrega. Utilizado por API routes que a Lara chama server-side; incluído aqui por precaução para possíveis chamadas client-side futuras (ex: preview de template). |
| `https://api.mercadopago.com` | Mercado Pago — consulta de status de assinatura, criação de preferência de pagamento. Chamado tanto server-side (webhook handler) quanto potencialmente client-side (verificação de status no painel). |
| `https://api.x.ai` | xAI Grok — LLM principal da Lara para classificação de intenção e geração de resposta. **Chamado exclusivamente via API route server-side.** Incluído em `connect-src` por precaução. Se confirmado 100% server-side, pode ser removido sem impacto funcional — fazê-lo reduziria a superfície de ataque. |
| `https://api.anthropic.com` | Anthropic Claude Haiku — LLM fallback quando Grok está indisponível. Mesma justificativa e ressalva do `api.x.ai` acima. |
| `https://nominatim.openstreetmap.org` | Geocodificação primária — converte endereço de domicílio em coordenadas para cálculo de área de atendimento (`service_mode='home'`). Pode ser chamado client-side no fluxo de onboarding. Gratuito, sem chave de API. |
| `https://maps.googleapis.com` | Google Places API — geocodificação fallback quando Nominatim falha ou retorna resultado ambíguo. Requer `GOOGLE_PLACES_API_KEY`. Mesma finalidade do Nominatim acima. |

---

### `script-src`

Controla quais scripts podem ser executados na página.

| Origem | Motivo |
|---|---|
| `'self'` | Bundles gerados pelo Next.js (`/_next/static/chunks/**`) |
| `'unsafe-inline'` | Necessário para o bootstrap de hidratação do Next.js (scripts inline que o framework injeta no HTML para passar o estado do servidor ao cliente). **Tradeoff aceito:** eliminar `'unsafe-inline'` exigiria CSP baseado em nonce/hash, que o Next.js 15 ainda não suporta de forma estável sem Middleware customizado. Issue rastreada em [github.com/vercel/next.js](https://github.com/vercel/next.js/issues/). Revisar a cada versão major do Next.js. |
| `https://connect.facebook.net` | Facebook SDK JavaScript — necessário para o fluxo de **Embedded Signup** do WhatsApp Business. É o mecanismo oficial da Meta para conectar um número à WABA sem exigir que a profissional acesse o Business Manager diretamente. Sem este domínio, o botão "Conectar WhatsApp" não funciona. |
| `https://www.mercadopago.com.br` | SDK de checkout do Mercado Pago — carregado durante o fluxo de assinatura para renderizar o botão de pagamento e processar tokenização do cartão no browser. Remover este domínio quebra o checkout. |

---

### `style-src`

| Origem | Motivo |
|---|---|
| `'self'` | CSS gerado pelo Next.js (`/_next/static/css/**`) |
| `'unsafe-inline'` | Tailwind CSS injeta classes utilitárias como estilos inline em alguns contextos. Next.js também injeta `<style>` tags durante SSR/hidratação. Necessário para o funcionamento correto do layout. |

---

### `img-src`

| Origem | Motivo |
|---|---|
| `'self'` | Imagens locais em `/public/` (logo, ícones, OG images) |
| `data:` | Imagens base64 inline — SVGs de ícones, placeholders de componentes UI (ex: shadcn/ui), imagens geradas dinamicamente por bibliotecas de gráficos (Recharts exporta canvas como data URL) |
| `https:` | Escopo amplo intencional: cobre URLs assinadas do Supabase Storage (fotos de clientes com TTL de 1h), CDNs de bibliotecas de UI, e quaisquer imagens externas futuras. Restringir para `*.supabase.co` quebraria uso de CDNs externos legítimos. Aceito porque `img-src` não executa código — risco limitado a conteúdo visual. |

---

### `font-src`

| Origem | Motivo |
|---|---|
| `'self'` | Fontes locais servidas pelo Next.js (`next/font`) |
| `data:` | Fontes base64 inline injetadas por algumas bibliotecas de ícones |

---

### `frame-src`

| Origem | Motivo |
|---|---|
| `https://www.facebook.com` | O fluxo de **Embedded Signup** da Meta abre um popup/iframe hospedado em `www.facebook.com` onde a profissional autoriza o acesso à sua WABA. Sem este domínio, o modal de conexão do WhatsApp não carrega. Escopo restrito ao domínio principal do Facebook — não inclui subdomínios. |

---

### `frame-ancestors`

| Valor | Motivo |
|---|---|
| `'none'` | A Lara não deve ser embutida em iframes de nenhuma origem. Previne ataques de **clickjacking** onde um atacante sobrepõe a interface da Lara em um site malicioso para capturar cliques da profissional. |

---

### `object-src`

| Valor | Motivo |
|---|---|
| `'none'` | Bloqueia plugins de browser (Flash, Java, Silverlight, PDF inline). Nenhum desses é utilizado pela Lara. Eliminar esta diretiva permitiria que plugins legados executassem código arbitrário. |

---

### `base-uri`

| Valor | Motivo |
|---|---|
| `'self'` | Restringe o atributo `<base href>` à própria origem. Um atacante com XSS poderia injetar `<base href="https://atacante.com">` para redirecionar todos os recursos relativos (scripts, imagens, links) para um servidor malicioso. |

---

### `form-action`

| Valor | Motivo |
|---|---|
| `'self'` | Restringe o destino de submissões de `<form>` à própria origem. Previne exfiltração de dados de formulários (ex: login, onboarding) via `action="https://atacante.com"` injetado por XSS. |

---

### `upgrade-insecure-requests`

Instrui o browser a substituir automaticamente `http://` por `https://` em todos os recursos da página. Proteção de profundidade para o caso de algum asset ser referenciado com URL HTTP por engano.

---

## Headers de Segurança Adicionais

| Header | Valor | Motivo |
|---|---|---|
| `X-Frame-Options` | `DENY` | Compatibilidade retroativa com browsers que não suportam `frame-ancestors`. Redundante mas necessário para IE11, browsers antigos em tablets de clientes. |
| `X-Content-Type-Options` | `nosniff` | Impede MIME-type sniffing. Sem este header, um browser poderia executar como script um arquivo retornado como `text/plain`. Crítico para uploads de mídia de clientes. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Envia o referrer completo para requisições de mesma origem; envia apenas a origem (sem path) para cross-origin. Impede que URLs do dashboard (com IDs de contatos, etc.) vazem nos headers de requisições para terceiros como Mercado Pago ou Meta. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Bloqueia acesso a câmera, microfone e geolocalização via browser. Geocodificação é feita server-side via Nominatim/Google Places — o browser nunca precisa de permissão de geolocalização. Câmera e microfone não são usados na v1. |

---

## Auditoria e Revisão

- Revisar CSP a cada adição de novo serviço externo ao `.env.example`
- Revisar `'unsafe-inline'` em `script-src` a cada versão major do Next.js
- Testar CSP em produção com `Content-Security-Policy-Report-Only` antes de ativar
- Ferramenta recomendada para validação: [csp-evaluator.withgoogle.com](https://csp-evaluator.withgoogle.com)
- Logs de violação: configurar `report-uri` quando serviço de monitoramento de erros estiver ativo

---

## Variáveis de Ambiente — O que é seguro expor no browser

| Variável | Exposição | Justificativa |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Pública (browser) | URL do projeto Supabase. Não é segredo — RLS protege os dados |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pública (browser) | Chave anon do Supabase. Projetada para uso público — RLS é a proteção real |
| `NEXT_PUBLIC_APP_URL` | Pública (browser) | URL da aplicação. Informação pública |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secreta (server-only)** | Bypassa RLS — nunca expor ao browser |
| `TOKEN_ENCRYPTION_KEY` | **Secreta (server-only)** | Chave AES-256 para access tokens Meta |
| `META_APP_SECRET` | **Secreta (server-only)** | Verificação de webhooks Meta |
| `MP_ACCESS_TOKEN` | **Secreta (server-only)** | API Mercado Pago |
| `XAI_API_KEY` / `ANTHROPIC_API_KEY` | **Secretas (server-only)** | Chaves de LLM — nunca expor |
