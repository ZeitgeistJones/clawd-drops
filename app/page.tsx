'use client'

import { useState, useRef } from 'react'
import type { BeatAnalysisResult } from '../lib/beat-analysis'

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
  { id: 'seedance-2-0-fast', label: 'FAST' },
  { id: 'seedance-2-0', label: 'STANDARD' },
  { id: 'flipbook', label: 'FLIPBOOK' },
]

const DURATIONS = [4, 5, 6, 8, 10]
const POSE_COUNTS = [2, 3, 4, 5, 6]
const CLAWD_DEFAULT = 'https://raw.githubusercontent.com/ZeitgeistJones/clawd-drops/main/clawd.png'

type MusicMode = 'ai' | 'my-song' | 'find-song'

function getClipDurations(clipCount: number, buildDuration: number, dropDuration: number, singleDuration: number): number[] {
  if (clipCount <= 1) return [singleDuration]
  if (clipCount === 2) return [buildDuration, dropDuration]
  return Array.from({ length: clipCount }, (_, i) => (i === clipCount - 1 ? dropDuration : buildDuration))
}

function estimateMinutes(isFlipbook: boolean, clipCount: number, poseCount: number, buildDuration: number, dropDuration: number, singleDuration: number) {
  if (isFlipbook) return Math.ceil(poseCount * 0.25) + 2
  const durations = getClipDurations(clipCount, buildDuration, dropDuration, singleDuration)
  const total = durations.reduce((a, b) => a + b, 0)
  return Math.ceil((total * 1.5) / 60) + 3
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
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
  const [vibeDescription, setVibeDescription] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [audioFileName, setAudioFileName] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [styledPreview, setStyledPreview] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState('seedance-2-0-fast')
  const [clipCount, setClipCount] = useState(2)
  const [duration, setDuration] = useState(8)
  const [buildDuration, setBuildDuration] = useState(8)
  const [dropDuration, setDropDuration] = useState(8)
  const [poseCount, setPoseCount] = useState(5)
  const [stage, setStage] = useState(STAGES.IDLE)
  const [prompts, setPrompts] = useState<any>(null)
  const [beatData, setBeatData] = useState<BeatAnalysisResult | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const isFlipbook = selectedModel === 'flipbook'
  const addLog = (msg: string) => setLog(prev => [...prev, msg])
  const stageIndex = (s: string) => STAGE_ORDER.indexOf(s)
  const currentIndex = stageIndex(stage)
  const isRunning = ![STAGES.IDLE, STAGES.DONE, STAGES.ERROR].includes(stage)
  const estMinutes = estimateMinutes(isFlipbook, clipCount, poseCount, buildDuration, dropDuration, duration)
  const canDrop = goal.trim() && (musicMode !== 'my-song' || !!audioUrl)

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

  async function handleAudioFile(file: File) {
    setAudioFileName(file.name)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/upload-audio', { method: 'POST', body: formData })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    setAudioUrl(data.url)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) handleImageFile(file)
  }

  async function pollManus(taskId: string, rawVideoUrl: string | null) {
    addLog('Manus task submitted. Syncing...')
    let lastStatus = ''
    for (let j = 0; j < 60; j++) {
      await new Promise(r => setTimeout(r, 10000))
      const manusRes = await fetch('/api/poll-manus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, rawVideoUrl }),
      })
      const manusData = await manusRes.json()
      const checkNum = j + 1
      const status = manusData.status || 'processing'
      if (status !== lastStatus || checkNum % 5 === 0) {
        addLog(status === lastStatus ? `Manus: syncing… (check ${checkNum})` : `Manus: ${status}…`)
      }
      lastStatus = status
      if (manusData.status === 'completed') {
        setVideoUrl(manusData.videoUrl)
        addLog('Sync done.')
        setStage(STAGES.DONE)
        return
      }
      if (manusData.error) throw new Error(manusData.error)
    }
  }

  async function syncToManus(opts: {
    mode: 'video' | 'flipbook'
    clips?: string[]
    frames?: string[]
    musicData: { audioUrl: string }
    audioData: BeatAnalysisResult
    clipDurations: number[]
  }) {
    setStage(STAGES.SYNCING)
    addLog('Sending to Manus for sync...')
    const syncRes = await fetch('/api/sync-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: opts.mode,
        clips: opts.clips ?? [],
        frames: opts.frames ?? [],
        musicMode,
        audioUrl: opts.musicData.audioUrl,
        beat: opts.audioData,
        clipDurations: opts.clipDurations,
      }),
    })
    const syncText = await syncRes.text()
    let syncJobData: { taskId?: string; rawVideoUrl?: string; error?: string }
    try {
      syncJobData = JSON.parse(syncText)
    } catch {
      throw new Error(`Sync failed (${syncRes.status}): ${syncText.slice(0, 200)}`)
    }
    if (syncJobData.error) throw new Error(syncJobData.error)
    await pollManus(syncJobData.taskId!, syncJobData.rawVideoUrl ?? null)
  }

  async function runPipeline() {
    if (!canDrop) return
    const finalImageUrl = imageUrl || CLAWD_DEFAULT
    const clipDurations = getClipDurations(clipCount, buildDuration, dropDuration, duration)

    setStage(STAGES.PROMPTING)
    setLog([])
    setPrompts(null)
    setBeatData(null)
    setVideoUrl(null)
    setStyledPreview(null)
    setError(null)

    try {
      addLog('Claude is reading your goal...')
      const promptRes = await fetch('/api/generate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          musicMode,
          clipCount,
          outputMode: isFlipbook ? 'flipbook' : 'video',
          poseCount,
        }),
      })
      const promptData = await promptRes.json()
      if (promptData.error) throw new Error(promptData.error)
      setPrompts(promptData)
      addLog('Prompts locked.')

      setStage(STAGES.UPLOADING_IMAGE)
      addLog(imageUrl ? 'Character image ready.' : 'Using default Clawd reference.')

      let musicData: { audioUrl: string; title?: string } = { audioUrl: '' }
      let curatedDropSeconds: number | undefined

      if (musicMode === 'ai') {
        setStage(STAGES.GENERATING_MUSIC)
        addLog('Generating original instrumental with MusicAPI...')
        const musicRes = await fetch('/api/generate-song', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: promptData.style || goal, durationSeconds: 18 }),
        })
        const musicResult = await musicRes.json()
        if (!musicResult.success || !musicResult.audioUrl) {
          throw new Error(musicResult.error || 'Music generation failed')
        }
        musicData = { audioUrl: musicResult.audioUrl, title: musicResult.title }
        curatedDropSeconds = musicResult.dropSeconds
        addLog(
          musicResult.provider === 'musicapi'
            ? `Generated: ${musicResult.title || 'AI track'}`
            : musicResult.source === 'fallback'
              ? `Using curated drop: ${musicResult.title || 'CC0 track'} (${musicResult.fallbackReason || 'library fallback'})`
              : 'Using library fallback track.'
        )
      } else if (musicMode === 'find-song') {
        setStage(STAGES.GENERATING_MUSIC)
        addLog('Searching CC0 library (Freesound / Jamendo)...')
        const musicRes = await fetch('/api/generate-music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mood: vibeDescription || goal }),
        })
        const musicResult = await musicRes.json()
        if (!musicResult.audioUrl) throw new Error(musicResult.error || 'Library search failed')
        musicData = { audioUrl: musicResult.audioUrl, title: musicResult.title }
        curatedDropSeconds = musicResult.dropSeconds
        if (musicResult.source === 'fallback') {
          addLog(
            `Using curated drop: ${musicResult.title || 'CC0 track'} (${musicResult.fallbackReason || 'library search empty'})`
          )
        } else {
          addLog(`Found: ${musicResult.title || 'CC0 track'} (${musicResult.source})`)
        }
      } else {
        if (!audioUrl) throw new Error('Upload an audio file for My Song mode')
        musicData = { audioUrl }
        addLog(`Using uploaded track: ${audioFileName || 'your audio'}`)
      }

      setStage(STAGES.ANALYZING_AUDIO)
      addLog('Analyzing beat structure...')
      const analysisDuration = isFlipbook
        ? 18
        : clipDurations.reduce((a, b) => a + b, 0) || duration

      let audioData: BeatAnalysisResult = {
        bpm: 128,
        drop: analysisDuration * 0.55,
        peak: analysisDuration * 0.7,
        dropSeconds: analysisDuration * 0.55,
        peakSeconds: analysisDuration * 0.7,
        energy: 'high',
        source: 'fallback',
        dropConfidence: 'low',
      }

      if (musicData.audioUrl) {
        const analyzeRes = await fetch('/api/analyze-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioUrl: musicData.audioUrl, duration: analysisDuration }),
        })
        audioData = (await analyzeRes.json()) as BeatAnalysisResult
      }

      if (curatedDropSeconds != null) {
        audioData = {
          ...audioData,
          dropSeconds: curatedDropSeconds,
          drop: curatedDropSeconds,
          peakSeconds: curatedDropSeconds + 0.3,
          peak: curatedDropSeconds + 0.3,
          dropConfidence: 'high',
        }
      }

      setBeatData(audioData)
      addLog(
        audioData.source === 'fallback'
          ? 'Beat analysis fallback — using estimates.'
          : audioData.dropFlagged
            ? `BPM: ${audioData.bpm} | Drop: ${audioData.dropSeconds ?? audioData.drop}s (Meyda peak at ${audioData.meydaLoudestSeconds}s — using Essentia) | Peak: ${audioData.peakSeconds ?? audioData.peak}s`
            : audioData.dropConfidence === 'high'
              ? `BPM: ${audioData.bpm} | Drop: ${audioData.dropSeconds ?? audioData.drop}s (confirmed) | Peak: ${audioData.peakSeconds ?? audioData.peak}s`
              : `BPM: ${audioData.bpm} | Drop: ${audioData.dropSeconds ?? audioData.drop}s | Peak: ${audioData.peakSeconds ?? audioData.peak}s`
      )

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

      if (isFlipbook) {
        setStage(STAGES.GENERATING_VIDEO)
        addLog(`Generating ${poseCount} flipbook frames...`)
        const completedFrames: string[] = []
        const style = promptData.style || 'sharp anime style, high contrast, dramatic lighting'

        for (let i = 0; i < poseCount; i++) {
          addLog(`Generating frame ${i + 1} of ${poseCount}...`)
          const posePrompt = promptData[`flipbook${i + 1}`] || `Pose ${i + 1} in the emotional arc`
          const frameRes = await fetch('/api/style-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl: styledImageUrl,
              style,
              posePrompt,
            }),
          })
          const frameData = await frameRes.json()
          if (frameData.error) throw new Error(`Frame ${i + 1} failed: ${frameData.error}`)
          completedFrames.push(frameData.imageUrl)
        }

        addLog(`All ${poseCount} frames ready.`)
        await syncToManus({
          mode: 'flipbook',
          frames: completedFrames,
          musicData,
          audioData,
          clipDurations,
        })
        return
      }

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
          duration: clipDurations[0],
          clipDurations,
        }),
      })
      const videoJobData = await videoRes.json()
      if (videoJobData.error) {
        const detail = videoJobData.providerErrors?.length
          ? `${videoJobData.error}: ${videoJobData.providerErrors.join(' | ')}`
          : videoJobData.error
        throw new Error(detail)
      }

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
            duration: clipDurations[nextClipIndex - 1] ?? clipDurations[0],
            clipDurations,
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
          await syncToManus({
            mode: 'video',
            clips: completedClips,
            musicData,
            audioData,
            clipDurations,
          })
          break
        }

        if (pollData.error) throw new Error(pollData.error)
        addLog(`Video: ${pollData.status}...`)
      }

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Pipeline failed')
      setStage(STAGES.ERROR)
    }
  }

  const previewCount = isFlipbook ? poseCount : clipCount
  const previewKeys = isFlipbook
    ? Array.from({ length: poseCount }, (_, i) => ({ key: `flipbook${i + 1}`, label: `FRAME ${i + 1}` }))
    : Array.from({ length: clipCount }, (_, i) => ({
        key: `seedance${i + 1}`,
        label: i === 0 ? 'BUILD' : i === clipCount - 1 ? 'DROP' : `CLIP ${i + 1}`,
      }))

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
        {!isFlipbook && (
          <ToggleGroup
            label="Clips"
            options={[1, 2, 3].map(n => ({ id: String(n), label: String(n) }))}
            value={String(clipCount)}
            onChange={v => setClipCount(Number(v))}
            disabled={isRunning}
          />
        )}
        {isFlipbook ? (
          <ToggleGroup
            label="Poses"
            options={POSE_COUNTS.map(n => ({ id: String(n), label: String(n) }))}
            value={String(poseCount)}
            onChange={v => setPoseCount(Number(v))}
            disabled={isRunning}
          />
        ) : clipCount >= 2 ? (
          <>
            <ToggleGroup
              label="Build"
              options={DURATIONS.map(d => ({ id: String(d), label: `${d}s` }))}
              value={String(buildDuration)}
              onChange={v => setBuildDuration(Number(v))}
              disabled={isRunning}
            />
            <ToggleGroup
              label="Drop"
              options={DURATIONS.map(d => ({ id: String(d), label: `${d}s` }))}
              value={String(dropDuration)}
              onChange={v => setDropDuration(Number(v))}
              disabled={isRunning}
            />
          </>
        ) : (
          <ToggleGroup
            label="Length"
            options={DURATIONS.map(d => ({ id: String(d), label: `${d}s` }))}
            value={String(duration)}
            onChange={v => setDuration(Number(v))}
            disabled={isRunning}
          />
        )}
        <div style={{ paddingLeft: 72, fontSize: 10, color: '#2a2a2a', letterSpacing: '0.1em' }}>
          ~{estMinutes} MIN
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 640, marginBottom: 12 }}>
        <div style={{
          background: '#0d0d15',
          border: `1px solid ${isRunning ? '#ff3c3c22' : '#1a1a1a'}`,
          borderRadius: 6,
          overflow: 'hidden',
        }}>
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

          <div
            ref={dropRef}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 12 }}
          >
            {imagePreview ? (
              <img src={styledPreview || imagePreview} alt="" style={{ width: 36, height: 36, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} />
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
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f).catch(err => setError(err.message)) }} />
          </div>

          {musicMode === 'my-song' && (
            <>
              <div style={{ height: 1, background: '#111' }} />
              <div style={{ padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => audioInputRef.current?.click()}
                    disabled={isRunning}
                    style={{
                      background: 'transparent', border: '1px solid #222', borderRadius: 3,
                      padding: '6px 12px', fontSize: 10, color: '#555', cursor: 'pointer',
                      fontFamily: 'inherit', letterSpacing: '0.1em', whiteSpace: 'nowrap',
                    }}
                  >
                    {audioFileName ? 'CHANGE AUDIO' : 'UPLOAD AUDIO'}
                  </button>
                  <span style={{ fontSize: 11, color: audioUrl ? '#666' : '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {audioFileName || 'MP3, WAV, or M4A (max 20MB)'}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 10, color: '#333', lineHeight: 1.5 }}>
                  Please only upload audio you own or have rights to use.
                </p>
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleAudioFile(f).catch(err => setError(err.message))
                  }}
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px 14px' }}>
            <span style={{ fontSize: 10, color: '#222', letterSpacing: '0.1em' }}>⌘ + ENTER</span>
            <button
              onClick={runPipeline}
              disabled={isRunning || !canDrop}
              style={{
                background: isRunning || !canDrop ? '#111' : '#ff3c3c',
                color: isRunning || !canDrop ? '#333' : '#fff',
                border: 'none', borderRadius: 3, padding: '8px 22px',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
                textTransform: 'uppercase', cursor: isRunning || !canDrop ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {isRunning ? 'RUNNING...' : 'DROP IT'}
            </button>
          </div>
        </div>
      </div>

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
              {isFlipbook && stage === STAGES.GENERATING_VIDEO ? 'GENERATING FRAMES' : (STAGE_LABELS[stage] || stage.toUpperCase())}
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

      {styledPreview && (
        <div style={{ width: '100%', maxWidth: 640, marginBottom: 16 }}>
          <div style={{ background: '#080810', border: '1px solid #111', borderRadius: 4, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src={styledPreview} alt="" style={{ width: 52, height: 52, borderRadius: 3, objectFit: 'cover' }} />
            <div>
              <div style={{ fontSize: 9, letterSpacing: '0.2em', color: '#ff3c3c', fontWeight: 700, marginBottom: 3 }}>▲ CHARACTER STYLED</div>
              <div style={{ fontSize: 11, color: '#333' }}>{isFlipbook ? 'Art style applied. Generating frames.' : 'Art style applied. Heading to Seedance.'}</div>
            </div>
          </div>
        </div>
      )}

      {prompts && (
        <div style={{ width: '100%', maxWidth: 640, marginBottom: 20, display: 'grid', gridTemplateColumns: `repeat(${Math.min(previewCount, 3)}, 1fr)`, gap: 6 }}>
          {previewKeys.map(({ key, label }) => (
            <div key={key} style={{ background: '#080810', border: '1px solid #111', borderRadius: 4, padding: '10px 12px' }}>
              <div style={{ fontSize: 8, letterSpacing: '0.2em', color: '#ff3c3c', fontWeight: 700, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 10, color: '#333', lineHeight: 1.6 }}>{prompts[key]?.slice(0, 100)}{prompts[key]?.length > 100 ? '...' : ''}</div>
            </div>
          ))}
        </div>
      )}

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

      <div style={{ width: '100%', maxWidth: 640, paddingBottom: 40, display: 'flex', justifyContent: 'center' }}>
        <a href="/terms" style={{ fontSize: 10, color: '#222', letterSpacing: '0.1em', textDecoration: 'none' }}>terms</a>
      </div>
    </div>
  )
}
