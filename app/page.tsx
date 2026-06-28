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
      addLog(`Seedance task submitted. Polling...`)

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
