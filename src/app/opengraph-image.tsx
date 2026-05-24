import { ImageResponse } from 'next/og'

export const alt = 'CacheSnap — Edge Performance Monitoring'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Satori does not support SVG filters (feGaussianBlur etc.) — filter-free icon
const ICON_SVG = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(40,40)">
    <polygon points="0,-32.75 28.37,-16.38 28.37,16.38 0,32.75 -28.37,16.38 -28.37,-16.38"
      fill="none" stroke="#22FF88" stroke-width="1.9" stroke-linejoin="round"/>
    <polygon points="0,-17.52 17.52,-8.76 0,0 -17.52,-8.76"
      fill="rgba(34,255,136,0.18)" stroke="#22FF88" stroke-width="1.1" stroke-linejoin="round"/>
    <polygon points="17.52,-8.76 17.52,8.76 0,17.52 0,0"
      fill="rgba(34,255,136,0.09)" stroke="#22FF88" stroke-width="1.1" stroke-linejoin="round"/>
    <polygon points="-17.52,-8.76 0,0 0,17.52 -17.52,8.76"
      fill="rgba(34,255,136,0.24)" stroke="#22FF88" stroke-width="1.1" stroke-linejoin="round"/>
  </g>
</svg>`

const iconSrc = `data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString('base64')}`

export default async function Image() {
  // Load Inter ExtraBold for crisp typography — fallback to system sans-serif
  let fontData: ArrayBuffer | undefined
  try {
    const css = await fetch(
      'https://fonts.googleapis.com/css2?family=Inter:wght@800&display=swap',
      {
        // Old UA forces Google Fonts to return TTF — Satori does not support woff2
        headers: { 'User-Agent': 'Mozilla/4.0' },
      },
    ).then((r) => r.text())
    const fontUrl = css.match(/src: url\((.+?)\) format\('truetype'\)/)?.[1]
    if (fontUrl) fontData = await fetch(fontUrl).then((r) => r.arrayBuffer())
  } catch {
    // renders with system sans-serif
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a1026',
          fontFamily: fontData ? 'Inter' : '"Helvetica Neue", Helvetica, Arial, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* subtle grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />

        {/* green radial glow — top center */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 1000,
            height: 560,
            borderRadius: '50%',
            background:
              'radial-gradient(ellipse at center, rgba(34,255,136,0.11) 0%, rgba(34,255,136,0.04) 40%, transparent 70%)',
          }}
        />

        {/* bottom-right blue accent */}
        <div
          style={{
            position: 'absolute',
            bottom: -80,
            right: -80,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background:
              'radial-gradient(ellipse at center, rgba(56,189,248,0.07) 0%, transparent 65%)',
          }}
        />

        {/* hexagon icon — filter-free, larger */}
        <img src={iconSrc} width={112} height={112} style={{ marginBottom: 22 }} />

        {/* wordmark — cache white + snap green, matches logo.svg */}
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 18 }}>
          <span
            style={{
              fontSize: 88,
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-3px',
              lineHeight: 1,
            }}
          >
            cache
          </span>
          <span
            style={{
              fontSize: 88,
              fontWeight: 800,
              color: '#22FF88',
              letterSpacing: '-3px',
              lineHeight: 1,
            }}
          >
            snap
          </span>
        </div>

        {/* tagline */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: 660,
            marginBottom: 36,
            gap: '0 6px',
          }}
        >
          <span style={{ fontSize: 26, color: '#94a3b8', lineHeight: 1.5 }}>
            Deep visibility into your edge stack —
          </span>
          <span style={{ fontSize: 26, color: '#cbd5e1', lineHeight: 1.5 }}>
            zero code, zero configuration.
          </span>
        </div>

        {/* feature badges */}
        <div style={{ display: 'flex', gap: 12 }}>
          {['CDN Cache Auditing', 'Global Regions', 'Edge vs Origin', 'Intelligent Alerts', 'Zero Setup'].map(
            (badge) => (
              <div
                key={badge}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  border: '1px solid rgba(34,255,136,0.22)',
                  borderRadius: 999,
                  padding: '8px 20px',
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#22FF88',
                  backgroundColor: 'rgba(34,255,136,0.06)',
                  letterSpacing: '0.01em',
                }}
              >
                {badge}
              </div>
            ),
          )}
        </div>

        {/* domain */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 34,
            fontSize: 17,
            color: '#2d3f52',
            letterSpacing: '0.08em',
            fontWeight: 500,
          }}
        >
          cachesnap.com
        </div>
      </div>
    ),
    {
      ...size,
      ...(fontData
        ? { fonts: [{ name: 'Inter', data: fontData, style: 'normal' as const, weight: 800 }] }
        : {}),
    },
  )
}
