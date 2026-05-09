# Glossário Lara

Vocabulário oficial do produto. Aplicar **consistentemente** em:
- `/lib/strings/pt-BR.ts`
- Comentários de código
- System prompts da Lara
- Documentação de usuário
- Mensagens de UI

---

## Termos do produto

### profissional
**Definição:** Esteticista que paga R$ 99/mês para usar o Lara.
- SQL: tabela `professionals`
- TypeScript: variáveis como `professional`, `currentProfessional`, `professionalId`
- UI: **nunca** chamar de "cliente" (esse termo é do cliente final)
- Exemplos corretos: "Olá, profissional!", "Configurações da profissional"
- Exemplos incorretos: ~~"Olá, cliente!"~~, ~~"usuária"~~

---

### cliente
**Definição:** Pessoa que agenda sessões com a profissional (cliente final da esteticista).
- SQL: `contacts` com `contact_type = 'client'`
- TypeScript: `client` apenas quando explicitamente o cliente final
- UI: usar livremente neste contexto: "Nova cliente", "Clientes VIP"
- Exemplos corretos: "Sua cliente Ana agendou", "3 clientes hoje"
- Exemplos incorretos: ~~"contato Ana"~~ (quando é claramente uma cliente)

---

### contato
**Definição:** Qualquer pessoa no WhatsApp da profissional (inclui clientes, pessoais, fornecedores, desconhecidos).
- SQL: tabela `contacts` (TODOS os tipos — `client`, `personal`, `business`, `unknown`)
- TypeScript: `contact`, `contactId`
- UI: usar quando o tipo for ambíguo ou desconhecido
- Exemplos corretos: "Novo contato identificado", "Contatos silenciosos"
- Exemplos incorretos: ~~"Novo cliente identificado"~~ (quando tipo ainda é `unknown`)

---

## Termos do nicho de estética

### sessão
**Definição:** Agendamento de um protocolo estético.
- SQL: tabela `appointments` (nome técnico OK em código)
- Campo: `appointments.protocol_name`, `appointments.starts_at`
- TypeScript: `appointment` no código, mas `sessão` na UI
- UI: **SEMPRE** "sessão", **nunca** "horário" ou "agendamento"
- Exemplos corretos: "Sessão de limpeza de pele às 14h", "3 sessões hoje"
- Exemplos incorretos: ~~"Horário às 14h"~~, ~~"Agendamento confirmado"~~

---

### protocolo
**Definição:** Serviço estético oferecido pela profissional (ex: limpeza de pele profunda, drenagem linfática).
- SQL: campo `protocol_name` em `appointments`, JSONB `protocols` em `professionals`
- TypeScript: `protocolName`, `protocol`
- UI: **SEMPRE** "protocolo", **nunca** "serviço"
- Catálogo: `/lib/protocols.ts` (26 protocolos em 3 categorias)
- Exemplos corretos: "Protocolo: limpeza de pele profunda", "Seus protocolos"
- Exemplos incorretos: ~~"Serviço: limpeza de pele"~~, ~~"Procedimento"~~

---

## Modos da Lara

### full
Lara responde a tudo no escopo (clientes fiéis que confiam na automação total).

### booking_only
Lara responde apenas intents de AGENDAR, CANCELAR e REMARCAR.

### silent
Lara nunca responde (família, amigos, fornecedores, contatos pessoais).

---

## Modos de atendimento

### studio
Profissional atende em seu espaço físico. Campo `studio_address` obrigatório.

### home
Profissional atende em domicílio. Campo `home_service_radius_km` obrigatório.

**Regra crítica:** Uma profissional opera em **um único modo** (studio OU home), nunca ambos.

---

## Regras de uso

1. Nunca usar "serviço" onde "protocolo" é o termo correto
2. Nunca usar "horário" onde "sessão" é o termo correto
3. Nunca chamar a profissional de "cliente" na UI
4. Nunca chamar um contato desconhecido de "cliente" antes da classificação
5. Ao criar novos componentes e strings, verificar este glossário primeiro
