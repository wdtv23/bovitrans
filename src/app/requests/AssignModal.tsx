'use client'

import { useEffect, useState } from 'react'
import { calculatePricing } from '@/lib/pricing'

interface TransportRequest {
  id: number
  requester_name: string
  head_count: number
  origin_label: string
  dest_label: string
  distance_km: string | null
  status: string
}

interface Truck {
  id: number
  plate: string
  capacity: number
  consumption_l_per_km: string
  status: string
  is_available: boolean
}

interface AssignModalProps {
  req: TransportRequest
  onClose: () => void
  onAssigned: () => void
}

function formatGs(n: number) {
  return `Gs. ${Math.round(n).toLocaleString('es-PY')}`
}

export default function AssignModal({ req, onClose, onAssigned }: AssignModalProps) {
  const [trucks,    setTrucks]    = useState<Truck[]>([])
  const [fuelPrice, setFuelPrice] = useState<number | null>(null)
  const [loadingData, setLoadingData] = useState(true)

  const [selectedId, setSelectedId]           = useState('')
  const [confirmedMultiple, setConfirmedMultiple] = useState(false)

  const [saving,   setSaving]   = useState(false)
  const [apiError, setApiError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/trucks?status=active').then(r => r.json()),
      fetch('/api/settings/fuel-price').then(r => r.json()),
    ]).then(([td, pd]) => {
      setTrucks(td.trucks ?? [])
      if (typeof pd.value === 'number') setFuelPrice(pd.value)
    }).catch(console.error)
      .finally(() => setLoadingData(false))
  }, [])

  // Reset confirmation when truck changes
  function handleSelectTruck(id: string) {
    setSelectedId(id)
    setConfirmedMultiple(false)
    setApiError('')
  }

  const selectedTruck = trucks.find(t => String(t.id) === selectedId) ?? null

  const distKm = req.distance_km ? Number(req.distance_km) : null

  const projection = selectedTruck && distKm != null && fuelPrice != null
    ? calculatePricing({
        distanceKm:        distKm,
        consumptionLPerKm: Number(selectedTruck.consumption_l_per_km),
        fuelPricePerLiter: fuelPrice,
        headCount:         req.head_count,
        truckCapacity:     selectedTruck.capacity,
      })
    : null

  const capacityExceeded = projection ? projection.tripsRequired > 1 : false
  const needsConfirmation = capacityExceeded && !confirmedMultiple

  async function handleAssign() {
    if (!selectedTruck) return
    setSaving(true)
    setApiError('')
    try {
      const res = await fetch(`/api/requests/${req.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truck_id: selectedTruck.id,
          force_multiple_trips: confirmedMultiple,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setApiError(data.error?.message ?? 'Error al asignar')
      } else {
        onAssigned()
        onClose()
      }
    } catch {
      setApiError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const availableTrucks = trucks.filter(t => t.is_available)
  const occupiedTrucks  = trucks.filter(t => !t.is_available)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-start gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Asignar camión</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {req.requester_name} · {req.origin_label} → {req.dest_label}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">
            &times;
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Missing distance warning */}
          {!distKm && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              Esta solicitud no tiene distancia calculada. Usá <strong>"Ver ruta"</strong> para obtenerla antes de asignar.
            </div>
          )}

          {/* Request summary */}
          <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="text-gray-400">Cabezas</p>
              <p className="font-semibold text-gray-900 mt-0.5">{req.head_count}</p>
            </div>
            <div>
              <p className="text-gray-400">Distancia</p>
              <p className={`font-semibold mt-0.5 ${distKm ? 'text-gray-900' : 'text-gray-300'}`}>
                {distKm ? `${distKm.toLocaleString('es-PY', { maximumFractionDigits: 1 })} km` : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-400">Precio comb.</p>
              <p className={`font-semibold mt-0.5 ${fuelPrice ? 'text-gray-900' : 'text-gray-300'}`}>
                {fuelPrice ? `${formatGs(fuelPrice)}/L` : '…'}
              </p>
            </div>
          </div>

          {/* Truck selector */}
          {loadingData ? (
            <p className="text-sm text-gray-400 text-center py-2">Cargando camiones…</p>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Camión a asignar
              </label>
              <select
                value={selectedId}
                onChange={e => handleSelectTruck(e.target.value)}
                disabled={!distKm}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           disabled:opacity-50 disabled:bg-gray-50"
              >
                <option value="">— Seleccioná un camión —</option>
                {availableTrucks.length > 0 && (
                  <optgroup label="Disponibles">
                    {availableTrucks.map(t => (
                      <option key={t.id} value={String(t.id)}>
                        {t.plate} · cap. {t.capacity} · {Number(t.consumption_l_per_km).toFixed(3)} L/km
                      </option>
                    ))}
                  </optgroup>
                )}
                {occupiedTrucks.length > 0 && (
                  <optgroup label="Ocupados (viaje activo)">
                    {occupiedTrucks.map(t => (
                      <option key={t.id} value={String(t.id)} disabled>
                        {t.plate} · cap. {t.capacity} — no disponible
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {availableTrucks.length === 0 && !loadingData && (
                <p className="text-xs text-amber-700 mt-1">
                  No hay camiones activos disponibles en este momento.
                </p>
              )}
            </div>
          )}

          {/* Projection */}
          {projection && !needsConfirmation && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <h3 className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                Proyección de costo
              </h3>
              <div className="space-y-1.5">
                <Row label="Camión">{selectedTruck!.plate}</Row>
                <Row label="Consumo">{Number(selectedTruck!.consumption_l_per_km).toFixed(3)} L/km</Row>
                <Row label="Viajes requeridos">
                  <span className={projection.tripsRequired > 1 ? 'text-amber-600 font-semibold' : ''}>
                    {projection.tripsRequired}
                  </span>
                </Row>
                {projection.tripsRequired > 1 && (
                  <Row label="Costo por viaje">{formatGs(projection.fuelCostPerTrip)}</Row>
                )}
                <div className="border-t border-blue-200 pt-1.5">
                  <Row label="Costo total" highlight>{formatGs(projection.totalFuelCost)}</Row>
                </div>
              </div>
              {projection.tripsRequired > 1 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-1">
                  Asignación confirmada con {projection.tripsRequired} viajes.
                </p>
              )}
            </div>
          )}

          {/* Capacity warning — requires explicit confirmation */}
          {needsConfirmation && projection && selectedTruck && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <span className="text-amber-500 text-lg leading-none shrink-0">⚠</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Exceso de capacidad</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {req.head_count} cabezas superan la capacidad de{' '}
                    <strong>{selectedTruck.capacity}</strong> del camión{' '}
                    <strong>{selectedTruck.plate}</strong>.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-amber-200 p-3 space-y-1.5 text-sm">
                <Row label="Viajes necesarios">
                  <span className="text-amber-700 font-bold">{projection.tripsRequired}</span>
                </Row>
                <Row label="Costo por viaje">{formatGs(projection.fuelCostPerTrip)}</Row>
                <div className="border-t border-amber-100 pt-1.5">
                  <Row label="Costo total estimado" highlight>{formatGs(projection.totalFuelCost)}</Row>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleSelectTruck('')}
                  className="flex-1 px-3 py-2 text-xs border border-amber-300 text-amber-800
                             rounded-lg hover:bg-amber-100 transition-colors font-medium"
                >
                  Cambiar camión
                </button>
                <button
                  onClick={() => setConfirmedMultiple(true)}
                  className="flex-1 px-3 py-2 text-xs bg-amber-500 text-white
                             rounded-lg hover:bg-amber-600 transition-colors font-medium"
                >
                  Confirmar {projection.tripsRequired} viajes
                </button>
              </div>
            </div>
          )}

          {/* API error */}
          {apiError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {apiError}
            </p>
          )}

          {/* Footer buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg
                         text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAssign}
              disabled={!selectedId || needsConfirmation || saving || !distKm}
              className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg
                         hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium"
            >
              {saving ? 'Asignando…' : 'Confirmar asignación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  highlight,
  children,
}: {
  label: string
  highlight?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className={highlight ? 'font-semibold text-gray-800' : 'text-gray-500'}>{label}</span>
      <span className={highlight ? 'font-bold text-blue-700' : 'font-medium text-gray-900'}>
        {children}
      </span>
    </div>
  )
}
