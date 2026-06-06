import { NextResponse } from 'next/server'
import { getSession, SessionPayload } from '@/lib/auth'

type GuardOk = { ok: true; session: SessionPayload }
type GuardFail = { ok: false; response: NextResponse }
type Guard = GuardOk | GuardFail

export async function requireAuth(): Promise<Guard> {
  const session = await getSession()
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
        { status: 401 },
      ),
    }
  }
  return { ok: true, session }
}

export async function requireAdmin(): Promise<Guard> {
  const result = await requireAuth()
  if (!result.ok) return result

  if (result.session.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Se requiere rol administrador' } },
        { status: 403 },
      ),
    }
  }
  return result
}
