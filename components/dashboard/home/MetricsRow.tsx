interface MetricsData {
  todayCount:    number
  weekCount:     number
  noShowPct:     number
  pendingReplies: number
}

export function MetricsRow({ metrics }: { metrics: MetricsData }) {
  const cards = [
    { label: 'Hoje',          value: metrics.todayCount,        unit: 'sessões'  },
    { label: 'Esta semana',   value: metrics.weekCount,         unit: 'sessões'  },
    { label: 'No-show',       value: `${metrics.noShowPct}%`,   unit: 'este mês' },
    { label: 'Aguardando',    value: metrics.pendingReplies,    unit: 'msg'      },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 px-4 py-3">
      {cards.map(card => (
        <div key={card.label} className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{card.value}</p>
          <p className="mt-0.5 text-xs font-medium text-gray-500">{card.label}</p>
          <p className="text-[10px] text-gray-400">{card.unit}</p>
        </div>
      ))}
    </div>
  )
}
