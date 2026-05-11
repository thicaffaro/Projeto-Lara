'use client'

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const COLORS = ['#f43f5e','#fb923c','#facc15','#4ade80','#60a5fa','#c084fc']

interface PieData { name: string; value: number }
interface BarData { decision: string; count: number }

export function AdminPieChart({ data, title }: { data: PieData[]; title: string }) {
  if (!data.length) return <p className="text-sm text-gray-400 py-4 text-center">Sem dados</p>
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-gray-700">{title}</p>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip /><Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export function AdminHBarChart({ data, title }: { data: BarData[]; title: string }) {
  if (!data.length) return <p className="text-sm text-gray-400 py-4 text-center">Sem dados</p>
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-gray-700">{title}</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical">
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis dataKey="decision" type="category" tick={{ fontSize: 10 }} width={120} />
          <Tooltip />
          <Bar dataKey="count" fill="#f43f5e" radius={[0,4,4,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
