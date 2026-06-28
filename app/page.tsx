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

      // Poll clip 1
      let videoUrl1 = null
      let taskId2 = null
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
          pollTaskId = taskId2
          addLog('Clip 1 ready. Generating clip 2 — the drop...')
          continue
        }

        if (pollData.status === 'completed') {
          const videoData = { videoUrl1, videoUrl2: pollData.videoUrl }
          addLog('Both clips ready.')

          // STEP 6: Manus sync
          setStage(STAGES.SYNCING)
          addLog('Sending to Manus for sync...')
          const syncRes = await fetch('/api/sync-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoUrl1: videoData.videoUrl1,
              videoUrl2: videoData.videoUrl2,
              audioUrl: musicData.audioUrl,
              beat: audioData,
              mode,
              songName: mode === 'song' ? songName : null,
              moment: mode === 'song' ? moment : null,
            }),
          })
          const syncData = await syncRes.json()
          if (syncData.error) throw new Error(syncData.error)
          setVideoUrl(syncData.videoUrl)
          addLog('Sync done.')
          setStage(STAGES.DONE)
          break
        }

        if (pollData.error) throw new Error(pollData.error)
      }

      throw new Error('Video generation timed out')
