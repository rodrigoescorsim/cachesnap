'use server'

import sql from '@/lib/db'

export async function clearMonitorAlerts(monitorId: string) {
  try {
    await sql`DELETE FROM alerts WHERE monitor_id = ${monitorId}`
    await sql`DELETE FROM alert_incidents WHERE monitor_id = ${monitorId}`
    return { success: true }
  } catch (error) {
    console.error('Failed to clear alerts:', error)
    return { success: false, error: 'Failed to clear alerts' }
  }
}
