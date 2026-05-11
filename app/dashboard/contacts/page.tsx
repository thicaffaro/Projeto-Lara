'use client'

export const dynamic = 'force-dynamic'

import { ContactList } from '@/components/dashboard/contacts/ContactList'

export default function ContactsPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-base font-bold text-gray-900">Contatos</h1>
      </div>
      <ContactList />
    </div>
  )
}
