import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { destroyDashboardSession, COOKIE_NAME } from '@/lib/auth/dashboardSession'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value

  if (token) await destroyDashboardSession(token)

  const res = NextResponse.json({ ok: true })
  res.cookies.delete(COOKIE_NAME)
  return res
}
