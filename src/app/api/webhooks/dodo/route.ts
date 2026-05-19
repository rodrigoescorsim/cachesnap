import { NextRequest, NextResponse } from 'next/server'
import { dodo, planFromProductId } from '@/lib/dodo'
import sql from '@/lib/db'

export async function POST(req: NextRequest) {
  const body = await req.text()

  console.log('[dodo-webhook] received', req.headers.get('webhook-id'))

  let event
  try {
    event = dodo.webhooks.unwrap(body, {
      headers: {
        'webhook-id': req.headers.get('webhook-id') ?? '',
        'webhook-signature': req.headers.get('webhook-signature') ?? '',
        'webhook-timestamp': req.headers.get('webhook-timestamp') ?? '',
      },
    })
  } catch (err) {
    console.error('[dodo-webhook] signature error', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  console.log('[dodo-webhook] event type:', event.type)

  switch (event.type) {
    case 'subscription.active': {
      const sub = event.data
      const userId = sub.metadata?.user_id
      const plan = planFromProductId(sub.product_id)
      console.log('[dodo-webhook] subscription.active — userId:', userId, 'product_id:', sub.product_id, 'plan:', plan)
      if (userId && plan) {
        await sql`
          UPDATE users
          SET plan = ${plan},
              dodo_customer_id = ${sub.customer.customer_id},
              dodo_subscription_id = ${sub.subscription_id}
          WHERE id = ${userId}
        `
        console.log('[dodo-webhook] user updated to plan:', plan)
      } else {
        console.warn('[dodo-webhook] missing userId or plan — skipping update')
      }
      break
    }

    case 'subscription.renewed':
      // Plan stays — no action needed
      break

    case 'subscription.cancelled':
    case 'subscription.expired':
    case 'subscription.failed': {
      const sub = event.data
      const userId = sub.metadata?.user_id
      if (userId) {
        await sql`
          UPDATE users
          SET plan = 'free', dodo_subscription_id = NULL
          WHERE id = ${userId}
        `
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
