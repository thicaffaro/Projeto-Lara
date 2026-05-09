-- =============================================================================
-- 0004_seed_legal_documents.sql
-- Lara — Versão 1 inicial de Política de Privacidade e Termos de Uso
-- ATENÇÃO: Conteúdo placeholder. Advogado deve revisar e preencher antes do go-live.
-- =============================================================================

INSERT INTO legal_documents (
  id,
  doc_type,
  version,
  content,
  effective_at
) VALUES

-- Política de Privacidade — v1 (placeholder)
(
  uuid_generate_v4(),
  'privacy_policy',
  1,
  '# Política de Privacidade — Lara Assistente

**Versão:** 1.0
**Vigência:** [DATA A PREENCHER]
**Responsável:** [RAZÃO SOCIAL / CPF/CNPJ A PREENCHER]

> ⚠️ DOCUMENTO PLACEHOLDER — Conteúdo jurídico completo deve ser redigido por advogado especializado em LGPD antes do lançamento.

## 1. Dados coletados

A Lara coleta os seguintes dados das profissionais e de seus contatos no WhatsApp:

- Nome completo, telefone, CPF/CNPJ da esteticista (profissional)
- Mensagens trocadas via WhatsApp para fins de agendamento
- Fotos e áudios enviados por clientes finais (armazenados por 12 meses)
- Dados de agendamento (protocolo, data, horário, localização)

## 2. Finalidade do tratamento

- Operação do serviço de agendamento automatizado
- Comunicação via WhatsApp Business Cloud API
- Faturamento via Mercado Pago

## 3. Compartilhamento de dados

Os dados são compartilhados apenas com:
- Meta Platforms (WhatsApp Business API)
- Supabase (armazenamento)
- Mercado Pago (pagamentos)

## 4. Direitos do titular

Conforme LGPD (Lei 13.709/2018), o titular pode solicitar acesso, correção, portabilidade ou exclusão dos seus dados.

## 5. Contato

[EMAIL DE CONTATO A PREENCHER]',
  '2025-01-01 00:00:00+00'
),

-- Termos de Uso — v1 (placeholder)
(
  uuid_generate_v4(),
  'terms_of_use',
  1,
  '# Termos de Uso — Lara Assistente

**Versão:** 1.0
**Vigência:** [DATA A PREENCHER]
**Responsável:** [RAZÃO SOCIAL / CPF/CNPJ A PREENCHER]

> ⚠️ DOCUMENTO PLACEHOLDER — Conteúdo jurídico completo deve ser redigido por advogado especializado antes do lançamento.

## 1. Objeto

A Lara é um serviço de assistente virtual para agendamentos de esteticistas, disponibilizado como SaaS (Software as a Service) pelo valor de R$ 99/mês.

## 2. Aceitação

Ao criar uma conta na Lara, a profissional aceita estes Termos de Uso integralmente.

## 3. Uso permitido

- Uso exclusivo para gestão de agenda profissional própria
- Proibido uso para spam, fraude ou qualquer atividade ilegal
- Proibido revenda do serviço sem autorização expressa

## 4. Assinatura e cobrança

- Período de avaliação gratuita de 7 dias (após aprovação de 4 dos 6 templates)
- Cobrança mensal de R$ 99 via Mercado Pago
- Cancelamento a qualquer momento sem multa; acesso encerra no fim do período pago

## 5. Limitação de responsabilidade

A Lara não se responsabiliza por:
- Falhas ou interrupções da Meta/WhatsApp
- Conteúdo enviado pela profissional ou seus clientes

## 6. Rescisão

A Lara pode suspender contas que violem estes termos, mediante aviso prévio quando possível.

## 7. Foro

[FORO A PREENCHER], com renúncia a qualquer outro.',
  '2025-01-01 00:00:00+00'
)

ON CONFLICT (doc_type, version) DO NOTHING;
