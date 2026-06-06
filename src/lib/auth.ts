import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

export const COOKIE_NAME = 'bovitrans_session'
const SESSION_MAX_AGE = 60 * 60 * 8 // 8 horas

function secret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET ?? 'change-me-in-production',
  )
}

export interface SessionPayload {
  sub: string
  username: string
  role: 'admin' | 'operador'
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret())
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret())
  return payload as unknown as SessionPayload
}

// Para Route Handlers: lee la sesión desde las cookies de Next.js.
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    return await verifySession(token)
  } catch {
    return null
  }
}

export { SESSION_MAX_AGE }
