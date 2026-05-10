'use client'

/**
 * LaraModesSetupForm.tsx — Passo 5 do onboarding
 *
 * Parte A: Comportamento padrão para contatos novos (default_lara_mode)
 *   - cautious (recomendado): Lara fica em silêncio para contatos novos
 *   - standard: Lara responde apenas mensagens de agendamento para contatos novos
 *
 * Parte B: Pré-cadastro de contatos pessoais (opcional)
 *   - Cria contacts com lara_mode='silent' + pre_registered=true
 *   - contact_type='personal' ou 'business'
 *
 * Ver /docs/glossary.md — Modos da Lara e "contato" vs "cliente"
 */

import { useState } from 'react'
import type { SetupState, PreRegisteredContact } from '@/lib/onboarding-types'
import { maskPhone, stripMask, isValidBrazilianPhone } from '@/lib/validation'

interface LaraModesSetupFormProps {
  initial: Pick<SetupState, 'defaultLaraMode' | 'preRegisteredContacts'>
  onSave: (data: {
    defaultLaraMode: 'cautious' | 'standard'
    contacts: PreRegisteredContact[]
  }) => void
  onSkipContacts: () => void
}

// ── Parte A: seleção do modo padrão ──────────────────────────────────────────

const MODE_OPTIONS: {
  id: 'cautious' | 'standard'
  icon: string
  title: string
  items: string[]
}[] = [
  {
    id: 'cautious',
    icon: '🟢',
    title: 'Modo cuidadoso (recomendado)',
    items: [
      'Lara fica em silêncio com contatos novos',
      'Você decide caso a caso',
      'Risco zero de constrangimento',
    ],
  },
  {
    id: 'standard',
    icon: '🟡',
    title: 'Modo padrão',
    items: [
      'Lara responde se for sobre agendamento',
      'Para outras conversas, fica em silêncio',
      'Mais rápido, menos cuidadoso',
    ],
  },
]

// ── Parte B: pré-cadastro de contatos pessoais ────────────────────────────────

function ContactsSection({
  contacts,
  onChange,
}: {
  contacts: PreRegisteredContact[]
  onChange: (c: PreRegisteredContact[]) => void
}) {
  const [name, setName]     = useState('')
  const [phone, setPhone]   = useState('')
  const [type, setType]     = useState<'personal' | 'business'>('personal')
  const [phoneErr, setPhoneErr] = useState<string>()

  function addContact() {
    if (!name.trim()) return
    const digits = stripMask(phone)
    if (!isValidBrazilianPhone(digits)) {
      setPhoneErr('Telefone inválido. Ex: (11) 99999-9999')
      return
    }
    // Evita duplicatas pelo número
    if (contacts.some(c => c.phone_number === digits)) {
      setPhoneErr('Este número já foi adicionado.')
      return
    }
    setPhoneErr(undefined)
    onChange([...contacts, { name: name.trim(), phone_number: digits, contact_type: type }])
    setName('')
    setPhone('')
  }

  function removeContact(index: number) {
    onChange(contacts.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">
          🔒 A Lara não acessa seus contatos do celular (Meta não permite por privacidade).
          Adicione manualmente quem nunca deve receber resposta da Lara — família, amigos, fornecedores.
          Eles entram em modo silencioso permanente.
        </p>
      </div>

      {/* Lista de contatos adicionados */}
      {contacts.length > 0 && (
        <ul className="space-y-2">
          {contacts.map((c, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5"
            >
              <div>
                <span className="text-sm font-medium text-gray-900">{c.name}</span>
                <span className="ml-2 text-xs text-gray-400">
                  {c.phone_number.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}
                </span>
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  c.contact_type === 'personal' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {c.contact_type === 'personal' ? 'Pessoal' : 'Fornecedor'}
                </span>
              </div>
              <button
                onClick={() => removeContact(i)}
                aria-label={`Remover ${c.name}`}
                className="rounded-full p-1 text-gray-300 hover:text-red-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Form de novo contato */}
      <div className="space-y-2 rounded-2xl border border-gray-100 p-4">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder='Nome (ex: "Mãe", "Marido")'
            className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none col-span-2"
          />
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(maskPhone(e.target.value))}
            placeholder="(11) 99999-9999"
            maxLength={15}
            className={`rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${
              phoneErr ? 'border-red-400' : 'border-gray-300 focus:border-rose-400'
            }`}
          />
          <select
            value={type}
            onChange={e => setType(e.target.value as 'personal' | 'business')}
            className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-rose-400 focus:outline-none"
          >
            <option value="personal">Pessoal</option>
            <option value="business">Fornecedor</option>
          </select>
        </div>
        {phoneErr && <p role="alert" className="text-xs text-red-500">{phoneErr}</p>}
        <button
          onClick={addContact}
          disabled={!name.trim()}
          className="w-full rounded-xl border border-rose-300 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40"
        >
          + Adicionar contato silencioso
        </button>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function LaraModesSetupForm({ initial, onSave, onSkipContacts }: LaraModesSetupFormProps) {
  const [defaultMode, setDefaultMode] = useState<'cautious' | 'standard'>(initial.defaultLaraMode)
  const [contacts, setContacts]       = useState<PreRegisteredContact[]>(initial.preRegisteredContacts)
  const [showContacts, setShowContacts] = useState(initial.preRegisteredContacts.length > 0)

  return (
    <div className="space-y-6">
      {/* Parte A */}
      <div>
        <p className="mb-3 text-sm font-semibold text-gray-800">
          Quando uma pessoa nova mandar mensagem, o que a Lara deve fazer?
        </p>
        <div className="space-y-3">
          {MODE_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setDefaultMode(opt.id)}
              aria-pressed={defaultMode === opt.id}
              className={`flex w-full flex-col gap-2 rounded-2xl border-2 p-5 text-left transition ${
                defaultMode === opt.id
                  ? 'border-rose-500 bg-rose-50'
                  : 'border-gray-200 bg-white hover:border-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg" aria-hidden="true">{opt.icon}</span>
                <span className="text-sm font-bold text-gray-900">{opt.title}</span>
              </div>
              <ul className="space-y-1 pl-7">
                {opt.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                    <span className="mt-0.5 text-gray-400" aria-hidden="true">–</span>
                    {item}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </div>

      {/* Parte B */}
      {!showContacts ? (
        <button
          onClick={() => setShowContacts(true)}
          className="w-full rounded-xl border border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:bg-gray-50"
        >
          + Adicionar contatos pessoais que a Lara deve sempre ignorar
        </button>
      ) : (
        <div>
          <p className="mb-3 text-sm font-semibold text-gray-800">
            Contatos pessoais silenciosos (opcional)
          </p>
          <ContactsSection contacts={contacts} onChange={setContacts} />
          <p className="mt-2 text-center text-xs text-gray-400">
            Você pode adicionar mais contatos depois pelo painel.
          </p>
        </div>
      )}

      {/* Botões */}
      <div className="flex gap-3">
        <button
          onClick={() => onSave({ defaultLaraMode: defaultMode, contacts })}
          className="flex-1 rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white transition hover:bg-rose-600"
        >
          Salvar e continuar
        </button>
        {showContacts && contacts.length === 0 && (
          <button
            onClick={() => { setShowContacts(false); onSkipContacts() }}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-500 hover:bg-gray-50"
          >
            Pular
          </button>
        )}
      </div>
    </div>
  )
}
