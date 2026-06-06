import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import pool from '@/lib/db'
import { requireAdmin } from '@/lib/api-guard'

const CreateSchema = z.object({
  username: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .max(50, 'Máximo 50 caracteres')
    .regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guiones bajos'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  role: z.enum(['admin', 'operador']),
})

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  try {
    const result = await pool.query(
      'SELECT id, username, role, is_active, created_at FROM users ORDER BY created_at ASC',
    )
    return NextResponse.json({ users: result.rows })
  } catch (err) {
    console.error('[users:GET]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Cuerpo inválido' } },
      { status: 400 },
    )
  }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Datos inválidos',
          fields: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    )
  }

  const { username, password, role } = parsed.data
  const password_hash = await bcrypt.hash(password, 10)

  try {
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, username, role, is_active, created_at`,
      [username, password_hash, role],
    )
    console.info(`[users:POST] created user="${username}" role="${role}"`)
    return NextResponse.json({ user: result.rows[0] }, { status: 201 })
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      err.code === '23505'
    ) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'El nombre de usuario ya existe' } },
        { status: 409 },
      )
    }
    console.error('[users:POST]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}
