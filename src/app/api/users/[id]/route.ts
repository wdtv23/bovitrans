import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import pool from '@/lib/db'
import { requireAdmin } from '@/lib/api-guard'

// Al menos uno de los dos campos es obligatorio
const UpdateSchema = z
  .object({
    role: z.enum(['admin', 'operador']).optional(),
    password: z.string().min(8, 'Mínimo 8 caracteres').optional(),
  })
  .refine((d) => d.role !== undefined || d.password !== undefined, {
    message: 'Se requiere al menos role o password para actualizar',
  })

type UserRow = { id: number; username: string; role: string; is_active: boolean }

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id: rawId } = await params
  const id = parseInt(rawId, 10)
  if (isNaN(id)) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Usuario no encontrado' } },
      { status: 404 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Cuerpo inválido' } },
      { status: 400 },
    )
  }

  const parsed = UpdateSchema.safeParse(body)
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

  const { role, password } = parsed.data

  // Verificar que el usuario existe
  const currentResult = await pool.query<UserRow>(
    'SELECT id, username, role, is_active FROM users WHERE id = $1',
    [id],
  )
  const currentUser = currentResult.rows[0]
  if (!currentUser) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Usuario no encontrado' } },
      { status: 404 },
    )
  }

  // Regla: no degradar al último admin activo
  if (role === 'operador' && currentUser.role === 'admin') {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM users
       WHERE role = 'admin' AND is_active = TRUE AND id != $1`,
      [id],
    )
    if (parseInt(rows[0].count, 10) === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'LAST_ADMIN',
            message: 'No se puede degradar al último administrador activo',
          },
        },
        { status: 422 },
      )
    }
  }

  // Construcción dinámica del UPDATE
  const sets: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (role !== undefined) {
    sets.push(`role = $${idx++}`)
    values.push(role)
  }
  if (password !== undefined) {
    sets.push(`password_hash = $${idx++}`)
    values.push(await bcrypt.hash(password, 10))
  }
  sets.push('updated_at = now()')
  values.push(id)

  try {
    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, username, role, is_active, created_at`,
      values,
    )
    console.info(`[users/:id:PATCH] id=${id}`)
    return NextResponse.json({ user: result.rows[0] })
  } catch (err) {
    console.error('[users/:id:PATCH]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id: rawId } = await params
  const id = parseInt(rawId, 10)
  if (isNaN(id)) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Usuario no encontrado' } },
      { status: 404 },
    )
  }

  const currentResult = await pool.query<UserRow>(
    'SELECT id, username, role, is_active FROM users WHERE id = $1',
    [id],
  )
  const currentUser = currentResult.rows[0]
  if (!currentUser) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Usuario no encontrado' } },
      { status: 404 },
    )
  }

  // Regla: no eliminar al último admin activo
  if (currentUser.role === 'admin') {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM users
       WHERE role = 'admin' AND is_active = TRUE AND id != $1`,
      [id],
    )
    if (parseInt(rows[0].count, 10) === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'LAST_ADMIN',
            message: 'No se puede eliminar al último administrador activo',
          },
        },
        { status: 422 },
      )
    }
  }

  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id])
    console.info(`[users/:id:DELETE] id=${id} username="${currentUser.username}"`)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    // FK violation: el usuario tiene camiones, solicitudes o asignaciones asociadas
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      err.code === '23503'
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message:
              'El usuario tiene registros asociados (camiones, solicitudes o asignaciones). Desactivarlo en lugar de eliminarlo.',
          },
        },
        { status: 409 },
      )
    }
    console.error('[users/:id:DELETE]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}
