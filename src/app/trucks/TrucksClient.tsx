'use client'

import { useState, useEffect, useCallback, FormEvent } from 'react'

type Truck = {
  id: number
  plate: string
  capacity: number
  consumption_l_per_km: string // pg devuelve NUMERIC como string
  status: 'active' | 'inactive'
  created_at: string
  created_by_username: string
}

type Feedback = { type: 'success' | 'error'; msg: string }

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------

function fmtConsumption(raw: string) {
  return `${Number(raw).toFixed(3)} L/km`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function TrucksClient() {
  const [trucks, setTrucks]         = useState<Truck[]>([])
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [feedback, setFeedback]     = useState<Feedback | null>(null)
  const [showCreate, setShowCreate]     = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Truck | null>(null)

  const fetchTrucks = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/trucks')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setTrucks(data.trucks)
    } catch {
      setFetchError('No se pudo cargar la flota')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTrucks() }, [fetchTrucks])

  function flash(type: Feedback['type'], msg: string) {
    setFeedback({ type, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  async function handleCreate(data: {
    plate: string
    capacity: number
    consumption_l_per_km: number
  }) {
    const res = await fetch('/api/trucks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      setShowCreate(false)
      await fetchTrucks()
      flash('success', `Camión ${data.plate.toUpperCase()} registrado`)
      return null
    }
    const body = await res.json()
    return body.error?.message ?? 'Error al registrar camión'
  }

  async function handleToggleStatus(truck: Truck) {
    const next = truck.status === 'active' ? 'inactive' : 'active'
    const res = await fetch(`/api/trucks/${truck.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    const body = await res.json()
    if (res.ok) {
      await fetchTrucks()
      flash('success', next === 'inactive' ? `${truck.plate} desactivado` : `${truck.plate} activado`)
    } else {
      flash('error', body.error?.message ?? 'Error al cambiar estado')
    }
  }

  async function handleDelete(truck: Truck) {
    const res = await fetch(`/api/trucks/${truck.id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    if (res.status === 204 || res.ok) {
      await fetchTrucks()
      flash('success', `Camión ${truck.plate} eliminado`)
    } else {
      const body = await res.json()
      flash('error', body.error?.message ?? 'Error al eliminar camión')
    }
  }

  const total    = trucks.length
  const activos  = trucks.filter((t) => t.status === 'active').length
  const inactivos = total - activos

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Flota de camiones</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Capacidad, consumo y estado de cada vehículo
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Nuevo camión
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
            feedback.type === 'success'
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total en flota',  value: total,     color: 'text-gray-900' },
          { label: 'Activos',         value: activos,   color: 'text-green-600' },
          { label: 'Inactivos',       value: inactivos, color: 'text-gray-400'  },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Estado de carga / vacío / error */}
      {loading ? (
        <div className="text-center py-20 text-gray-400 text-sm">Cargando flota…</div>
      ) : fetchError ? (
        <div className="flex flex-col items-center py-20 gap-3">
          <p className="text-red-500 text-sm">{fetchError}</p>
          <button
            onClick={fetchTrucks}
            className="text-sm text-blue-600 hover:underline"
          >
            Reintentar
          </button>
        </div>
      ) : trucks.length === 0 ? (
        <div className="flex flex-col items-center py-20 gap-2 text-gray-400">
          <p className="text-sm font-medium">Sin camiones registrados</p>
          <p className="text-xs">Registrá el primer vehículo para comenzar.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            + Registrar camión
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-gray-600">
                <th className="text-left px-4 py-3 font-medium">Patente</th>
                <th className="text-right px-4 py-3 font-medium">Capacidad</th>
                <th className="text-right px-4 py-3 font-medium">Consumo</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-left px-4 py-3 font-medium">Registrado por</th>
                <th className="text-left px-4 py-3 font-medium">Alta</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {trucks.map((truck) => (
                <tr
                  key={truck.id}
                  className={`border-b border-gray-50 last:border-0 transition-colors ${
                    truck.status === 'inactive' ? 'bg-gray-50/60' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className={`px-4 py-3 font-mono font-medium tracking-wide ${
                    truck.status === 'inactive' ? 'text-gray-400' : 'text-gray-900'
                  }`}>
                    {truck.plate}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                    {truck.capacity} <span className="text-gray-400 text-xs">cab.</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                    {fmtConsumption(truck.consumption_l_per_km)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={truck.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">{truck.created_by_username}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(truck.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleToggleStatus(truck)}
                      className={`text-xs px-2 py-1 rounded transition-colors ${
                        truck.status === 'active'
                          ? 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                          : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {truck.status === 'active' ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(truck)}
                      className="text-xs px-2 py-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateTruckModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          truck={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal: Registrar camión
// ---------------------------------------------------------------------------

function CreateTruckModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (d: {
    plate: string
    capacity: number
    consumption_l_per_km: number
  }) => Promise<string | null>
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    const capacity         = parseInt(fd.get('capacity') as string, 10)
    const consumption      = parseFloat(fd.get('consumption_l_per_km') as string)

    if (isNaN(capacity) || capacity <= 0) {
      setError('La capacidad debe ser un entero mayor a 0')
      return
    }
    if (isNaN(consumption) || consumption <= 0) {
      setError('El consumo debe ser un número mayor a 0')
      return
    }

    setLoading(true)
    const err = await onCreate({
      plate: fd.get('plate') as string,
      capacity,
      consumption_l_per_km: consumption,
    })
    if (err) setError(err)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Registrar camión</h2>
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
          Patente, capacidad y consumo son <strong>inmutables</strong> una vez guardados.
          Para corregir un dato, desactivá el camión y registrá uno nuevo.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Patente">
            <input
              name="plate"
              type="text"
              required
              maxLength={20}
              placeholder="Ej: ABCD 1234"
              className={inputCls}
              disabled={loading}
            />
          </Field>

          <Field label="Capacidad (cabezas de ganado)">
            <input
              name="capacity"
              type="number"
              required
              min={1}
              step={1}
              placeholder="40"
              className={inputCls}
              disabled={loading}
            />
          </Field>

          <Field label="Consumo (L/km)">
            <input
              name="consumption_l_per_km"
              type="number"
              required
              min={0.001}
              step={0.001}
              placeholder="0.420"
              className={inputCls}
              disabled={loading}
            />
          </Field>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Guardando…' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal: Confirmar eliminación
// ---------------------------------------------------------------------------

function ConfirmDeleteModal({
  truck,
  onConfirm,
  onCancel,
}: {
  truck: Truck
  onConfirm: () => Promise<void>
  onCancel: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Eliminar camión</h2>
        <p className="text-sm text-gray-600 mb-1">
          ¿Confirmás la eliminación de{' '}
          <span className="font-mono font-semibold text-gray-900">{truck.plate}</span>?
        </p>
        <p className="text-xs text-gray-400 mb-6">
          Esta acción es permanente. Si el camión tiene asignaciones históricas el
          sistema lo impedirá; en ese caso podés desactivarlo en su lugar.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Eliminando…' : 'Sí, eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers visuales
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: Truck['status'] }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        status === 'active'
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-500'
      }`}
    >
      {status === 'active' ? 'Activo' : 'Inactivo'}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400'
