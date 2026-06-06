import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import pool from '@/lib/db'
import { signSession, COOKIE_NAME, SESSION_MAX_AGE } from '@/lib/auth'

const LoginSchema = z.object({
  username: z.string().min(1, 'Requerido'),
  password: z.string().min(1, 'Requerido'),
})

// Hash de relleno para ejecutar siempre bcrypt.compare y evitar
// enumeración de usuarios por diferencias de tiempo.
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Cuerpo inválido' } },
      { status: 400 },
    )
  }

  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Usuario y contraseña requeridos',
          fields: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    )
  }

  const { username, password } = parsed.data

  type UserRow = {
    id: number
    username: string
    password_hash: string
    role: string
    is_active: boolean
  }
  let user: UserRow | undefined

  try {
    const result = await pool.query<UserRow>(
      'SELECT id, username, password_hash, role, is_active FROM users WHERE username = $1',
      [username],
    )
    user = result.rows[0]
  } catch (err) {
    console.error('[login] db error', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }

  const hashToCompare = user?.password_hash ?? DUMMY_HASH
  const passwordValid = await bcrypt.compare(password, hashToCompare)

  // Respuesta genérica: no revelar si el usuario existe o la contraseña es incorrecta
  if (!user || !passwordValid || !user.is_active) {
    return NextResponse.json(
      { error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' } },
      { status: 401 },
    )
  }

  let token: string
  try {
    token = await signSession({
      sub: String(user.id),
      username: user.username,
      role: user.role as 'admin' | 'operador',
    })
  } catch (err) {
    console.error('[login] jwt error', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }

  const response = NextResponse.json({
    user: { id: user.id, username: user.username, role: user.role },
  })

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  })

  console.info(`[login] user="${user.username}" role="${user.role}"`)
  return response
}
