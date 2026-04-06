import { describe, it, expect } from 'vitest'
import { parseServerTiming } from './server-timing'

describe('parseServerTiming', () => {
  it('retorna null para header ausente', () => {
    expect(parseServerTiming(null)).toEqual({ edge_ms: null, origin_ms: null })
    expect(parseServerTiming('')).toEqual({ edge_ms: null, origin_ms: null })
  })

  it('parseia formato Vercel: edge + origin', () => {
    expect(parseServerTiming('edge;dur=1, origin;dur=234')).toEqual({ edge_ms: 1, origin_ms: 234 })
  })

  it('parseia formato Fastly: hits + origin', () => {
    expect(parseServerTiming('hits;dur=0, miss, origin;dur=560')).toEqual({ edge_ms: 0, origin_ms: 560 })
  })

  it('parseia apenas origin quando edge ausente (Railway/Nginx)', () => {
    expect(parseServerTiming('app;dur=48')).toEqual({ edge_ms: null, origin_ms: 48 })
    expect(parseServerTiming('upstream;dur=320')).toEqual({ edge_ms: null, origin_ms: 320 })
  })

  it('parseia cdn-cache como edge', () => {
    expect(parseServerTiming('cdn-cache;dur=12, origin;dur=480')).toEqual({ edge_ms: 12, origin_ms: 480 })
  })

  it('arredonda para 2 casas decimais', () => {
    const result = parseServerTiming('edge;dur=1.567, origin;dur=234.999')
    expect(result.edge_ms).toBe(1.57)
    expect(result.origin_ms).toBe(235)
  })

  it('ignora entradas sem dur', () => {
    expect(parseServerTiming('miss, origin;dur=400')).toEqual({ edge_ms: null, origin_ms: 400 })
  })

  it('usa primeira ocorrência por categoria', () => {
    // Se houver dois campos de edge, usa o primeiro encontrado
    const result = parseServerTiming('edge;dur=10, cdn;dur=20, origin;dur=300')
    expect(result.edge_ms).toBe(10)
    expect(result.origin_ms).toBe(300)
  })
})
