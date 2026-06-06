import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireAuth } from '@/lib/api-guard'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAuth()
  if (!guard.ok) return guard.response

  const { id: rawId } = await params
  const id = parseInt(rawId, 10)
  if (isNaN(id)) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Camión no encontrado' } },
      { status: 404 },
    )
  }

  const existing = await pool.query<{ plate: string }>(
    'SELECT plate FROM trucks WHERE id = $1',
    [id],
  )
  if (!existing.rows[0]) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Camión no encontrado' } },
      { status: 404 },
    )
  }

  try {
    await pool.query('DELETE FROM trucks WHERE id = $1', [id])
    console.info(`[trucks/:id:DELETE] id=${id} plate="${existing.rows[0].plate}"`)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    // FK violation: el camión tiene asignaciones históricas (ON DELETE RESTRICT)
    if (err && typeof err === 'object' && 'code' in err && err.code === '23503') {
      return NextResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message:
              'El camión tiene asignaciones registradas y no puede eliminarse. Desactivalo para sacarlo de circulación.',
          },
        },
        { status: 409 },
      )
    }
    console.error('[trucks/:id:DELETE]', err)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } },
      { status: 500 },
    )
  }
}
