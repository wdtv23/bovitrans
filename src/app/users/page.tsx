import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import NavBar from '@/app/components/NavBar'
import UsersClient from './UsersClient'

export default async function UsersPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'admin') redirect('/')

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <UsersClient />
    </div>
  )
}
