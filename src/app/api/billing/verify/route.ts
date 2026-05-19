import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { dodo, planFromProductId } from '@/lib/dodo'
import sql from '@/lib/db'

export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { subscription_id } = await req.json() as { subscription_id: string }
  if (!subscription_id) return NextResponse.json({ error: 'Missing subscription_id' }, { status: 400 })

  const sub = await dodo.subscriptions.retrieve(subscription_id)

  if (sub.status !== 'active') {
    return NextResponse.json({ error: 'Subscription not active' }, { status: 400 })
  }

  const plan = planFromProductId(sub.product_id)
  if (!plan) {
    return NextResponse.json({ error: 'Unknown product' }, { status: 400 })
  }

  await sql`
    UPDATE users
    SET plan = ${plan},
        dodo_customer_id = ${sub.customer.customer_id},
        dodo_subscription_id = ${sub.subscription_id}
    WHERE id = ${user.id}
  `

  return NextResponse.json({ plan })
}
