'use client'

import { useState, useEffect, useCallback, FormEvent } from 'react'

type User = {
  id: number
  username: string
  role: 'admin' | 'operador'
  is_active: boolean
  created_at: string
}

type Feedback = { type: 'success' | 'error'; msg: string }

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function UsersClient() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setUsers(data.users)
    } catch {
      setFetchError('No se pudieron cargar los usuarios')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  function flash(type: Feedback['type'], msg: string) {
    setFeedback({ type, msg })
    setTimeout(() => setFeedback(null), 4000)
  }

  async function handleCreate(data: { username: string; password: string; role: string }) {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      setShowCreate(false)
      await fetchUsers()
      flash('success', 'Usuario creado correctamente')
      return null
    }
    const body = await res.json()
    return body.error?.message ?? 'Error al crear usuario'
  }

  async function handleEdit(id: number, data: { role?: string; password?: string }) {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      setEditTarget(null)
      await fetchUsers()
      flash('success', 'Usuario actualizado')
      return null
    }
    const body = await res.json()
    return body.error?.message ?? 'Error al actualizar usuario'
  }

  async function handleToggleStatus(user: User) {
    const res = await fetch(`/api/users/${user.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !user.is_active }),
    })
    const body = await res.json()
    if (res.ok) {
      await fetchUsers()
      flash('success', user.is_active ? 'Usuario desactivado' : 'Usuario activado')
    } else {
      flash('error', body.error?.message ?? 'Error al cambiar estado')
    }
  }

  async function handleDelete(user: User) {
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    if (res.status === 204 || res.ok) {
      await fetchUsers()
      flash('success', `Usuario @${user.username} eliminado`)
    } else {
      const body = await res.json()
      flash('error', body.error?.message ?? 'Error al eliminar usuario')
    }
  }

  const activeAdmins = users.filter((u) => u.role === 'admin' && u.is_active).length
  const activeOps   = users.filter((u) => u.role === 'operador' && u.is_active).length

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h1>
          <p className="text-sm text-gray-500 mt-0.5">Administrá el acceso al sistema</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Nuevo usuario
        </button>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            feedback.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total usuarios', value: users.length },
          { label: 'Admins activos', value: activeAdmins },
          { label: 'Operadores activos', value: activeOps },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Cargando usuarios…</div>
      ) : fetchError ? (
        <div className="text-center py-16 text-red-500 text-sm">{fetchError}</div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          Sin usuarios registrados. Creá el primero.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-gray-600">
                <th className="text-left px-4 py-3 font-medium">Usuario</th>
                <th className="text-left px-4 py-3 font-medium">Rol</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-right px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{user.username}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge active={user.is_active} />
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <ActionBtn onClick={() => setEditTarget(user)} color="blue">
                      Editar
                    </ActionBtn>
                    <ActionBtn
                      onClick={() => handleToggleStatus(user)}
                      color={user.is_active ? 'red' : 'green'}
                    >
                      {user.is_active ? 'Desactivar' : 'Activar'}
                    </ActionBtn>
                    <ActionBtn onClick={() => setDeleteTarget(user)} color="red">
                      Eliminar
                    </ActionBtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
      {editTarget && (
        <EditModal user={editTarget} onClose={() => setEditTarget(null)} onSave={handleEdit} />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          user={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal: Crear usuario
// ---------------------------------------------------------------------------

function CreateModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (d: { username: string; password: string; role: string }) => Promise<string | null>
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const err = await onCreate({
      username: fd.get('username') as string,
      password: fd.get('password') as string,
      role: fd.get('role') as string,
    })
    if (err) setError(err)
    setLoading(false)
  }

  return (
    <Modal title="Nuevo usuario" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Usuario">
          <input
            name="username"
            type="text"
            required minLength={3} maxLength={50}
            pattern="[a-zA-Z0-9_]+"
            title="Solo letras, números y guiones bajos"
            className={input}
            disabled={loading}
          />
        </Field>
        <Field label="Contraseña">
          <input name="password" type="password" required minLength={8} className={input} disabled={loading} />
        </Field>
        <Field label="Rol">
          <select name="role" defaultValue="operador" className={input} disabled={loading}>
            <option value="operador">Operador</option>
            <option value="admin">Administrador</option>
          </select>
        </Field>
        {error && <ErrorMsg msg={error} />}
        <ModalFooter onClose={onClose} loading={loading} submitLabel="Crear usuario" />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Modal: Editar usuario
// ---------------------------------------------------------------------------

function EditModal({
  user,
  onClose,
  onSave,
}: {
  user: User
  onClose: () => void
  onSave: (id: number, d: { role?: string; password?: string }) => Promise<string | null>
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const newRole = fd.get('role') as string
    const newPass = (fd.get('password') as string).trim()

    const data: { role?: string; password?: string } = {}
    if (newRole !== user.role) data.role = newRole
    if (newPass) data.password = newPass

    if (Object.keys(data).length === 0) {
      setError('Sin cambios para guardar')
      return
    }

    setLoading(true)
    const err = await onSave(user.id, data)
    if (err) setError(err)
    setLoading(false)
  }

  return (
    <Modal title="Editar usuario" onClose={onClose}>
      <p className="text-sm text-gray-500 -mt-2 mb-4">@{user.username}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Rol">
          <select name="role" defaultValue={user.role} className={input} disabled={loading}>
            <option value="operador">Operador</option>
            <option value="admin">Administrador</option>
          </select>
        </Field>
        <Field label="Nueva contraseña">
          <input
            name="password"
            type="password"
            minLength={8}
            placeholder="Dejar vacío para no cambiar"
            className={input}
            disabled={loading}
          />
        </Field>
        {error && <ErrorMsg msg={error} />}
        <ModalFooter onClose={onClose} loading={loading} submitLabel="Guardar" />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Modal: Confirmar eliminación
// ---------------------------------------------------------------------------

function ConfirmDeleteModal({
  user,
  onConfirm,
  onCancel,
}: {
  user: User
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
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Eliminar usuario</h2>
        <p className="text-sm text-gray-600 mb-1">
          ¿Confirmás la eliminación de{' '}
          <span className="font-semibold text-gray-900">@{user.username}</span>?
        </p>
        <p className="text-xs text-gray-400 mb-6">
          Esta acción es permanente e irreversible. Si el usuario tiene registros
          asociados, el sistema lo impedirá y podrás desactivarlo en su lugar.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
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
// Componentes pequeños reutilizables dentro del archivo
// ---------------------------------------------------------------------------

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function ModalFooter({
  onClose,
  loading,
  submitLabel,
}: {
  onClose: () => void
  loading: boolean
  submitLabel: string
}) {
  return (
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
        {loading ? 'Guardando…' : submitLabel}
      </button>
    </div>
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

function RoleBadge({ role }: { role: User['role'] }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
      }`}
    >
      {role}
    </span>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {active ? 'Activo' : 'Inactivo'}
    </span>
  )
}

function ActionBtn({
  onClick,
  color,
  children,
}: {
  onClick: () => void
  color: 'blue' | 'red' | 'green'
  children: React.ReactNode
}) {
  const colors = {
    blue:  'text-gray-500 hover:text-blue-600 hover:bg-blue-50',
    red:   'text-gray-500 hover:text-red-600 hover:bg-red-50',
    green: 'text-gray-500 hover:text-green-600 hover:bg-green-50',
  }
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded transition-colors ${colors[color]}`}
    >
      {children}
    </button>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
      {msg}
    </p>
  )
}

const input =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400'
