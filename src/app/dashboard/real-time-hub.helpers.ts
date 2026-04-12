/**
 * Returns true when the incoming SSE monitor_id should trigger a page refresh.
 *
 * - No watchId (dashboard overview): every update qualifies.
 * - watchId set (monitor detail): only the matching monitor triggers a refresh,
 *   silencing the ~7 concurrent region probes from unrelated monitors.
 */
export function shouldRefresh(incomingId: string, watchId?: string): boolean {
  try {
    const data = JSON.parse(incomingId)
    const monitorId = data.m
    if (!watchId) return true
    return monitorId === watchId
  } catch (e) {
    // Fallback para caso chegue o ID puro (legado ou simplificado)
    if (!watchId) return true
    return incomingId === watchId
  }
}
