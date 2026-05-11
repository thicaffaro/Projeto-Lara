import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Props): Promise<NextResponse> {
  const { id } = await params
  const supabase = createAdminClient()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const [{ data: contacts }, { data: messages }] = await Promise.all([
    supabase.from('contacts').select('lara_mode, contact_type').eq('professional_id', id),
    supabase.from('messages').select('lara_mode_decision').eq('professional_id', id).gte('created_at', monthStart).not('lara_mode_decision', 'is', null),
  ])

  type ContactRow = { lara_mode: string; contact_type: string }
  type MsgRow = { lara_mode_decision: string | null }

  const modeCount: Record<string, number> = {}
  for (const c of (contacts ?? []) as unknown as ContactRow[]) {
    modeCount[c.lara_mode] = (modeCount[c.lara_mode] ?? 0) + 1
  }
  const byMode = Object.entries(modeCount).map(([name, value]) => ({ name, value }))

  const decisionCount: Record<string, number> = {}
  for (const m of (messages ?? []) as unknown as MsgRow[]) {
    const d = m.lara_mode_decision ?? 'unknown'
    decisionCount[d] = (decisionCount[d] ?? 0) + 1
  }
  const byDecision = Object.entries(decisionCount).map(([decision, count]) => ({ decision, count }))
    .sort((a, b) => b.count - a.count).slice(0, 6)

  return NextResponse.json({ byMode, byDecision })
}
