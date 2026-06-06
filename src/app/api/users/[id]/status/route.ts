import { NextResponse } from 'next/server'
import { z } from 'zod'
import pool from '@/lib/db'
import { requireAdmin } from '@/lib/api-guard'

const StatusSchema = z.object({
  is_active: z.boolean(),
})

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

  const parsed = StatusSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } },
      { status: 400 },
    )
  }

  const { is_active } = parsed.data

  // Verificar que el usuario existe
  const currentResult = await pool.query<{ role: string }>(
    'SELECT role FROM users WHERE id = $1',
    [id],
  )
  const currentUser = currentResult.rows[0]
  if (!currentUser) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Usuario no encontrado' } },
      { status: 404 },
    )
  }

  // Regla: no desactivar al último admin activo
  if (!is_active && currentUser.role === 'admin') {
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
            message: 'No se puede desactivar al último administrador activo',
          },
        },
        { status: 422 },
      )
    }
  }

  try {
    const result = await pool.query(
      `UPDATE users SET is_active = $1, updated_at = now()
       WHERE id = $2
       RETURNING id, username, role, is_active, created_at`,
      [is_active, id],
    )
    console.info(`[users/:id/status:PATCH] id=${id} is_active=${is_active}`)
    return NextResponse.json({ user: result.rows[0] })
  } catch (err) {
    console.error('[users/:id/status:PATCH]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}
