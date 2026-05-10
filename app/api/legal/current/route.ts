/**
 * GET /api/legal/current
 * Retorna a versão mais recente publicada de cada documento legal.
 *
 * Cache-Control: public, max-age=3600
 * Documentos legais mudam raramente — 1h de cache é seguro.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(): Promise<NextResponse> {
  const supabase = createAdminClient()
  const now      = new Date().toISOString()

  const DOC_TYPES = ['privacy_policy', 'terms_of_use'] as const

  const results: Record<string, unknown> = {}

  for (const docType of DOC_TYPES) {
    const { data: raw } = await supabase
      .from('legal_documents')
      .select('id, doc_type, version, effective_at, content')
      .eq('doc_type', docType)
      .lte('effective_at', now)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    results[docType] = raw as unknown ?? null
  }

  return NextResponse.json(results, {
    status: 200,
    headers: {
      // CDN-friendly — documentos raramente mudam
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
