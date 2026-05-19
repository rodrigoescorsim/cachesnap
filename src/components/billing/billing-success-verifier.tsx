'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function BillingSuccessVerifier({ subscriptionId }: { subscriptionId: string }) {
  const router = useRouter()

  useEffect(() => {
    fetch('/api/billing/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription_id: subscriptionId }),
    }).then(() => {
      router.replace('/dashboard/billing')
    })
  }, [subscriptionId, router])

  return null
}
