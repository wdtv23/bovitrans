'use client'

import { useEffect, useState } from 'react'

interface FuelPriceSetting {
  key: string
  value: number
  updated_at: string
}

function formatGs(value: number) {
  return `Gs. ${Math.round(value).toLocaleString('es-PY')}`
}

export default function SettingsClient() {
  const [setting, setSetting]   = useState<FuelPriceSetting | null>(null)
  const [loading, setLoading]   = useState(true)
  const [fetchError, setFetchError] = useState('')

  const [input, setInput]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    fetch('/api/settings/fuel-price')
      .then(r => r.json())
      .then(data => {
        if (data.key) {
          setSetting(data)
          setInput(String(data.value))
        } else {
          setFetchError(data.error?.message ?? 'Error al cargar')
        }
      })
      .catch(() => setFetchError('Error de conexión'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')
    setSaved(false)

    const num = parseFloat(input)
    if (isNaN(num) || num <= 0) {
      setSaveError('El precio debe ser un número mayor a 0')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/settings/fuel-price', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: num }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error?.message ?? 'Error al guardar')
      } else {
        setSetting(data)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch {
      setSaveError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-1">Parámetros globales del sistema</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Precio de combustible</h2>
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <p className="text-sm text-gray-400">Cargando…</p>
          ) : fetchError ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{fetchError}</p>
          ) : (
            <>
              {/* Valor actual */}
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Valor actual</p>
                  <p className="text-2xl font-bold text-gray-900 mt-0.5">
                    {setting ? formatGs(setting.value) : '—'}<span className="text-sm font-normal text-gray-400 ml-1">/litro</span>
                  </p>
                </div>
                {setting && (
                  <p className="text-xs text-gray-400">
                    Actualizado el{' '}
                    {new Date(setting.updated_at).toLocaleString('es-PY', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                )}
              </div>

              {/* Nota sobre snapshot */}
              <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
                <span className="shrink-0 mt-0.5">ℹ</span>
                <span>
                  Cambiar el precio solo afecta a las <strong>nuevas asignaciones</strong>.
                  Los costos de asignaciones ya registradas quedan congelados con el valor vigente al momento de asignar.
                </span>
              </div>

              {/* Formulario */}
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nuevo precio (Gs./litro)
                  </label>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 select-none">Gs.</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={input}
                        onChange={e => { setInput(e.target.value); setSaveError(''); setSaved(false) }}
                        className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="7400"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium whitespace-nowrap"
                    >
                      {saving ? 'Guardando…' : 'Actualizar'}
                    </button>
                  </div>
                  {saveError && (
                    <p className="text-xs text-red-600 mt-2">{saveError}</p>
                  )}
                  {saved && (
                    <p className="text-xs text-green-600 mt-2">Precio actualizado correctamente.</p>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
