import DodoPayments from 'dodopayments'

export const dodo = new DodoPayments({
  bearerToken: process.env.DODO_API_KEY!,
  environment: 'test_mode',
  webhookKey: process.env.DODO_WEBHOOK_SECRET!,
})

export const PRODUCT_IDS: Record<'pro' | 'team', string> = {
  pro: process.env.DODO_PRODUCT_ID_PRO!,
  team: process.env.DODO_PRODUCT_ID_TEAM!,
}

export function planFromProductId(productId: string): 'pro' | 'team' | null {
  if (productId === process.env.DODO_PRODUCT_ID_PRO) return 'pro'
  if (productId === process.env.DODO_PRODUCT_ID_TEAM) return 'team'
  return null
}
