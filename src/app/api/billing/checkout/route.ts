import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { dodo, PRODUCT_IDS } from '@/lib/dodo'
import sql from '@/lib/db'

export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan } = await req.json() as { plan: 'pro' | 'team' }
  if (plan !== 'pro' && plan !== 'team') {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const [row] = await sql<[{ dodo_subscription_id: string | null }]>`
    SELECT dodo_subscription_id FROM users WHERE id = ${user.id}
  `
  if (row?.dodo_subscription_id) {
    return NextResponse.json({ error: 'Already subscribed' }, { status: 409 })
  }

  const session = await dodo.checkoutSessions.create({
    product_cart: [{ product_id: PRODUCT_IDS[plan], quantity: 1 }],
    customer: { email: user.email },
    return_url: `${process.env.APP_URL}/dashboard/billing?success=1`,
    cancel_url: `${process.env.APP_URL}/dashboard/billing`,
    metadata: { user_id: user.id },
  })

  return NextResponse.json({ url: session.checkout_url })
}
