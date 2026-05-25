import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { dodo, PRODUCT_IDS } from '@/lib/dodo'
import sql from '@/lib/db'

const PLAN_ORDER: Record<string, number> = { free: 0, pro: 1, team: 2 }

export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan } = await req.json() as { plan: 'pro' | 'team' }
  if (plan !== 'pro' && plan !== 'team') {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const [row] = await sql<[{ dodo_subscription_id: string | null; plan: string }]>`
    SELECT dodo_subscription_id, plan FROM users WHERE id = ${user.id}
  `

  if (row?.dodo_subscription_id) {
    if (row.plan === plan) {
      return NextResponse.json({ error: 'Already on this plan' }, { status: 409 })
    }

    // Upgrade or downgrade: change the existing subscription plan
    const isUpgrade = (PLAN_ORDER[plan] ?? 0) > (PLAN_ORDER[row.plan] ?? 0)
    await dodo.subscriptions.changePlan(row.dodo_subscription_id, {
      product_id: PRODUCT_IDS[plan],
      proration_billing_mode: isUpgrade ? 'prorated_immediately' : 'do_not_bill',
      quantity: 1,
    })

    await sql`UPDATE users SET plan = ${plan} WHERE id = ${user.id}`

    const appUrl = process.env.APP_URL ?? ''
    return NextResponse.json({ url: `${appUrl}/dashboard/billing?plan_changed=1` })
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
