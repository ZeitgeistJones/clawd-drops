export default function Terms() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#fff',
      fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '80px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.2em', color: '#ff3c3c', fontWeight: 700, marginBottom: 16 }}>▲ CLAWD DROPS</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 40px 0', letterSpacing: '-0.02em' }}>Terms of Use</h1>
        <div style={{ fontSize: 14, color: '#666', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p>By using this tool you agree to the following:</p>
          <p>You are responsible for any content you generate and any media you use as input, including music.</p>
          <p>Clawd Drops processes but does not permanently store third-party audio or video.</p>
          <p>AI-generated video output is yours. Music rights remain with their respective owners.</p>
          <p>This tool is provided as-is with no guarantees. Use at your own risk.</p>
          <p style={{ color: '#444', fontSize: 12 }}>Built by Zeitgeist for the CLAWD community.</p>
        </div>
        <a href="/" style={{ display: 'inline-block', marginTop: 40, fontSize: 11, color: '#333', letterSpacing: '0.1em', textDecoration: 'none' }}>← BACK</a>
      </div>
    </div>
  )
}
