import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Props): Promise<NextResponse> {
  const { id } = await params
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('professionals')
    .select('id, name, phone_number, specialty, service_mode, whatsapp_status, default_lara_mode, is_paused, trial_started_at, trial_ends_at, created_at, onboarding_completed')
    .eq('id', id).single()
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ professional: data })
}
