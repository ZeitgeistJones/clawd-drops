'use client'

import { useState, useRef } from 'react'

const STAGES = {
  IDLE: 'idle',
  PROMPTING: 'prompting',
  UPLOADING_IMAGE: 'uploading_image',
  GENERATING_MUSIC: 'generating_music',
  ANALYZING_AUDIO: 'analyzing_audio',
  GENERATING_VIDEO: 'generating_video',
  SYNCING: 'syncing',
  DONE: 'done',
  ERROR: 'error',
}

const STAGE_LABELS: Record<string, string> = {
  prompting: 'WRITING PROMPTS',
  uploading_image: 'LOADING CHARACTER',
  generating_music: 'COOKING THE BEAT',
  analyzing_audio: 'READING THE DROP',
  generating_video: 'GENERATING VIDEO',
  syncing: 'SYNCING FRAMES',
  done: 'CLAWD DROPPED',
  error: 'PIPELINE FAILED',
}

const STAGE_ORDER = [
  'prompting', 'uploading_image', 'generating_music',
  'analyzing_audio', 'generating_video', 'syncing', 'done',
]

export default function Home() {
  const [goal, setGoal] = useState('')
  const [mode, setMode] = useState<'auto' | 'song'>('auto')
  const [songName, setSongName] = useState('')
  const [moment, setMoment] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [stage, setStage] = useState(STAGES.IDLE)
  const [prompts, setPrompts] = useState<any>(null)
  const [beatData, setBeatData] = useState<any>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const addLog = (msg: string) => setLog(prev => [...prev, msg])
  const stageIndex = (s: string) => STAGE_ORDER.indexOf(s)
  const currentIndex = stageIndex(stage)
  const isRunning = ![STAGES.IDLE, STAGES.DONE, STAGES.ERROR].includes(stage)

  async function handleImageFile(file: File) {
    const preview = URL.createObjectURL(file)
    setImagePreview(preview)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/upload-image', { method: 'POST', body: formData })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    setImageUrl(data.url)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) handleImageFile(file)
  }

  async function runPipeline() {
    if (!goal.trim()) return
    const finalImageUrl = imageUrl || 'https://raw.githubusercontent.com/ZeitgeistJones/clawd-drops/main/clawd.jpg'

    setStage(STAGES.PROMPTING)
    setLog([])
    setPrompts(null)
    setBeatData(null)
    setVideoUrl(null)
    setError(null)

    try {
      // STEP 1: Generate prompts
      addLog('Claude is reading your goal...')
      const promptRes = await fetch('/api/generate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, mode }),
      })
      const promptData = await promptRes.json()
      if (promptData.error) throw new Error(promptData.error)
      setPrompts(promptData)
      addLog('Prompts locked.')

      // STEP 2: Handle image
      setStage(STAGES.UPLOADING_IMAGE)
      addLog(imageUrl ? 'Character image ready.' : 'Using default Clawd reference.')

      // STEP 3: Music
      const musicData = { audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' }
      if (mode === 'auto') {
        setStage(STAGES.GENERATING_MUSIC)
        addLog('Cooking the beat...')
        addLog('Beat dropped.')
      }

      // STEP 4: Beat data
      setStage(STAGES.ANALYZING_AUDIO)
      addLog('Analyzing beat structure...')
      const audioData = { bpm: 128, drop: 2.0, peak: 3.5, energy: 'high' }
      setBeatData(audioData)
      addLog(`BPM: ${audioData.bpm} | Drop: ${audioData.drop}s | Peak: ${audioData.peak}s`)

      // STEP: Style character
      addLog('Applying art style to character...')
      const styleRes = await fetch('/api/style-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: finalImageUrl,
          style: promptData.style || 'sharp anime style, high contrast, dramatic lighting',
        }),
      })
      const styleData = await styleRes.json()
      const styledImageUrl = styleData.error ? finalImageUrl : styleData.imageUrl
      addLog(styleData.error ? 'Style step skipped — using original.' : 'Character styled.')

      // STEP 5: Generate video
      setStage(STAGES.GENERATING_VIDEO)
      addLog('Generating clip 1 — the build...')
      const videoRes = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt1: promptData.seedance1,
          prompt2: promptData.seedance2,
          imageUrl: styledImageUrl,
          beat: audioData,
        }),
      })
      const videoJobData = await videoRes.json()
      if (videoJobData.error) throw new Error(videoJobData.error)

      let videoUrl1: string | null = null
      let taskId2: string | null = null
      let pollTaskId = videoJobData.taskId1

      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 10000))
        const pollRes = await fetch('/api/poll-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: pollTaskId,
            taskId2,
            prompt2: videoJobData.prompt2,
            imageUrl: videoJobData.imageUrl,
            beat: videoJobData.beat,
          }),
        })
        const pollData = await pollRes.json()
        addLog(`Video status: ${pollData.status}...`)

        if (pollData.status === 'clip1_done') {
          videoUrl1 = pollData.videoUrl1
          taskId2 = pollData.taskId2
          pollTaskId = taskId2!
          addLog('Clip 1 ready. Generating clip 2 — the drop...')
          continue
        }

        if (pollData.status === 'completed') {
          addLog('Both clips ready.')
          videoUrl1 = videoUrl1 || pollData.videoUrl1
          
          // STEP 6: Submit Manus task
          setStage(STAGES.SYNCING)
          addLog('Sending to Manus for sync...')
          const syncRes = await fetch('/api/sync-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoUrl1,
              videoUrl2: pollData.videoUrl,
              audioUrl: musicData.audioUrl,
              beat: audioData,
              mode,
              songName: mode === 'song' ? songName : null,
              moment: mode === 'song' ? moment : null,
            }),
          })
          const syncJobData = await syncRes.json()
          if (syncJobData.error) throw new Error(syncJobData.error)
          addLog('Manus task submitted. Syncing...')

          for (let j = 0; j < 60; j++) {
            await new Promise(r => setTimeout(r, 10000))
            const manusRes = await fetch('/api/poll-manus', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskId: syncJobData.taskId,
                rawVideoUrl: syncJobData.rawVideoUrl,
              }),
            })
            const manusData = await manusRes.json()
            addLog(`Manus status: ${manusData.status}...`)
            if (manusData.status === 'completed') {
              setVideoUrl(manusData.videoUrl)
              addLog('Sync done.')
              setStage(STAGES.DONE)
              break
            }
            if (manusData.error) throw new Error(manusData.error)
          }
          break
        }

        if (pollData.error) throw new Error(pollData.error)
      }

      if (stage !== STAGES.DONE) throw new Error('Video generation timed out')

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
        input::placeholder { color: #2a2a2a; }
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
        <p style={{ fontSize: 14, color: '#555', margin: '0 0 32px 0', letterSpacing: '0.02em', lineHeight: 1.5 }}>
          type a goal. drop a character. get a synced video.<br />
          one input. frame-perfect output.
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 680, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['auto', 'song'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} disabled={isRunning} style={{
              background: mode === m ? '#ff3c3c' : '#111118',
              color: mode === m ? '#fff' : '#444',
              border: `1px solid ${mode === m ? '#ff3c3c' : '#222'}`,
              borderRadius: 3, padding: '6px 16px',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.15em',
              textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {m === 'auto' ? 'AUTO' : 'SONG MODE'}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#333', marginTop: 8 }}>
          {mode === 'auto' ? 'AI generates the beat and syncs it.' : 'You pick the song and moment. Manus handles everything.'}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 680, marginBottom: 12 }}>
        <div style={{
          background: '#111118', border: `1px solid ${isRunning ? '#ff3c3c33' : '#222'}`,
          borderRadius: 4, overflow: 'hidden',
        }}>
          <textarea
            value={goal} onChange={e => setGoal(e.target.value)}
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
          <div style={{ height: 1, background: '#1a1a1a' }} />
          <div
            ref={dropRef}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
          >
            {imagePreview ? (
              <img src={imagePreview} style={{ width: 40, height: 40, borderRadius: 3, objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: 40, height: 40, borderRadius: 3, border: '1px dashed #2a2a2a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, color: '#333', cursor: 'pointer',
              }} onClick={() => fileInputRef.current?.click()}>▲</div>
            )}
            <input
              type="text" value={imageUrl}
              onChange={e => { setImageUrl(e.target.value); setImagePreview(null) }}
              placeholder="paste image URL or drag image (default: clawd)"
              disabled={isRunning}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#666', fontSize: 12, fontFamily: 'inherit',
              }}
            />
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f) }} />
          </div>
          {mode === 'song' && (
            <>
              <div style={{ height: 1, background: '#1a1a1a' }} />
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="text" value={songName} onChange={e => setSongName(e.target.value)}
                  placeholder="Song name (e.g. Lone Digger by Caravan Palace)"
                  disabled={isRunning}
                  style={{
                    background: 'transparent', border: 'none', outline: 'none',
                    color: '#fff', fontSize: 14, fontFamily: 'inherit', width: '100%',
                  }}
                />
                <div style={{ height: 1, background: '#1a1a1a' }} />
                <input
                  type="text" value={moment} onChange={e => setMoment(e.target.value)}
                  placeholder="Moment (e.g. the horn drop)"
                  disabled={isRunning}
                  style={{
                    background: 'transparent', border: 'none', outline: 'none',
                    color: '#fff', fontSize: 14, fontFamily: 'inherit', width: '100%',
                  }}
                />
              </div>
            </>
          )}
          <div style={{ height: 1, background: '#1a1a1a' }} />
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
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 24, display: 'grid', gridTemplateColumns: mode === 'auto' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8 }}>
          {[
            { key: 'seedance1', label: 'BUILD', icon: '◉' },
            { key: 'seedance2', label: 'DROP', icon: '▼' },
            ...(mode === 'auto' ? [{ key: 'suno', label: 'BEAT', icon: '♪' }] : [])
          ].map(({ key, label, icon }) => (
            <div key={key} style={{ background: '#0d0d15', border: '1px solid #1a1a1a', borderRadius: 4, padding: 12 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.2em', color: '#ff3c3c', fontWeight: 700, marginBottom: 8 }}>{icon} {label}</div>
              <div style={{ fontSize: 11, color: '#444', lineHeight: 1.6 }}>{prompts[key]?.slice(0, 120)}{prompts[key]?.length > 120 ? '...' : ''}</div>
            </div>
          ))}
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
              <button onClick={() => { setStage(STAGES.IDLE); setGoal(''); setLog([]); setPrompts(null); setBeatData(null); setVideoUrl(null) }} style={{ background: 'transparent', color: '#444', border: '1px solid #222', padding: '10px 24px', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}>DROP AGAIN</button>
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
