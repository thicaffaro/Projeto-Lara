import Link from 'next/link'

export default function AdminOpsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Operação</h1>
      <div className="grid grid-cols-3 gap-4">
        {[
          { href: '/admin/ops/health', label: '❤️ Saúde do sistema', desc: 'Latências, taxa respondida, DLQ' },
          { href: '/admin/ops/costs', label: '💸 Custos estimados', desc: 'LLM, Cloud API, SMS' },
          { href: '/admin/ops/templates', label: '📝 Templates', desc: 'Status por profissional' },
        ].map(item => (
          <Link key={item.href} href={item.href} className="rounded-2xl border border-gray-200 bg-white p-5 hover:border-rose-300 transition">
            <p className="text-base font-semibold text-gray-900">{item.label}</p>
            <p className="mt-1 text-xs text-gray-400">{item.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
