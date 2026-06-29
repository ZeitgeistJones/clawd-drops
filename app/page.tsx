'use client'

import { useState, useRef } from 'react'

const STAGES = {
  IDLE: 'idle',
  PROMPTING: 'prompting',
  UPLOADING_IMAGE: 'uploading_image',
  GENERATING_MUSIC: 'generating_music',
  ANALYZING_AUDIO: 'analyzing_audio',
  STYLING: 'styling',
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
  styling: 'STYLING CHARACTER',
  generating_video: 'GENERATING VIDEO',
  syncing: 'SYNCING FRAMES',
  done: 'CLAWD DROPPED',
  error: 'PIPELINE FAILED',
}

const STAGE_ORDER = [
  'prompting', 'uploading_image', 'generating_music',
  'analyzing_audio', 'styling', 'generating_video', 'syncing', 'done',
]

const MODELS = [
  { id: 'seedance-2-0-mini', label: 'MINI', creditsPerSec: 3 },
  { id: 'seedance-2-0-fast', label: 'FAST', creditsPerSec: 5 },
  { id: 'seedance-2-0', label: 'STANDARD', creditsPerSec: 6 },
]

const DURATIONS = [4, 5, 8, 10]

function estimateCredits(model: string, clipCount: number, duration: number) {
  const m = MODELS.find(x => x.id === model) || MODELS[1]
  return m.creditsPerSec * duration * clipCount
}

export default function Home() {
  const [goal, setGoal] = useState('')
  const [mode, setMode] = useState<'auto' | 'song'>('auto')
  const [songName, setSongName] = useState('')
  const [moment, setMoment] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [styledPreview, setStyledPreview] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState('seedance-2-0-fast')
  const [clipCount, setClipCount] = useState(2)
  const [duration, setDuration] = useState(5)
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
  const estCredits = estimateCredits(selectedModel, clipCount, duration)
  const estMinutes = Math.ceil((clipCount * duration * 1.5) / 60) + 3

  async function handleImageFile(file: File) {
    const preview = URL.createObjectURL(file)
    setImagePreview(preview)
    setStyledPreview(null)
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
    const finalImageUrl = imageUrl || 'https://raw.githubusercontent.com/ZeitgeistJones/clawd-drops/main/clawd.png'

    setStage(STAGES.PROMPTING)
    setLog([])
    setPrompts(null)
    setBeatData(null)
    setVideoUrl(null)
    setStyledPreview(null)
    setError(null)

    try {
      // STEP 1: Generate prompts
      addLog('Claude is reading your goal...')
      const promptRes = await fetch('/api/generate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, mode, clipCount }),
      })
      const promptData = await promptRes.json()
      if (promptData.error) throw new Error(promptData.error)
      setPrompts(promptData)
      addLog('Prompts locked.')

      // STEP 2: Handle image
      setStage(STAGES.UPLOADING_IMAGE)
      addLog(imageUrl ? 'Character image ready.' : 'Using default Clawd reference.')

      // STEP 3: Music (AUTO MODE only)
      const musicData = { audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' }
      if (mode === 'auto') {
        setStage(STAGES.GENERATING_MUSIC)
        addLog('Cooking the beat...')
        addLog('Beat dropped.')
      }

      // STEP 4: Beat data
      setStage(STAGES.ANALYZING_AUDIO)
      addLog('Analyzing beat structure...')
      const audioData = { bpm: 128, drop: 2.0, peak: duration * 0.7, energy: 'high' }
      setBeatData(audioData)
      addLog(`BPM: ${audioData.bpm} | Drop: ${audioData.drop}s | Peak: ${audioData.peak}s`)

      // STEP 5: Style character
      setStage(STAGES.STYLING)
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
      if (!styleData.error) setStyledPreview(styledImageUrl)
      addLog(styleData.error ? 'Style step skipped — using original.' : 'Character styled.')

      // STEP 6: Generate clips
      setStage(STAGES.GENERATING_VIDEO)
      addLog(`~${estMinutes} minutes estimated for ${clipCount} clips...`)
      addLog('Generating clip 1 — the build...')

      const clipPrompts = Array.from({ length: clipCount }, (_, i) => promptData[`seedance${i + 1}`]).filter(Boolean)

      const videoRes = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompts: clipPrompts,
          imageUrl: styledImageUrl,
          beat: audioData,
          model: selectedModel,
          duration,
        }),
      })
      const videoJobData = await videoRes.json()
      if (videoJobData.error) throw new Error(videoJobData.error)

      // Poll clips from frontend
      let completedClips: string[] = []
      let currentTaskId = videoJobData.taskId1
      let nextClipIndex = 1

      for (let i = 0; i < 80; i++) {
        await new Promise(r => setTimeout(r, 10000))
        const pollRes = await fetch('/api/poll-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: currentTaskId,
            completedClips,
            nextClipIndex,
            prompts: clipPrompts,
            imageUrl: styledImageUrl,
            beat: audioData,
            model: selectedModel,
            duration,
            totalClips: clipCount,
          }),
        })
        const pollData = await pollRes.json()

        if (pollData.status?.startsWith('clip') && pollData.status?.endsWith('_done')) {
          completedClips = pollData.completedClips
          currentTaskId = pollData.nextTaskId
          nextClipIndex = pollData.nextClipIndex
          addLog(`Clip ${completedClips.length} ready. Generating clip ${completedClips.length + 1}...`)
          continue
        }

        if (pollData.status === 'completed') {
          completedClips = pollData.completedClips
          addLog(`All ${clipCount} clips ready.`)

          // STEP 7: Manus sync
          setStage(STAGES.SYNCING)
          addLog('Sending to Manus for sync...')
          const syncRes = await fetch('/api/sync-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clips: completedClips,
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
            addLog(`Manus: ${manusData.status}...`)
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
        addLog(`Video status: ${pollData.status}...`)
      }

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

      {/* Header */}
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
        <p style={{ fontSize: 14, color: '#555', margin: '0 0 24px 0', letterSpacing: '0.02em', lineHeight: 1.5 }}>
          type a goal. drop a character. get a synced video.<br />
          one input. frame-perfect output.
        </p>
      </div>

      {/* Controls row */}
      <div style={{ width: '100%', maxWidth: 680, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, letterSpacing: '0.15em', color: '#333', width: 60 }}>MODE</span>
          {(['auto', 'song'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} disabled={isRunning} style={{
              background: mode === m ? '#ff3c3c' : '#111118',
              color: mode === m ? '#fff' : '#444',
              border: `1px solid ${mode === m ? '#ff3c3c' : '#222'}`,
              borderRadius: 3, padding: '4px 12px',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
              textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {m === 'auto' ? 'AUTO' : 'SONG MODE'}
            </button>
          ))}
        </div>

        {/* Model selector */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, letterSpacing: '0.15em', color: '#333', width: 60 }}>MODEL</span>
          {MODELS.map(m => (
            <button key={m.id} onClick={() => setSelectedModel(m.id)} disabled={isRunning} style={{
              background: selectedModel === m.id ? '#ff3c3c22' : '#111118',
              color: selectedModel === m.id ? '#ff3c3c' : '#444',
              border: `1px solid ${selectedModel === m.id ? '#ff3c3c' : '#222'}`,
              borderRadius: 3, padding: '4px 12px',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
              textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Clips toggle */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, letterSpacing: '0.15em', color: '#333', width: 60 }}>CLIPS</span>
          {[1, 2, 3].map(n => (
            <button key={n} onClick={() => setClipCount(n)} disabled={isRunning} style={{
              background: clipCount === n ? '#ff3c3c22' : '#111118',
              color: clipCount === n ? '#ff3c3c' : '#444',
              border: `1px solid ${clipCount === n ? '#ff3c3c' : '#222'}`,
              borderRadius: 3, padding: '4px 12px',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {n}
            </button>
          ))}
        </div>

        {/* Duration toggle */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, letterSpacing: '0.15em', color: '#333', width: 60 }}>LENGTH</span>
          {DURATIONS.map(d => (
            <button key={d} onClick={() => setDuration(d)} disabled={isRunning} style={{
              background: duration === d ? '#ff3c3c22' : '#111118',
              color: duration === d ? '#ff3c3c' : '#444',
              border: `1px solid ${duration === d ? '#ff3c3c' : '#222'}`,
              borderRadius: 3, padding: '4px 12px',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {d}s
            </button>
          ))}
        </div>

        {/* Credit estimate */}
        <div style={{ fontSize: 10, color: '#333', letterSpacing: '0.1em', paddingLeft: 64 }}>
          EST. COST: <span style={{ color: '#ff3c3c' }}>{estCredits} CREDITS</span>
          <span style={{ color: '#2a2a2a', marginLeft: 12 }}>~{estMinutes} MIN</span>
        </div>
      </div>

      {/* Input area */}
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

          {/* Image upload */}
          <div
            ref={dropRef}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
          >
            {imagePreview ? (
              <img src={styledPreview || imagePreview} style={{ width: 40, height: 40, borderRadius: 3, objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: 40, height: 40, borderRadius: 3, border: '1px dashed #2a2a2a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, color: '#333', cursor: 'pointer',
              }} onClick={() => fileInputRef.current?.click()}>▲</div>
            )}
            <input
              type="text" value={imageUrl}
              onChange={e => { setImageUrl(e.target.value); setImagePreview(null); setStyledPreview(null) }}
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

          {/* Song Mode fields */}
          {mode === 'song' && (
            <>
              <div style={{ height: 1, background: '#1a1a1a' }} />
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="text" value={songName} onChange={e => setSongName(e.target.value)}
                  placeholder="Song name (e.g. Lone Digger by Caravan Palace)"
                  disabled={isRunning}
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, fontFamily: 'inherit', width: '100%' }}
                />
                <div style={{ height: 1, background: '#1a1a1a' }} />
                <input
                  type="text" value={moment} onChange={e => setMoment(e.target.value)}
                  placeholder="Moment (e.g. the horn drop)"
                  disabled={isRunning}
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, fontFamily: 'inherit', width: '100%' }}
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

      {/* Pipeline stages */}
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

      {/* Styled character preview */}
      {styledPreview && (
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 16 }}>
          <div style={{ background: '#0d0d15', border: '1px solid #1a1a1a', borderRadius: 4, padding: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src={styledPreview} alt="Styled character" style={{ width: 64, height: 64, borderRadius: 3, objectFit: 'cover' }} />
            <div>
              <div style={{ fontSize: 9, letterSpacing: '0.2em', color: '#ff3c3c', fontWeight: 700, marginBottom: 4 }}>▲ CHARACTER STYLED</div>
              <div style={{ fontSize: 11, color: '#444' }}>Art style applied. Heading to Seedance.</div>
            </div>
          </div>
        </div>
      )}

      {/* Prompts */}
      {prompts && (
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 24, display: 'grid', gridTemplateColumns: `repeat(${Math.min(clipCount + (mode === 'auto' ? 1 : 0), 3)}, 1fr)`, gap: 8 }}>
          {Array.from({ length: clipCount }, (_, i) => ({
            key: `seedance${i + 1}`,
            label: i === 0 ? 'BUILD' : i === clipCount - 1 ? 'DROP' : `CLIP ${i + 1}`,
            icon: i === 0 ? '◉' : i === clipCount - 1 ? '▼' : '●'
          })).concat(mode === 'auto' ? [{ key: 'suno', label: 'BEAT', icon: '♪' }] : []).map(({ key, label, icon }) => (
            <div key={key} style={{ background: '#0d0d15', border: '1px solid #1a1a1a', borderRadius: 4, padding: 12 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.2em', color: '#ff3c3c', fontWeight: 700, marginBottom: 8 }}>{icon} {label}</div>
              <div style={{ fontSize: 11, color: '#444', lineHeight: 1.6 }}>{prompts[key]?.slice(0, 100)}{prompts[key]?.length > 100 ? '...' : ''}</div>
            </div>
          ))}
        </div>
      )}

      {/* Beat data */}
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

      {/* Output */}
      {stage === STAGES.DONE && videoUrl && (
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 40 }}>
          <div style={{ background: '#0d0d15', border: '1px solid #3cff8f33', borderRadius: 4, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.2em', color: '#3cff8f', fontWeight: 700, marginBottom: 16 }}>✓ CLAWD DROPPED</div>
            <video src={videoUrl} controls style={{ width: '100%', borderRadius: 3, background: '#000', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <a href={videoUrl} download="clawd-drop.mp4" style={{ background: '#ff3c3c', color: '#fff', textDecoration: 'none', padding: '10px 24px', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', borderRadius: 3 }}>DOWNLOAD</a>
              <button onClick={() => { navigator.clipboard.writeText(videoUrl) }} style={{ background: 'transparent', color: '#666', border: '1px solid #222', padding: '10px 24px', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}>COPY LINK</button>
              <button onClick={() => { setStage(STAGES.IDLE); setGoal(''); setLog([]); setPrompts(null); setBeatData(null); setVideoUrl(null); setStyledPreview(null) }} style={{ background: 'transparent', color: '#444', border: '1px solid #222', padding: '10px 24px', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit' }}>DROP AGAIN</button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
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
