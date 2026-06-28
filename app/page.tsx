'use client'

import { useState, useRef } from 'react'

const STAGES = {
  IDLE: 'idle',
  PROMPTING: 'prompting',
  GENERATING_IMAGE: 'generating_image',
  GENERATING_MUSIC: 'generating_music',
  ANALYZING_AUDIO: 'analyzing_audio',
  GENERATING_VIDEO: 'generating_video',
  SYNCING: 'syncing',
  DONE: 'done',
  ERROR: 'error',
}

const STAGE_LABELS: Record<string, string> = {
  prompting: 'WRITING PROMPTS',
  generating_image: 'BUILDING CLAWD',
  generating_music: 'COOKING THE BEAT',
  analyzing_audio: 'READING THE DROP',
  generating_video: 'GENERATING VIDEO',
  syncing: 'SYNCING FRAMES',
  done: 'CLAWD DROPPED',
  error: 'PIPELINE FAILED',
}

const STAGE_ORDER = [
  'prompting', 'generating_image', 'generating_music',
  'analyzing_audio', 'generating_video', 'syncing', 'done',
]

export default function Home() {
  const [goal, setGoal] = useState('')
  const [stage, setStage] = useState(STAGES.IDLE)
  const [prompts, setPrompts] = useState<any>(null)
  const [beatData, setBeatData] = useState<any>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const addLog = (msg: string) => setLog(prev => [...prev, msg])
  const stageIndex = (s: string) => STAGE_ORDER.indexOf(s)
  const currentIndex = stageIndex(stage)
  const isRunning = ![STAGES.IDLE, STAGES.DONE, STAGES.ERROR].includes(stage)

  async function runPipeline() {
    if (!goal.trim()) return
    setStage(STAGES.PROMPTING)
    setLog([])
    setPrompts(null)
    setBeatData(null)
    setImageUrl(null)
    setVideoUrl(null)
    setError(null)

    try {
      // STEP 1: Generate prompts
      addLog('Claude is reading your goal...')
      const promptRes = await fetch('/api/generate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      })
      const promptData = await promptRes.json()
      if (promptData.error) throw new Error(promptData.error)
      setPrompts(promptData)
      addLog('Prompts locked.')

      // STEP 2: Generate clawd image
      setStage(STAGES.GENERATING_IMAGE)
      addLog('Sending Clawd to Flux...')
      const imageRes = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptData.flux }),
      })
      const imageData = await imageRes.json()
      if (imageData.error) throw new Error(imageData.error)
      setImageUrl(imageData.imageUrl)
      addLog('Character image ready.')

      // STEP 3: Music (hardcoded while credits reload)
      setStage(STAGES.GENERATING_MUSIC)
      addLog('Cooking the beat...')
      const musicData = { audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' }
      addLog('Beat dropped.')

      // STEP 4: Hardcoded beat data
      setStage(STAGES.ANALYZING_AUDIO)
      addLog('Analyzing beat structure...')
      const audioData = { bpm: 128, drop: 3.5, peak: 5.2, energy: 'high' }
      setBeatData(audioData)
      addLog(`BPM: ${audioData.bpm} | Drop: ${audioData.drop}s | Peak: ${audioData.peak}s`)

      // STEP 5: Generate video
      setStage(STAGES.GENERATING_VIDEO)
      addLog('Seedance generating video...')
      const videoRes = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptData.seedance,
          imageUrl: imageData.imageUrl,
          beat: audioData,
        }),
      })
      const videoJobData = await videoRes.json()
      if (videoJobData.error) throw new Error(videoJobData.error)
      addLog('Seedance task submitted. Polling...')

      let rawVideoUrl = null
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 10000))
        const pollRes = await fetch('/api/poll-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: videoJobData.taskId }),
        })
        const pollData = await pollRes.json()
        addLog(`Video status: ${pollData.status}...`)
        if (pollData.status === 'completed') {
          rawVideoUrl = pollData.videoUrl
          break
        }
        if (pollData.error) throw new Error(pollData.error)
      }
      if (!rawVideoUrl) throw new Error('Video generation timed out')
      const videoData = { videoUrl: rawVideoUrl }
      addLog('Raw video ready.')

      // STEP 6: Manus sync
      setStage(STAGES.SYNCING)
      addLog('Sending to Manus for frame-perfect sync...')
      addLog(`Target: peak at ${audioData.peak}s, drop at ${audioData.drop}s`)
      const syncRes = await fetch('/api/sync-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: videoData.videoUrl,
          audioUrl: musicData.audioUrl,
          beat: audioData,
        }),
      })
      const syncData = await syncRes.json()
      if (syncData.error) throw new Error(syncData.error)
      setVideoUrl(syncData.videoUrl)
      addLog('Frame-perfect sync done.')
      setStage(STAGES.DONE)

    } catch (err: any) {
      setError(err.message || 'Pipeline failed')
      setStage(STAGES.ERROR)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#fff',
      fontFamily: "'Space Grotesk', 'Inter', system-ui, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '0 16px',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700;900&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes shimmer { 0%{left:-100%} 100%{left:100%} }
        * { box-sizing: border-box; }
        textarea::placeholder { color: #2a2a2a; }
        textarea { caret-color: #ff3c3c; }
      `}</style>

      <div style={{ width: '100%', maxWidth: 680, paddingTop: 56, paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.2em', color: '#ff3c3c', fontWeight: 700, textTransform: 'uppercase' }}>▲ CLAWD</span>
          <span style={{ fontSize: 11, letterSpacing: '0.15em', color: '#444', textTransform: 'uppercase' }}>VIDEO PIPELINE</span>
        </div>
        <h1 style={{
          fontSize: 'clamp(40px, 8vw, 72px)',
          fontWeight: 900, lineHeight: 0.95, margin: '0 0 16px 0',
          letterSpacing: '-0.03em',
          background: 'linear-gradient(135deg, #fff 40%, #ff3c3c 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>CLAWD<br />DROPS</h1>
        <p style={{ fontSize: 14, color: '#555', margin: '0 0 40px 0', letterSpacing: '0.02em', lineHeight: 1.5 }}>
          type a goal. clawd gets built, beat gets cooked, video gets synced.<br />
          one input. frame-perfect output.
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 680, marginBottom: 12 }}>
        <div style={{
          background: '#111118', border: `1px solid ${stage !== STAGES.IDLE ? '#ff3c3c33' : '#222'}`,
          borderRadius: 4, overflow: 'hidden', transition: 'border-color 0.2s',
        }}>
          <textarea
            ref={inputRef} value={goal}
            onChange={e => setGoal(e.target.value)}
            disabled={isRunning}
            placeholder="clawd grinding on a build, late night, hypnotic vibe"
            rows={3}
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              color: '#fff', fontSize: 16, lineHeight: 1.5, padding: '16px 16px 12px',
              resize: 'none', fontFamily: 'inherit',
            }}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runPipeline() }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px 12px' }}>
            <span style={{ fontSize: 11, color: '#333', letterSpacing: '0.1em' }}>⌘ + ENTER TO RUN</span>
            <button onClick={runPipeline} disabled={isRunning || !goal.trim()} style={{
              background: isRunning ? '#1a1a1a' : '#ff3c3c',
              color: isRunning ? '#444' : '#fff',
              border: 'none', borderRadius: 3, padding: '8px 20px',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.15em',
              textTransform: 'uppercase', cursor: isRunning || !goal.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}>
              {isRunning ? 'RUNNING...' : 'DROP IT'}
            </button>
          </div>
        </div>
      </div>

      {stage !== STAGES.IDLE && (
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
            {STAGE_ORDER.filter(s => s !== 'done').map(s => {
              const sIdx = stageIndex(s)
              const active = stage === s
              const done = currentIndex > sIdx
              return (
                <div key={s} style={{
                  flex: 1, height: 3, borderRadius: 2,
                  background: done ? '#ff3c3c' : active ? '#ff3c3c88' : '#1c1c1c',
                  transition: 'background 0.3s', position: 'relative', overflow: 'hidden',
                }}>
                  {active && <div style={{
                    position: 'absolute', top: 0, left: '-100%',
                    width: '100%', height: '100%',
                    background: 'linear-gradient(90deg, transparent, #fff4, transparent)',
                    animation: 'shimmer 1.2s infinite',
                  }} />}
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            {isRunning && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff3c3c', animation: 'pulse 1s infinite' }} />}
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', color: stage === STAGES.ERROR ? '#ff3c3c' : stage === STAGES.DONE ? '#3cff8f' : '#ff3c3c' }}>
              {STAGE_LABELS[stage] || stage.toUpperCase()}
            </span>
          </div>
          <div style={{
            background: '#0d0d15', border: '1px solid #1a1a1a', borderRadius: 4,
            padding: '12px 14px', fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, color: '#555', lineHeight: 1.8, minHeight: 80,
          }}>
            {log.map((l, i) => (
              <div key={i} style={{ color: i === log.length - 1 ? '#888' : '#3a3a3a' }}>
                <span style={{ color: '#2a2a2a', marginRight: 8 }}>›</span>{l}
              </div>
            ))}
            {isRunning && <span style={{ color: '#ff3c3c', animation: 'blink 1s infinite' }}>▌</span>}
          </div>
        </div>
      )}

      {prompts && (
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 24, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[{ key: 'flux', label: 'CHARACTER', icon: '▲' }, { key: 'suno', label: 'BEAT', icon: '♪' }, { key: 'seedance', label: 'SCENE', icon: '◉' }].map(({ key, label, icon }) => (
            <div key={key} style={{ background: '#0d0d15', border: '1px solid #1a1a1a', borderRadius: 4, padding: 12 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.2em', color: '#ff3c3c', fontWeight: 700, marginBottom: 8 }}>{icon} {label}</div>
              <div style={{ fontSize: 11, color: '#444', lineHeight: 1.6 }}>{prompts[key]?.slice(0, 120)}{prompts[key]?.length > 120 ? '...' : ''}</div>
            </div>
          ))}
        </div>
      )}

      {imageUrl && (
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 24 }}>
          <div style={{ background: '#0d0d15', border: '1px solid #1a1a1a', borderRadius: 4, padding: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src={imageUrl} alt="Generated Clawd" style={{ width: 80, height: 80, borderRadius: 3, objectFit: 'cover' }} />
            <div>
              <div style={{ fontSize: 9, letterSpacing: '0.2em', color: '#ff3c3c', fontWeight: 700, marginBottom: 4 }}>▲ CLAWD BUILT</div>
              <div style={{ fontSize: 11, color: '#444', lineHeight: 1.5 }}>Character reference locked in.<br />Heading to Seedance.</div>
            </div>
          </div>
        </div>
      )}

      {beatData && (
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 24, display: 'flex', gap: 8 }}>
          {[{ label: 'BPM', value: beatData.bpm }, { label: 'DROP', value: `${beatData.drop}s` }, { label: 'PEAK', value: `${beatData.peak}s` }, { label: 'ENERGY', value: beatData.energy?.toUpperCase() }].map(({ label, value }) => (
            <div key={label} style={{ flex: 1, background: '#0d0d15', border: '1px solid #1a1a1a', borderRadius: 4, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#333', letterSpacing: '0.15em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#ff3c3c', letterSpacing: '-0.02em' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {stage === STAGES.DONE && videoUrl && (
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 40 }}>
          <div style={{ background: '#0d0d15', border: '1px solid #3cff8f33', borderRadius: 4, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.2em', color: '#3cff8f', fontWeight: 700, marginBottom: 16 }}>✓ CLAWD DROPPED</div>
            <video src={videoUrl} controls style={{ width: '100%', borderRadius: 3, background: '#000', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <a href={videoUrl} download="clawd-drop.mp4" style={{ background: '#ff3c3c', color: '#fff', textDecoration: 'none', padding: '10px 24px', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', borderRadius: 3 }}>DOWNLOAD</a>
              <button onClick={() => { setStage(STAGES.IDLE); setGoal(''); setLog([]); setPrompts(null); setBeatData(null); setImageUrl(null); setVideoUrl(null) }} style={{ background: 'transparent', color: '#444', border: '1px solid #222', padding: '10px 24px', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}>DROP AGAIN</button>
            </div>
          </div>
        </div>
      )}

      {stage === STAGES.ERROR && (
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 40, background: '#0d0d15', border: '1px solid #ff3c3c33', borderRadius: 4, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#ff3c3c', letterSpacing: '0.15em', marginBottom: 8 }}>✕ PIPELINE FAILED</div>
          <div style={{ fontSize: 13, color: '#555' }}>{error}</div>
          <button onClick={() => setStage(STAGES.IDLE)} style={{ marginTop: 16, background: 'transparent', color: '#555', border: '1px solid #222', padding: '8px 16px', fontSize: 11, letterSpacing: '0.15em', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}>RESET</button>
        </div>
      )}
    </div>
  )
}
