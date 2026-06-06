'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'

const RequestMapModal = dynamic(() => import('./RequestMapModal'), { ssr: false })
import AssignModal from './AssignModal'

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
  created_at: string
  created_by_username: string
}

type StatusFilter = 'all' | 'pending' | 'assigned' | 'completed' | 'cancelled'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  assigned: 'Asignada',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-800',
  assigned:  'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-500',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ── Create Modal ──────────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void
  onCreated: () => void
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [form, setForm] = useState({
    requester_name: '',
    head_count: '',
    origin_label: '',
    origin_lat: '',
    origin_lng: '',
    dest_label: '',
    dest_lat: '',
    dest_lng: '',
  })
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setLoading(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester_name: form.requester_name,
          head_count: parseInt(form.head_count, 10),
          origin_label: form.origin_label,
          origin_lat: parseFloat(form.origin_lat),
          origin_lng: parseFloat(form.origin_lng),
          dest_label: form.dest_label,
          dest_lat: parseFloat(form.dest_lat),
          dest_lng: parseFloat(form.dest_lng),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error?.fields) setFieldErrors(data.error.fields)
        setError(data.error?.message ?? 'Error al crear solicitud')
      } else {
        onCreated()
        onClose()
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  function fe(field: string) {
    return fieldErrors[field]?.[0]
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Nueva solicitud</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && !Object.keys(fieldErrors).length && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Solicitante</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={form.requester_name}
              onChange={e => set('requester_name', e.target.value)}
              placeholder="Nombre del solicitante"
              required
            />
            {fe('requester_name') && <p className="text-xs text-red-600 mt-1">{fe('requester_name')}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cabezas de ganado</label>
            <input
              type="number" min="1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={form.head_count}
              onChange={e => set('head_count', e.target.value)}
              placeholder="Ej: 50"
              required
            />
            {fe('head_count') && <p className="text-xs text-red-600 mt-1">{fe('head_count')}</p>}
          </div>

          {/* Origen */}
          <fieldset className="border border-gray-200 rounded-lg p-4 space-y-3">
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Origen</legend>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Localidad / Referencia</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={form.origin_label}
                onChange={e => set('origin_label', e.target.value)}
                placeholder="Ej: Estancia Los Pinos, Concepción"
                required
              />
              {fe('origin_label') && <p className="text-xs text-red-600 mt-1">{fe('origin_label')}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Latitud</label>
                <input
                  type="number" step="any"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={form.origin_lat}
                  onChange={e => set('origin_lat', e.target.value)}
                  placeholder="-23.4"
                  required
                />
                {fe('origin_lat') && <p className="text-xs text-red-600 mt-1">{fe('origin_lat')}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Longitud</label>
                <input
                  type="number" step="any"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={form.origin_lng}
                  onChange={e => set('origin_lng', e.target.value)}
                  placeholder="-57.4"
                  required
                />
                {fe('origin_lng') && <p className="text-xs text-red-600 mt-1">{fe('origin_lng')}</p>}
              </div>
            </div>
          </fieldset>

          {/* Destino */}
          <fieldset className="border border-gray-200 rounded-lg p-4 space-y-3">
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Destino</legend>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Localidad / Referencia</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={form.dest_label}
                onChange={e => set('dest_label', e.target.value)}
                placeholder="Ej: Frigorífico Central, Asunción"
                required
              />
              {fe('dest_label') && <p className="text-xs text-red-600 mt-1">{fe('dest_label')}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Latitud</label>
                <input
                  type="number" step="any"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={form.dest_lat}
                  onChange={e => set('dest_lat', e.target.value)}
                  placeholder="-25.3"
                  required
                />
                {fe('dest_lat') && <p className="text-xs text-red-600 mt-1">{fe('dest_lat')}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Longitud</label>
                <input
                  type="number" step="any"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={form.dest_lng}
                  onChange={e => set('dest_lng', e.target.value)}
                  placeholder="-57.6"
                  required
                />
                {fe('dest_lng') && <p className="text-xs text-red-600 mt-1">{fe('dest_lng')}</p>}
              </div>
            </div>
          </fieldset>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
            >
              {loading ? 'Guardando…' : 'Crear solicitud'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  req: TransportRequest
  onClose: () => void
  onUpdated: () => void
}

function EditModal({ req, onClose, onUpdated }: EditModalProps) {
  const [form, setForm] = useState({
    requester_name: req.requester_name,
    head_count:     String(req.head_count),
    origin_label:   req.origin_label,
    origin_lat:     req.origin_lat,
    origin_lng:     req.origin_lng,
    dest_label:     req.dest_label,
    dest_lat:       req.dest_lat,
    dest_lng:       req.dest_lng,
  })
  const [error, setError]             = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [loading, setLoading]         = useState(false)

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    setLoading(true)
    try {
      const res = await fetch(`/api/requests/${req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester_name: form.requester_name,
          head_count:     parseInt(form.head_count, 10),
          origin_label:   form.origin_label,
          origin_lat:     parseFloat(form.origin_lat),
          origin_lng:     parseFloat(form.origin_lng),
          dest_label:     form.dest_label,
          dest_lat:       parseFloat(form.dest_lat),
          dest_lng:       parseFloat(form.dest_lng),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error?.fields) setFieldErrors(data.error.fields)
        setError(data.error?.message ?? 'Error al guardar')
      } else {
        onUpdated()
        onClose()
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  function fe(field: string) {
    return fieldErrors[field]?.[0]
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">Editar solicitud #{req.id}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && !Object.keys(fieldErrors).length && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Solicitante</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={form.requester_name}
              onChange={e => set('requester_name', e.target.value)}
              required
            />
            {fe('requester_name') && <p className="text-xs text-red-600 mt-1">{fe('requester_name')}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cabezas de ganado</label>
            <input
              type="number" min="1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={form.head_count}
              onChange={e => set('head_count', e.target.value)}
              required
            />
            {fe('head_count') && <p className="text-xs text-red-600 mt-1">{fe('head_count')}</p>}
          </div>

          <fieldset className="border border-gray-200 rounded-lg p-4 space-y-3">
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Origen</legend>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Localidad / Referencia</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={form.origin_label}
                onChange={e => set('origin_label', e.target.value)}
                required
              />
              {fe('origin_label') && <p className="text-xs text-red-600 mt-1">{fe('origin_label')}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Latitud</label>
                <input
                  type="number" step="any"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={form.origin_lat}
                  onChange={e => set('origin_lat', e.target.value)}
                  required
                />
                {fe('origin_lat') && <p className="text-xs text-red-600 mt-1">{fe('origin_lat')}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Longitud</label>
                <input
                  type="number" step="any"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={form.origin_lng}
                  onChange={e => set('origin_lng', e.target.value)}
                  required
                />
                {fe('origin_lng') && <p className="text-xs text-red-600 mt-1">{fe('origin_lng')}</p>}
              </div>
            </div>
          </fieldset>

          <fieldset className="border border-gray-200 rounded-lg p-4 space-y-3">
            <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Destino</legend>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Localidad / Referencia</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={form.dest_label}
                onChange={e => set('dest_label', e.target.value)}
                required
              />
              {fe('dest_label') && <p className="text-xs text-red-600 mt-1">{fe('dest_label')}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Latitud</label>
                <input
                  type="number" step="any"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={form.dest_lat}
                  onChange={e => set('dest_lat', e.target.value)}
                  required
                />
                {fe('dest_lat') && <p className="text-xs text-red-600 mt-1">{fe('dest_lat')}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Longitud</label>
                <input
                  type="number" step="any"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={form.dest_lng}
                  onChange={e => set('dest_lng', e.target.value)}
                  required
                />
                {fe('dest_lng') && <p className="text-xs text-red-600 mt-1">{fe('dest_lng')}</p>}
              </div>
            </div>
          </fieldset>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
            >
              {loading ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Confirm Status Modal ──────────────────────────────────────────────────────

interface ConfirmStatusModalProps {
  requestId: number
  requesterName: string
  action: 'completed' | 'cancelled'
  onClose: () => void
  onUpdated: () => void
}

function ConfirmStatusModal({ requestId, requesterName, action, onClose, onUpdated }: ConfirmStatusModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/requests/${requestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error?.message ?? 'Error al actualizar estado')
      } else {
        onUpdated()
        onClose()
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const isCancel = action === 'cancelled'
  const actionLabel = isCancel ? 'Cancelar solicitud' : 'Marcar como completada'
  const actionColor = isCancel
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-green-600 hover:bg-green-700'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{actionLabel}</h2>
          <p className="text-sm text-gray-600 mb-4">
            {isCancel
              ? `¿Confirmar cancelación de la solicitud de "${requesterName}"? Esta acción no se puede deshacer.`
              : `¿Marcar la solicitud de "${requesterName}" como completada?`}
          </p>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Volver
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className={`flex-1 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 transition-colors font-medium ${actionColor}`}
            >
              {loading ? 'Procesando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Request Card ──────────────────────────────────────────────────────────────

interface RequestCardProps {
  req: TransportRequest
  onRefresh: () => void
  onViewMap: () => void
  onAssign: () => void
}

function RequestCard({ req, onRefresh, onViewMap, onAssign }: RequestCardProps) {
  const [modal, setModal] = useState<'edit' | 'cancel' | 'complete' | null>(null)

  const canEdit     = req.status === 'pending'
  const canAssign   = req.status === 'pending'
  const canCancel   = req.status === 'pending' || req.status === 'assigned'
  const canComplete = req.status === 'assigned'

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-gray-900">{req.requester_name}</p>
            <p className="text-xs text-gray-400 mt-0.5">#{req.id} · por {req.created_by_username}</p>
          </div>
          <StatusBadge status={req.status} />
        </div>

        {/* Route — clickable shortcut to map */}
        <button
          onClick={onViewMap}
          className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 text-left transition-colors"
          title="Ver ruta en el mapa"
        >
          <span className="truncate">{req.origin_label}</span>
          <span className="text-gray-300 shrink-0">→</span>
          <span className="truncate">{req.dest_label}</span>
        </button>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>🐄 <strong className="text-gray-700">{req.head_count}</strong> cabezas</span>
          {req.distance_km != null
            ? <span>📍 <strong className="text-gray-700">{Number(req.distance_km).toFixed(1)} km</strong></span>
            : <span className="text-gray-300">Sin distancia</span>
          }
          <span className="ml-auto">{new Date(req.created_at).toLocaleDateString('es-PY')}</span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
          <button
            onClick={onViewMap}
            className="px-3 py-1.5 text-xs bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors font-medium"
          >
            Ver ruta
          </button>
          {canAssign && (
            <button
              onClick={onAssign}
              title={!req.distance_km ? 'Calculá la distancia primero en "Ver ruta"' : undefined}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors font-medium ${
                req.distance_km
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-blue-100 text-blue-400 cursor-help'
              }`}
            >
              Asignar
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => setModal('edit')}
              className="px-3 py-1.5 text-xs bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Editar
            </button>
          )}
          {canComplete && (
            <button
              onClick={() => setModal('complete')}
              className="flex-1 px-3 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors font-medium"
            >
              Completar
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => setModal('cancel')}
              className="flex-1 px-3 py-1.5 text-xs bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors font-medium"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {modal === 'edit' && (
        <EditModal
          req={req}
          onClose={() => setModal(null)}
          onUpdated={onRefresh}
        />
      )}
      {modal === 'cancel' && (
        <ConfirmStatusModal
          requestId={req.id}
          requesterName={req.requester_name}
          action="cancelled"
          onClose={() => setModal(null)}
          onUpdated={onRefresh}
        />
      )}
      {modal === 'complete' && (
        <ConfirmStatusModal
          requestId={req.id}
          requesterName={req.requester_name}
          action="completed"
          onClose={() => setModal(null)}
          onUpdated={onRefresh}
        />
      )}
    </>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

const TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all',       label: 'Todas' },
  { key: 'pending',   label: 'Pendientes' },
  { key: 'assigned',  label: 'Asignadas' },
  { key: 'completed', label: 'Completadas' },
  { key: 'cancelled', label: 'Canceladas' },
]

export default function RequestsClient() {
  const [requests, setRequests]   = useState<TransportRequest[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [filter, setFilter]       = useState<StatusFilter>('all')
  const [showCreate, setShowCreate]   = useState(false)
  const [mapRequest,    setMapRequest]    = useState<TransportRequest | null>(null)
  const [assignRequest, setAssignRequest] = useState<TransportRequest | null>(null)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const url = filter === 'all' ? '/api/requests' : `/api/requests?status=${filter}`
      const res  = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message ?? 'Error')
      setRequests(data.requests)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  // KPIs
  const all       = requests
  const pending   = all.filter(r => r.status === 'pending').length
  const assigned  = all.filter(r => r.status === 'assigned').length
  const completed = all.filter(r => r.status === 'completed').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solicitudes de transporte</h1>
          <p className="text-sm text-gray-500 mt-1">Gestioná las solicitudes de traslado de ganado</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          + Nueva solicitud
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total',      value: all.length,  color: 'text-gray-900' },
          { label: 'Pendientes', value: pending,      color: 'text-yellow-600' },
          { label: 'Asignadas',  value: assigned,     color: 'text-blue-600' },
          { label: 'Completadas',value: completed,    color: 'text-green-600' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-gray-500 mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors font-medium ${
              filter === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16 text-gray-400 text-sm">Cargando solicitudes…</div>
      ) : error ? (
        <div className="bg-red-50 text-red-700 text-sm rounded-xl p-4 flex items-center gap-2">
          <span>⚠</span> {error}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium text-gray-600">Sin solicitudes</p>
          <p className="text-sm mt-1">
            {filter === 'all'
              ? 'Creá la primera solicitud de transporte.'
              : `No hay solicitudes en estado "${STATUS_LABELS[filter]}".`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {requests.map(req => (
            <RequestCard
              key={req.id}
              req={req}
              onRefresh={fetchRequests}
              onViewMap={() => setMapRequest(req)}
              onAssign={() => setAssignRequest(req)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={fetchRequests}
        />
      )}

      {assignRequest && (
        <AssignModal
          req={assignRequest}
          onClose={() => setAssignRequest(null)}
          onAssigned={() => { setAssignRequest(null); fetchRequests() }}
        />
      )}

      {mapRequest && (
        <RequestMapModal
          req={mapRequest}
          onClose={() => setMapRequest(null)}
          onDistanceSaved={(km) => {
            // Update distance_km in local state so card reflects new value immediately
            setRequests(prev =>
              prev.map(r => r.id === mapRequest.id ? { ...r, distance_km: String(km) } : r)
            )
            setMapRequest(prev => prev ? { ...prev, distance_km: String(km) } : null)
          }}
        />
      )}
    </div>
  )
}
