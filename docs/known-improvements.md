# Melhorias conhecidas — Dívida técnica

Itens identificados durante o desenvolvimento que são tecnicamente corretos
para revisar pós-MVP, mas que não bloqueiam o lançamento.

---

## Segurança

### `style-src 'unsafe-inline'` — CSP fraco para estilos

**Arquivo:** `next.config.js`
**Prioridade:** Média (pós-MVP)
**Contexto:** Next.js 15 + Tailwind CSS

#### Problema

A diretiva `style-src 'unsafe-inline'` é necessária hoje porque:
- O Next.js injeta `<style>` tags inline durante SSR/hidratação
- O Tailwind CSS, em certos contextos, injeta estilos como atributos inline

Com `'unsafe-inline'`, um atacante com XSS poderia injetar CSS arbitrário para
sobrepor elementos da UI (ex: substituir botão legítimo, alterar cores de alerta).

#### Solução conhecida

Duas abordagens viáveis quando o Next.js oferecer suporte estável:

**Opção A — Hash-based CSP:**
Calcular o hash SHA-256 de cada `<style>` inline e listá-lo explicitamente:
```
style-src 'self' 'sha256-<hash-do-style-gerado>'
```
Limitação: os hashes mudam a cada build, exigindo regeneração automática.

**Opção B — Nonce-based CSP (recomendada):**
Gerar um nonce único por request no Middleware do Next.js e passá-lo para
todos os `<style>` e `<script>` inline:
```
style-src 'self' 'nonce-<valor-aleatorio-por-request>'
```
Suporte em progresso no Next.js — rastrear:
https://github.com/vercel/next.js/issues/18557

#### Quando revisar

- Na próxima versão major do Next.js que anunciar suporte estável a nonce
- Antes de qualquer auditoria de segurança externa (pentest)
- Se o produto escalar para segmentos que exijam conformidade mais rígida (ex: planos enterprise)

---

## Performance

*(Adicionar itens aqui conforme identificados durante desenvolvimento)*

---

## Acessibilidade

*(Adicionar itens aqui conforme identificados durante desenvolvimento)*
