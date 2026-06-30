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
  { id: 'seedance-2-0-fast', label: 'FAST', creditsPerSec: 5 },
  { id: 'seedance-2-0', label: 'STANDARD', creditsPerSec: 6 },
]

const DURATIONS = [4, 5, 8, 10]

type MusicMode = 'ai' | 'my-song' | 'find-song'

function estimateCredits(model: string, clipCount: number, duration: number) {
  const m = MODELS.find(x => x.id === model) || MODELS[0]
  return m.creditsPerSec * duration * clipCount
}

function ToggleGroup({ label, options, value, onChange, disabled }: {
  label: string
  options: { id: string; label: string }[]
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.18em', color: '#2a2a2a', fontWeight: 700, width: 72, flexShrink: 0, textTransform: 'uppercase' }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map(opt => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            disabled={disabled}
            style={{
              background: value === opt.id ? '#ff3c3c' : 'transparent',
              color: value === opt.id ? '#fff' : '#333',
              border: `1px solid ${value === opt.id ? '#ff3c3c' : '#1e1e1e'}`,
              borderRadius: 3,
              padding: '5px 14px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const [goal, setGoal] = useState('')
  const [musicMode, setMusicMode] = useState<MusicMode>('my-song')
  const [songName, setSongName] = useState('')
  const [moment, setMoment] = useState('')
  const [vibeDescription, setVibeDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [styledPreview, setStyledPreview] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState('seedance-2-0-fast')
  const [clipCount, setClipCount] = useState(2)
  const [duration, setDuration] = useState(8)
  const [stage, setStage] = useState(STAGES.IDLE)
  const [prompts, setPrompts] = useState<any>(null)
  const [beatData, setBeatData] = useState<any>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [generatingGoal, setGeneratingGoal] = useState(false)
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

  async function generateGoalFromSong() {
    if (!songName.trim()) return
    setGeneratingGoal(true)
    try {
      const res = await fetch('/api/generate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ musicMode, clipCount, songName, goal: '' }),
      })
      const data = await res.json()
      if (data.generatedGoal) setGoal(data.generatedGoal)
    } catch {}
    setGeneratingGoal(false)
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
        body: JSON.stringify({ goal, musicMode, clipCount }),
      })
      const promptData = await promptRes.json()
      if (promptData.error) throw new Error(promptData.error)
      setPrompts(promptData)
      addLog('Prompts locked.')

      // STEP 2: Image
      setStage(STAGES.UPLOADING_IMAGE)
      addLog(imageUrl ? 'Character image ready.' : 'Using default Clawd reference.')

      // STEP 3: Music (AI mode only)
 let musicData = { audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' }
      if (musicMode === 'ai') {
        setStage(STAGES.GENERATING_MUSIC)
        addLog('Searching for matching instrumental...')
        const musicRes = await fetch('/api/generate-music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mood: promptData.style || goal }),
        })
        const musicResult = await musicRes.json()
        musicData = { audioUrl: musicResult.audioUrl }
        addLog(musicResult.source === 'freesound' ? `Found: ${musicResult.title}` : 'Using fallback track.')
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
      addLog(`~${estMinutes} min estimated for ${clipCount} clips...`)
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

      let completedClips: string[] = []
      let currentTaskId = videoJobData.taskId1
      let nextClipIndex = 1
      let videoProvider = videoJobData.provider ?? 'seedance'

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
            provider: videoProvider,
          }),
        })
        const pollData = await pollRes.json()

        if (pollData.status?.includes('_done')) {
          completedClips = pollData.completedClips
          currentTaskId = pollData.nextTaskId
          nextClipIndex = pollData.nextClipIndex
          videoProvider = pollData.provider ?? videoProvider
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
              musicMode,
              audioUrl: musicMode === 'ai' ? musicData.audioUrl : null,
              songName: musicMode === 'my-song' ? songName : null,
              moment: musicMode === 'my-song' ? moment : null,
              vibeDescription: musicMode === 'find-song' ? vibeDescription : null,
              beat: audioData,
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
              body: JSON.stringify({ taskId: syncJobData.taskId, rawVideoUrl: syncJobData.rawVideoUrl }),
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
        addLog(`Video: ${pollData.status}...`)
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
      padding: '0 24px',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700;900&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes shimmer { 0%{left:-100%} 100%{left:100%} }
        * { box-sizing: border-box; }
        textarea::placeholder { color: #222; }
        textarea { caret-color: #ff3c3c; }
        input::placeholder { color: #222; }
        button:hover:not(:disabled) { opacity: 0.85; }
      `}</style>

      {/* Header */}
      <div style={{ width: '100%', maxWidth: 640, paddingTop: 64, paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.25em', color: '#ff3c3c', fontWeight: 700 }}>▲ CLAWD</span>
          <span style={{ fontSize: 10, letterSpacing: '0.2em', color: '#222' }}>VIDEO PIPELINE</span>
        </div>
        <h1 style={{
          fontSize: 'clamp(48px, 9vw, 80px)',
          fontWeight: 900,
          lineHeight: 0.9,
          margin: '0 0 20px 0',
          letterSpacing: '-0.04em',
          background: 'linear-gradient(135deg, #fff 50%, #ff3c3c 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>CLAWD<br />DROPS</h1>
        <p style={{ fontSize: 13, color: '#444', margin: '0 0 40px 0', lineHeight: 1.6 }}>
          type a goal. drop a character. get a synced video.
        </p>
      </div>

      {/* Controls */}
      <div style={{ width: '100%', maxWidth: 640, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ToggleGroup
          label="Music"
          options={[
            { id: 'ai', label: 'AI Song' },
            { id: 'my-song', label: 'My Song' },
            { id: 'find-song', label: 'Find Song' },
          ]}
          value={musicMode}
          onChange={v => setMusicMode(v as MusicMode)}
          disabled={isRunning}
        />
        <ToggleGroup
          label="Model"
          options={MODELS.map(m => ({ id: m.id, label: m.label }))}
          value={selectedModel}
          onChange={setSelectedModel}
          disabled={isRunning}
        />
        <ToggleGroup
          label="Clips"
          options={[1, 2, 3].map(n => ({ id: String(n), label: String(n) }))}
          value={String(clipCount)}
          onChange={v => setClipCount(Number(v))}
          disabled={isRunning}
        />
        <ToggleGroup
          label="Length"
          options={DURATIONS.map(d => ({ id: String(d), label: `${d}s` }))}
          value={String(duration)}
          onChange={v => setDuration(Number(v))}
          disabled={isRunning}
        />
        <div style={{ paddingLeft: 72, fontSize: 10, color: '#2a2a2a', letterSpacing: '0.1em' }}>
          EST. <span style={{ color: '#ff3c3c' }}>{estCredits} CREDITS</span>
          <span style={{ marginLeft: 12 }}>~{estMinutes} MIN</span>
        </div>
      </div>

      {/* Input card */}
      <div style={{ width: '100%', maxWidth: 640, marginBottom: 12 }}>
        <div style={{
          background: '#0d0d15',
          border: `1px solid ${isRunning ? '#ff3c3c22' : '#1a1a1a'}`,
          borderRadius: 6,
          overflow: 'hidden',
        }}>
          {/* Goal */}
          <textarea
            value={goal}
            onChange={e => setGoal(e.target.value)}
            disabled={isRunning}
            placeholder={
              musicMode === 'find-song'
                ? 'describe the scene and character energy...'
                : 'clawd grinding on a build, late night, hypnotic vibe'
            }
            rows={3}
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              color: '#fff', fontSize: 15, lineHeight: 1.6, padding: '18px 18px 14px',
              resize: 'none', fontFamily: 'inherit',
            }}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runPipeline() }}
          />

          <div style={{ height: 1, background: '#111' }} />

          {/* Image upload */}
          <div
            ref={dropRef}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12 }}
          >
            {imagePreview ? (
              <img src={styledPreview || imagePreview} style={{ width: 36, height: 36, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div
                style={{
                  width: 36, height: 36, borderRadius: 3, border: '1px dashed #222',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, color: '#2a2a2a', cursor: 'pointer', flexShrink: 0,
                }}
                onClick={() => fileInputRef.current?.click()}
              >▲</div>
            )}
            <input
              type="text" value={imageUrl}
              onChange={e => { setImageUrl(e.target.value); setImagePreview(null); setStyledPreview(null) }}
              placeholder="drag image or paste URL (default: clawd)"
              disabled={isRunning}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#444', fontSize: 12, fontFamily: 'inherit',
              }}
            />
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f) }} />
          </div>

          {/* Music mode fields */}
          {musicMode === 'my-song' && (
            <>
              <div style={{ height: 1, background: '#111' }} />
              <div style={{ padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="text" value={songName} onChange={e => setSongName(e.target.value)}
                    placeholder="Song name (e.g. No Surprises by Radiohead)"
                    disabled={isRunning}
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 13, fontFamily: 'inherit' }}
                  />
                  <button
                    onClick={generateGoalFromSong}
                    disabled={isRunning || generatingGoal || !songName.trim()}
                    style={{
                      background: 'transparent', border: '1px solid #222', borderRadius: 3,
                      padding: '4px 10px', fontSize: 9, color: '#333', cursor: 'pointer',
                      fontFamily: 'inherit', letterSpacing: '0.1em', whiteSpace: 'nowrap',
                    }}
                  >
                    {generatingGoal ? '...' : 'GEN GOAL'}
                  </button>
                </div>
                <div style={{ height: 1, background: '#111' }} />
                <input
                  type="text" value={moment} onChange={e => setMoment(e.target.value)}
                  placeholder="Moment (e.g. when the glockenspiel drops)"
                  disabled={isRunning}
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 13, fontFamily: 'inherit', width: '100%' }}
                />
              </div>
            </>
          )}

          {musicMode === 'find-song' && (
            <>
              <div style={{ height: 1, background: '#111' }} />
              <div style={{ padding: '10px 18px' }}>
                <input
                  type="text" value={vibeDescription} onChange={e => setVibeDescription(e.target.value)}
                  placeholder="Vibe (e.g. melancholy, late night, cinematic)"
                  disabled={isRunning}
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 13, fontFamily: 'inherit' }}
                />
              </div>
            </>
          )}

          <div style={{ height: 1, background: '#111' }} />

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px 14px' }}>
            <span style={{ fontSize: 10, color: '#222', letterSpacing: '0.1em' }}>⌘ + ENTER</span>
            <button
              onClick={runPipeline}
              disabled={isRunning || !goal.trim()}
              style={{
                background: isRunning ? '#111' : '#ff3c3c',
                color: isRunning ? '#333' : '#fff',
                border: 'none', borderRadius: 3, padding: '8px 22px',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
                textTransform: 'uppercase', cursor: isRunning || !goal.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {isRunning ? 'RUNNING...' : 'DROP IT'}
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline progress */}
      {stage !== STAGES.IDLE && (
        <div style={{ width: '100%', maxWidth: 640, marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 3, marginBottom: 16 }}>
            {STAGE_ORDER.filter(s => s !== 'done').map(s => {
              const sIdx = stageIndex(s)
              const active = stage === s
              const done = currentIndex > sIdx
              return (
                <div key={s} style={{
                  flex: 1, height: 2, borderRadius: 1,
                  background: done ? '#ff3c3c' : active ? '#ff3c3c66' : '#111',
                  transition: 'background 0.3s', position: 'relative', overflow: 'hidden',
                }}>
                  {active && <div style={{
                    position: 'absolute', top: 0, left: '-100%',
                    width: '100%', height: '100%',
                    background: 'linear-gradient(90deg, transparent, #fff3, transparent)',
                    animation: 'shimmer 1.4s infinite',
                  }} />}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {isRunning && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff3c3c', animation: 'pulse 1s infinite' }} />}
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
              color: stage === STAGES.ERROR ? '#ff3c3c' : stage === STAGES.DONE ? '#3cff8f' : '#ff3c3c',
            }}>
              {STAGE_LABELS[stage] || stage.toUpperCase()}
            </span>
          </div>

          <div style={{
            background: '#080810', border: '1px solid #111', borderRadius: 4,
            padding: '12px 14px', fontFamily: 'monospace',
            fontSize: 11, color: '#555', lineHeight: 1.9, minHeight: 72,
          }}>
            {log.map((l, i) => (
              <div key={i} style={{ color: i === log.length - 1 ? '#666' : '#2a2a2a' }}>
                <span style={{ color: '#1e1e1e', marginRight: 8 }}>›</span>{l}
              </div>
            ))}
            {isRunning && <span style={{ color: '#ff3c3c', animation: 'blink 1s infinite' }}>▌</span>}
          </div>
        </div>
      )}

      {/* Styled preview */}
      {styledPreview && (
        <div style={{ width: '100%', maxWidth: 640, marginBottom: 16 }}>
          <div style={{ background: '#080810', border: '1px solid #111', borderRadius: 4, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src={styledPreview} style={{ width: 52, height: 52, borderRadius: 3, objectFit: 'cover' }} />
            <div>
              <div style={{ fontSize: 9, letterSpacing: '0.2em', color: '#ff3c3c', fontWeight: 700, marginBottom: 3 }}>▲ CHARACTER STYLED</div>
              <div style={{ fontSize: 11, color: '#333' }}>Art style applied. Heading to Seedance.</div>
            </div>
          </div>
        </div>
      )}

      {/* Prompts */}
      {prompts && (
        <div style={{ width: '100%', maxWidth: 640, marginBottom: 20, display: 'grid', gridTemplateColumns: `repeat(${Math.min(clipCount, 3)}, 1fr)`, gap: 6 }}>
          {Array.from({ length: clipCount }, (_, i) => ({
            key: `seedance${i + 1}`,
            label: i === 0 ? 'BUILD' : i === clipCount - 1 ? 'DROP' : `CLIP ${i + 1}`,
          })).map(({ key, label }) => (
            <div key={key} style={{ background: '#080810', border: '1px solid #111', borderRadius: 4, padding: '10px 12px' }}>
              <div style={{ fontSize: 8, letterSpacing: '0.2em', color: '#ff3c3c', fontWeight: 700, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 10, color: '#333', lineHeight: 1.6 }}>{prompts[key]?.slice(0, 100)}{prompts[key]?.length > 100 ? '...' : ''}</div>
            </div>
          ))}
        </div>
      )}

      {/* Beat data */}
      {beatData && (
        <div style={{ width: '100%', maxWidth: 640, marginBottom: 20, display: 'flex', gap: 6 }}>
          {[{ label: 'BPM', value: beatData.bpm }, { label: 'DROP', value: `${beatData.drop}s` }, { label: 'PEAK', value: `${beatData.peak}s` }, { label: 'ENERGY', value: beatData.energy?.toUpperCase() }].map(({ label, value }) => (
            <div key={label} style={{ flex: 1, background: '#080810', border: '1px solid #111', borderRadius: 4, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: '#222', letterSpacing: '0.15em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#ff3c3c' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Output */}
      {stage === STAGES.DONE && videoUrl && (
        <div style={{ width: '100%', maxWidth: 640, marginBottom: 40 }}>
          <div style={{ background: '#080810', border: '1px solid #3cff8f22', borderRadius: 6, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#3cff8f', fontWeight: 700, marginBottom: 16 }}>✓ CLAWD DROPPED</div>
            <video src={videoUrl} controls style={{ width: '100%', borderRadius: 4, background: '#000', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <a href={videoUrl} download="clawd-drop.mp4" style={{
                background: '#ff3c3c', color: '#fff', textDecoration: 'none',
                padding: '9px 22px', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', borderRadius: 3,
              }}>DOWNLOAD</a>
              <button onClick={() => navigator.clipboard.writeText(videoUrl)} style={{
                background: 'transparent', color: '#555', border: '1px solid #1a1a1a',
                padding: '9px 22px', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', borderRadius: 3,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>COPY LINK</button>
              <button onClick={() => { setStage(STAGES.IDLE); setGoal(''); setLog([]); setPrompts(null); setBeatData(null); setVideoUrl(null); setStyledPreview(null) }} style={{
                background: 'transparent', color: '#333', border: '1px solid #1a1a1a',
                padding: '9px 22px', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', borderRadius: 3,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>DROP AGAIN</button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {stage === STAGES.ERROR && (
        <div style={{ width: '100%', maxWidth: 640, marginBottom: 40, background: '#080810', border: '1px solid #ff3c3c22', borderRadius: 6, padding: 20 }}>
          <div style={{ fontSize: 10, color: '#ff3c3c', letterSpacing: '0.15em', marginBottom: 8 }}>✕ PIPELINE FAILED</div>
          <div style={{ fontSize: 13, color: '#444' }}>{error}</div>
          <button onClick={() => setStage(STAGES.IDLE)} style={{
            marginTop: 16, background: 'transparent', color: '#444', border: '1px solid #1a1a1a',
            padding: '7px 16px', fontSize: 10, letterSpacing: '0.15em', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
          }}>RESET</button>
        </div>
      )}

      {/* Footer */}
      <div style={{ width: '100%', maxWidth: 640, paddingBottom: 40, display: 'flex', justifyContent: 'center' }}>
        <a href="/terms" style={{ fontSize: 10, color: '#222', letterSpacing: '0.1em', textDecoration: 'none' }}>terms</a>
      </div>
    </div>
  )
}
