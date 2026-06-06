'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { calculatePricing } from '@/lib/pricing'

interface TransportRequest {
  id: number
  requester_name: string
  head_count: number
  origin_label: string
  origin_lat: string
  origin_lng: string
  dest_label: string
  dest_lat: string
  dest_lng: string
  distance_km: string | null
  status: 'pending' | 'assigned' | 'completed' | 'cancelled'
}

interface Truck {
  id: number
  plate: string
  capacity: number
  consumption_l_per_km: string
  status: string
}

interface RequestMapModalProps {
  req: TransportRequest
  onClose: () => void
  onDistanceSaved: (distanceKm: number) => void
}

function formatGs(n: number) {
  return `Gs. ${Math.round(n).toLocaleString('es-PY')}`
}

export default function RequestMapModal({ req, onClose, onDistanceSaved }: RequestMapModalProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const leafletMapRef   = useRef<LeafletMap | null>(null)

  const originLat = Number(req.origin_lat)
  const originLng = Number(req.origin_lng)
  const destLat   = Number(req.dest_lat)
  const destLng   = Number(req.dest_lng)

  // Distance state — seed from persisted value if already exists
  const [routeDistance,  setRouteDistance]  = useState<number | null>(
    req.distance_km ? Number(req.distance_km) : null,
  )
  const [routingLoading, setRoutingLoading] = useState(true)
  const [routingError,   setRoutingError]   = useState(false)
  const [isManual,       setIsManual]       = useState(false)
  const [manualKm,       setManualKm]       = useState('')

  // Save distance
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [saveError, setSaveError] = useState('')
  const canSave = req.status === 'pending' || req.status === 'assigned'
  // Only show save button if distance differs from what's already persisted
  const persistedKm = req.distance_km ? Number(req.distance_km) : null
  const distanceChanged = routeDistance !== null && routeDistance !== persistedKm

  // Trucks + fuel price
  const [trucks,    setTrucks]    = useState<Truck[]>([])
  const [fuelPrice, setFuelPrice] = useState<number | null>(null)
  const [selectedTruckId, setSelectedTruckId] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/trucks?status=active').then(r => r.json()),
      fetch('/api/settings/fuel-price').then(r => r.json()),
    ]).then(([td, pd]) => {
      setTrucks(td.trucks ?? [])
      if (typeof pd.value === 'number') setFuelPrice(pd.value)
    }).catch(console.error)
  }, [])

  // Leaflet map initialization
  useEffect(() => {
    if (!mapContainerRef.current) return
    let cancelled = false

    const init = async () => {
      // Leaflet CSS via link tag (Next.js does not allow global CSS imports outside layout)
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link')
        link.id   = 'leaflet-css'
        link.rel  = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }

      const L = (await import('leaflet')).default
      if (cancelled || !mapContainerRef.current) return

      // Fix webpack-broken default marker icons
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapContainerRef.current)
      leafletMapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map)

      // Custom colored div-icons for origin (green) and destination (red)
      const pin = (color: string) => L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;background:${color};border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })

      L.marker([originLat, originLng], { icon: pin('#16a34a') })
        .bindPopup(`<strong>Origen</strong><br>${req.origin_label}`)
        .addTo(map)
      L.marker([destLat, destLng], { icon: pin('#dc2626') })
        .bindPopup(`<strong>Destino</strong><br>${req.dest_label}`)
        .addTo(map)

      map.fitBounds([[originLat, originLng], [destLat, destLng]], { padding: [50, 50] })

      // OSRM public routing (lon,lat order)
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/` +
          `${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`

        const res  = await fetch(url, { signal: AbortSignal.timeout(10_000) })
        if (!res.ok) throw new Error(`OSRM ${res.status}`)
        const data = await res.json()
        if (cancelled) return

        const route = data.routes?.[0]
        if (!route) throw new Error('Sin ruta')

        const distKm = Math.round((route.distance / 1000) * 100) / 100
        L.geoJSON(route.geometry, {
          style: { color: '#2563eb', weight: 4, opacity: 0.85 },
        }).addTo(map)

        setRouteDistance(distKm)
        setRoutingError(false)
      } catch {
        if (cancelled) return
        setRoutingError(true)
        setIsManual(true)
        // Draw straight line as visual aid
        L.polyline([[originLat, originLng], [destLat, destLng]], {
          color: '#9ca3af', weight: 2, dashArray: '6 4',
        }).addTo(map)
      } finally {
        if (!cancelled) setRoutingLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
      leafletMapRef.current?.remove()
      leafletMapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cost projection
  const selectedTruck = trucks.find(t => String(t.id) === selectedTruckId) ?? null
  const projection = selectedTruck && routeDistance != null && fuelPrice != null
    ? calculatePricing({
        distanceKm:         routeDistance,
        consumptionLPerKm:  Number(selectedTruck.consumption_l_per_km),
        fuelPricePerLiter:  fuelPrice,
        headCount:          req.head_count,
        truckCapacity:      selectedTruck.capacity,
      })
    : null

  async function handleSaveDistance() {
    if (!routeDistance || routeDistance <= 0) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch(`/api/requests/${req.id}/distance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distance_km: routeDistance }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error?.message ?? 'Error al guardar')
      } else {
        setSaved(true)
        onDistanceSaved(routeDistance)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch {
      setSaveError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  function handleUseManual() {
    const v = parseFloat(manualKm)
    if (v > 0) {
      setRouteDistance(v)
      setManualKm('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 truncate">
            Ruta · {req.requester_name}
          </h2>
          <p className="text-xs text-gray-400 truncate mt-0.5">
            {req.origin_label}
            <span className="mx-1 text-gray-300">→</span>
            {req.dest_label}
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 text-gray-400 hover:text-gray-700 text-2xl leading-none"
        >
          &times;
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Map area */}
        <div className="flex-1 relative">
          <div ref={mapContainerRef} className="absolute inset-0" />

          {/* Routing-in-progress pill */}
          {routingLoading && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10
                            bg-white/90 backdrop-blur rounded-full px-4 py-1.5
                            text-xs text-gray-600 shadow-sm border border-gray-200">
              Calculando ruta vía OSRM…
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur
                          rounded-lg px-3 py-2 text-xs text-gray-600 shadow-sm
                          border border-gray-200 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-green-600 shrink-0" />
              Origen
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-red-600 shrink-0" />
              Destino
            </div>
          </div>
        </div>

        {/* ── Side panel ─────────────────────────────────────────────────── */}
        <div className="w-80 shrink-0 border-l border-gray-200 overflow-y-auto
                        flex flex-col gap-4 p-5 bg-gray-50">

          {/* Distance card */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Distancia
            </h3>

            {/* OSRM error + manual fallback */}
            {routingError && (
              <div className="space-y-2">
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  OSRM no pudo calcular la ruta. Ingresá la distancia manualmente.
                </p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={manualKm}
                    onChange={e => setManualKm(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleUseManual()}
                    placeholder="km"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleUseManual}
                    disabled={!manualKm || parseFloat(manualKm) <= 0}
                    className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg
                               hover:bg-gray-200 disabled:opacity-40 font-medium"
                  >
                    Usar
                  </button>
                </div>
              </div>
            )}

            {routingLoading && !routingError && (
              <p className="text-sm text-gray-400">Calculando…</p>
            )}

            {routeDistance != null && (
              <div className="space-y-2">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {routeDistance.toLocaleString('es-PY', { maximumFractionDigits: 1 })}
                      <span className="text-base font-normal text-gray-400 ml-1">km</span>
                    </p>
                    {isManual && (
                      <p className="text-xs text-gray-400">Distancia ingresada manualmente</p>
                    )}
                    {!isManual && persistedKm === routeDistance && (
                      <p className="text-xs text-gray-400">Ya guardada en la solicitud</p>
                    )}
                  </div>
                  {canSave && distanceChanged && (
                    <button
                      onClick={handleSaveDistance}
                      disabled={saving || saved}
                      className="shrink-0 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg
                                 hover:bg-blue-700 disabled:opacity-60 font-medium"
                    >
                      {saved ? '✓ Guardado' : saving ? 'Guardando…' : 'Guardar km'}
                    </button>
                  )}
                </div>
                {saveError && <p className="text-xs text-red-600">{saveError}</p>}
              </div>
            )}
          </div>

          {/* Request meta */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Solicitud
            </h3>
            {[
              ['Solicitante', req.requester_name],
              ['Cabezas de ganado', req.head_count],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between text-sm">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-gray-900">{value}</span>
              </div>
            ))}
          </div>

          {/* Cost projection */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Proyección de costo
            </h3>

            {routeDistance == null ? (
              <p className="text-xs text-gray-400">
                Calculá o ingresá la distancia para ver el costo estimado.
              </p>
            ) : trucks.length === 0 ? (
              <p className="text-xs text-gray-400">No hay camiones activos disponibles.</p>
            ) : (
              <>
                <select
                  value={selectedTruckId}
                  onChange={e => setSelectedTruckId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">— Seleccioná un camión candidato —</option>
                  {trucks.map(t => (
                    <option key={t.id} value={String(t.id)}>
                      {t.plate} · cap. {t.capacity} · {Number(t.consumption_l_per_km).toFixed(3)} L/km
                    </option>
                  ))}
                </select>

                {projection && selectedTruck && fuelPrice != null && (
                  <div className="space-y-2 pt-2 border-t border-gray-100">
                    <Row label="Viajes requeridos">
                      <span className={projection.tripsRequired > 1 ? 'text-amber-600 font-semibold' : ''}>
                        {projection.tripsRequired}
                        {projection.tripsRequired > 1 && ' ⚠'}
                      </span>
                    </Row>
                    {projection.tripsRequired > 1 && (
                      <Row label="Costo por viaje">
                        {formatGs(projection.fuelCostPerTrip)}
                      </Row>
                    )}
                    <Row label="Costo total estimado" highlight>
                      {formatGs(projection.totalFuelCost)}
                    </Row>
                    <p className="text-xs text-gray-400 pt-1">
                      Precio combustible: {formatGs(fuelPrice)}/L
                    </p>
                    {projection.tripsRequired > 1 && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        {req.head_count} cabezas superan la capacidad de {selectedTruck.capacity} del camión
                        seleccionado — se necesitan <strong>{projection.tripsRequired} viajes</strong>.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
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
