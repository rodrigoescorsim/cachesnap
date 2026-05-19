import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { dodo } from '@/lib/dodo'
import sql from '@/lib/db'

export async function POST() {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [row] = await sql<[{ dodo_customer_id: string | null }]>`
    SELECT dodo_customer_id FROM users WHERE id = ${user.id}
  `
  if (!row?.dodo_customer_id) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 404 })
  }

  const portal = await dodo.customers.customerPortal.create(row.dodo_customer_id, {
    return_url: `${process.env.APP_URL}/dashboard/billing`,
  })

  return NextResponse.json({ url: portal.link })
}
