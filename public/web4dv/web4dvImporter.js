// **********************************************************
//
// WEB4DV
// THREE.js plug-in for 4Dviews volumetric video sequences
//
// Version: 3.1.0
// Release date: October 2021
//
// Copyright: 4D View Solutions SAS
// Authors: M.Adam & T.Groubet
//
// NOTE:
// ADD: import WEB4DS from 'yourpath/web4dvImporter.js'
// in your main script
// Then create a WEB4DS object with the right parameters
// Call yourObject.load() to start the streaming
// OPTIONS:
// - yourObject.load( bool showPlaceholder, bool playOnload, callback() )
// Then you can call:
// - play/pause
// - mute/unmute
// - destroy
// - get some info like currentFrame or sequenceTotalLength
//
// **********************************************************

import {default as ResourceManagerXHR, Decoder4D} from './web4dvResource.js'
import {default as Model4D} from './model4D_Three.js'

// 4Dviews variables
const resourceManager = new ResourceManagerXHR()

// MAIN CLASS MANAGING A 4DS
export default class WEB4DS {
  constructor(id, urlD, urlM, urlA, position, renderer, scene, camera) {
	/** properties, options and status modifiable by user **/
	  
    // properties
    this.id = id  					// unique id
    this.urlD = urlD  				// url Desktop format
    this.urlM = urlM  				// url Mobile format
    this.urlA = urlA  				// url Audio
    this.position = position		//mesh position in scene
    this.renderer = renderer		//three.js rendrer reference
    this.scene = scene				//three.js scene reference
    this.camera = camera			//three.js camera reference

    this.model4D = new Model4D()	//three.js Object represneting the mesh 4d
    this.sequenceTotalLength = 0	//sequence number of frames
    this.sequenceDecodedFrames = 0	//current number of decoded meshes in the buffer

    // Options
    this.showPlaceholder = false	//show a place holder before the sequence is loaded
    this.playOnload = true			// play automatically when sequence is loaded

    // Status
    this.isLoaded = false
    this.isPlaying = false
    this.isAudioloaded = false
    this.isAudioplaying = false
    this.wasPlaying = true
    this.isDecoding = false
    this.isMuted = false
	
    this.currentMesh = null
    this.currentFrame = null


	/** internal data. Should not be modified by user **/

    // Audio
    this.audioListener = null
    this.audioSound = null
    this.audioLoader = null
    // for cross browser compatibility
    const AudioContext = window.AudioContext || window.webkitAudioContext
    this.audioCtx = new AudioContext()
    this.gainNode = null
    this.audioStartOffset = 0
    this.audioStartTime = 0
    this.audioPassedTime = 0
    this.audioTrack = null
    this.audioLevel = null

    // Loop functions
    this.playbackLoop = null
    this.decodeLoop = null

    this.frameOffset = 0

    // Waiter
    this.waiterParent = this.renderer.domElement
    this.waiterElemLogo = new Image(160, 160)  // Resized to 50%
    this.waiterLoaded = false

    if (this.waiterParent) {
      this.waiterParent.style.zIndex = '1'

      this.waiterElem = document.createElement('div')
      const waiterElemOpacity = 50

      this.waiterElem.id = 'web4dv-waiter'
      this.waiterElem.style.position = 'absolute'
      this.waiterElem.style.backgroundImage = 'red'
      this.waiterElem.style.top = '120px'  // Moved to upper part (was 50%)
      this.waiterElem.style.left = '50%'
      this.waiterElem.style.width = '160px'  // Resized to 50%
      this.waiterElem.style.height = '160px'  // Resized to 50%
      this.waiterElem.style.marginTop = '0px'  // Adjusted for top positioning
      this.waiterElem.style.marginLeft = '-80px'  // Adjusted to center (was -160px)
      this.waiterElem.style.opacity = (waiterElemOpacity / 100)
      this.waiterElem.style.zIndex = '2'

      this.waiterElemLogo.src = 'img/waiter.gif'

      if (this.waiterLoaded === false) {
        this.waiterParent.parentNode.insertBefore(this.waiterElem, this.waiterParent.nextSibling)
        this.waiterElem.appendChild(this.waiterElemLogo)
		const waiterHtml = document.getElementById('web4dv-waiter')
        waiterHtml.style.display = 'none'

        this.waiterLoaded = true
      }
    }
  }

  initSequence(nbFrames, nbBlocs, framerate, maxVertices, maxTriangles, textureEncoding, textureSizeX, textureSizeY, modelPosition) {
    const vertices = new Float32Array(maxVertices * 3)
    const uvs = new Float32Array(maxVertices * 2)
    const indices = new Uint32Array(maxTriangles * 3)
    const normals = new Float32Array(maxVertices * 3)

    this.model4D.initMesh(vertices, uvs, indices, normals, textureEncoding, textureSizeX, textureSizeY, modelPosition)

    this.scene.add(this.model4D.mesh)

    this.scene.add(this.model4D.surface)
    this.scene.add(this.model4D.light)

    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMapSoft = true
  }

  // methods
  load(showPlaceholder, playOnload, callback) {
    if (!this.isLoaded) {
      this.showPlaceholder = showPlaceholder
      this.playOnload = playOnload

      // Reset resource manager before loading new video
      if (typeof resourceManager.reset === 'function') {
        resourceManager.reset();
      }

      if (this.renderer.extensions.get('WEBGL_compressed_texture_astc')) {
        resourceManager.set4DSFile(this.urlM)
        Decoder4D.SetInputTextureEncoding(164)
      } else {
        resourceManager.set4DSFile(this.urlD)
        Decoder4D.SetInputTextureEncoding(100)
      }

      resourceManager.Open(() => {
        const si = resourceManager._sequenceInfo

        this.initSequence(si.NbFrames, si.NbBlocs, si.Framerate, si.MaxVertices, si.MaxTriangles, si.TextureEncoding, si.TextureSizeX, si.TextureSizeY, this.position)  // Get sequence information

        this.Decode()  // Start decoding, downloading

        // Poll for audio track to be loaded (embedded in .4ds file)
        let audioCheckAttempts = 0;
        const maxAudioCheckAttempts = 25; // 25 * 200ms = 5 seconds max
        const audioCheckInterval = setInterval(() => {
          audioCheckAttempts++;

          // Check if audio track has been populated by the streaming process
          const hasAudio = resourceManager._audioTrack
            && (resourceManager._audioTrack.byteLength > 0 || resourceManager._audioTrack.length > 0);

          if (hasAudio) {
            console.log('[WEB4DS] Audio track detected after', audioCheckAttempts * 200, 'ms, loading audio');
            clearInterval(audioCheckInterval);
            this.loadAudio(this.urlA);
          } else if (audioCheckAttempts >= maxAudioCheckAttempts) {
            console.log('[WEB4DS] Audio track not found after 5 seconds, giving up');
            clearInterval(audioCheckInterval);
            this.loadAudio(this.urlA); // Try anyway, will show "no audio" message
          }
        }, 200);

        const waiterHtml = document.getElementById('web4dv-waiter')

        const waiter = setInterval(() => {
          if (Decoder4D._meshesCache.length >= Decoder4D._maxCacheSize) {
            clearInterval(waiter)  // Stop the waiter loop

            if (this.waiterElem)  // Hide Waiter
            {
              waiterHtml.style.display = 'none'
            }

            if (showPlaceholder === true) {  // Placeholder equals frame 0
              // Display the frame 0
              this.currentMesh = Decoder4D._meshesCache.shift()
              this.currentFrame = this.currentMesh.frame
              this.updateSequenceMesh(this.currentMesh)
            } else {  // Else, play sequence
              if (this.playOnload === true || this.playOnload == null) {
                this.play()
              } else {
                // alert(`sequence is ready | showPlaceholder: ${this.showPlaceholder} | playOnload: ${this.playOnload}`)
              }
              if (callback) {
                callback()
              }
            }
          } else {
            // Start waiter animation
            if (this.waiterElem && !this.waiterDisplayed) {  // Display waiter
              waiterHtml.style.display = 'block'
              this.waiterDisplayed = true
            }
          }
        }, 0.1)

        this.isLoaded = true
        this.sequenceTotalLength = si.NbFrames
      })
    } else {
      alert('A sequence is already loaded. One sequence at a time.')
    }
  }

  updateSequenceMesh(mesh) {
    this.model4D.updateMesh(mesh.vertices, mesh.faces, mesh.uvs, mesh.normals, mesh.texture, mesh.nbVertices, mesh.nbFaces)
  }

  // Decode 4D Sequence
  Decode() {
    if (this.isDecoding) {
      return
    }

    const dt = 1000.0 / (resourceManager._sequenceInfo.FrameRate * 6)

    this.isDecoding = true

    /* Decoding loop, 3*fps */
    this.decodeLoop = setInterval(() => {

      /* Decode chunk */
      for (let i = 0; i < 6; i++) Decoder4D.DecodeChunk()

      /* If a few chunks, download more */
      const maxCache = resourceManager._sequenceInfo.NbFrames * 2 < 300 ? resourceManager._sequenceInfo.NbFrames * 2 : 300

      if (Decoder4D._chunks4D.length < maxCache || (Decoder4D._keepChunksInCache === true && Decoder4D._chunks4D.length < resourceManager._sequenceInfo.NbFrames * 2)) {
        resourceManager._internalCacheSize = 6000000  // 6 Mo

        resourceManager.getBunchOfChunks()
      }

      this.sequenceDecodedFrames = Decoder4D._meshesCache.length
    }, dt)
  }

  stopDecoding() {
    console.log('Stop decoding')
    clearInterval(this.decodeLoop)
    this.isDecoding = false
  }

  // For now, will pause any WEB4DV object created (function is generic)
  pause() {
    clearInterval(this.playbackLoop)
    this.isPlaying = false

    if (Decoder4D._meshesCache >= Decoder4D._maxCacheSize) {
      this.stopDecoding()
    }
    this.pauseAudio()
    this.frameOffset = this.currentFrame
  }

  // For now, will play any WEB4DV object created (function is generic)
  play(autoUpdate) {
    if (this.isPlaying) {  // If sequence is already playing, do nothing
      return
    }

    this.showPlaceholder = false

    // If not decoding, decode
    this.Decode()
    this.playAudio()

    this.isPlaying = true

    this.lastUpdateTime = 0

    this.startDate = Date.now() / 1000
    this.seqDuration = resourceManager._sequenceInfo.NbFrames / resourceManager._sequenceInfo.FrameRate
    this.timeOffset = this.frameOffset / resourceManager._sequenceInfo.FrameRate
	
	if (autoUpdate) {
		const dt = 1000.0 / (resourceManager._sequenceInfo.FrameRate)
		this.playbackLoop = setInterval (() => {
			this.update()
		}, dt)
	}
  }

  update() {
    if (!this.isPlaying) {
      return
    }

    let frameToDisplay = 0
    // if audio, base time on audio playback
    if (this.isAudioloaded) {
      if (this.isAudioplaying === true) {
        this.audioPassedTime = this.audioCtx.currentTime - this.audioStartTime

        // loop
        if ((this.audioStartOffset + this.audioPassedTime) > this.seqDuration) {
          this.audioStartTime += (this.seqDuration - this.audioStartOffset)
          this.audioPassedTime -= (this.seqDuration - this.audioStartOffset)
          this.audioStartOffset = 0
          this.currentFrame = -1
        }

        frameToDisplay = (this.audioStartOffset + this.audioPassedTime) * resourceManager._sequenceInfo.FrameRate
      }
    } else {  // no audio, base time on system
      let passedTime = (Date.now() / 1000) - this.startDate

      if ((this.timeOffset + passedTime) > this.seqDuration) {
        this.startDate += (this.seqDuration - this.timeOffset)
        passedTime -= (this.seqDuration - this.timeOffset)
        this.timeOffset = 0
        this.currentFrame = -1
      }

      frameToDisplay = (this.timeOffset + passedTime) * resourceManager._sequenceInfo.FrameRate
    }

    // get first mesh if needed
    if (this.currentMesh == null) {
      this.currentMesh = Decoder4D._meshesCache.shift()
      if (this.currentMesh) this.currentFrame = this.currentMesh.frame
    }

    while (this.currentMesh && this.currentFrame != parseInt(frameToDisplay) && Decoder4D._meshesCache.length > 0) {
      // this.currentMesh.delete()
      this.currentMesh = Decoder4D._meshesCache.shift()
      this.currentFrame = this.currentMesh.frame
    }

    if (this.currentFrame === -1) this.pauseAudio()
    else if (this.isAudioplaying === false) this.playAudio()

    if (!this.currentMesh) {
      return
    }

    /* update buffers for rendering */
    this.updateSequenceMesh(this.currentMesh)
  }

  loadAudio(audioFile) {
    if (typeof this.camera !== 'undefined') {
      console.log('[WEB4DS] Initializing audio system');
      this.model4D.initAudio(this.audioCtx)

      this.camera.add(this.model4D.audioListener)
      this.gainNode = this.audioCtx.createGain()

      // Debug: Check what audioTrack actually is
      console.log('[WEB4DS] audioFile:', audioFile);
      console.log('[WEB4DS] resourceManager._audioTrack type:', typeof resourceManager._audioTrack);
      console.log('[WEB4DS] resourceManager._audioTrack value:', resourceManager._audioTrack);
      console.log('[WEB4DS] resourceManager._audioTrack is Array:', Array.isArray(resourceManager._audioTrack));

      // Check for embedded audio - handle both ArrayBuffer (has byteLength) and Array (has length)
      const hasAudioTrack = typeof resourceManager._audioTrack !== 'undefined'
        && resourceManager._audioTrack !== null
        && (
          (resourceManager._audioTrack.byteLength && resourceManager._audioTrack.byteLength > 0) ||
          (Array.isArray(resourceManager._audioTrack) && resourceManager._audioTrack.length > 0)
        );

      if (audioFile !== '') {
        console.log('[WEB4DS] Loading external audio file:', audioFile)

        this.model4D.loadAudioFile(audioFile, this.isAudioloaded, () => {
          this.gainNode.gain.value = 1.0
          this.isAudioloaded = true
          console.log('[WEB4DS] External audio file loaded successfully');
        })
      } else if (hasAudioTrack) {
        const trackSize = resourceManager._audioTrack.byteLength || resourceManager._audioTrack.length || 0;
        console.log('[WEB4DS] Loading embedded audio track, size:', trackSize, 'bytes');

        this.audioCtx.decodeAudioData(resourceManager._audioTrack, (buffer) => {
          console.log('[WEB4DS] Audio decoded successfully, duration:', buffer.duration, 'channels:', buffer.numberOfChannels);
          this.model4D.setAudioBuffer(buffer)
          this.gainNode.gain.value = 1.0
          this.isAudioloaded = true
          console.log('[WEB4DS] Embedded audio loaded and ready');
        }, (error) => {
          console.error('[WEB4DS] Failed to decode audio:', error);
        })
      } else {
        console.log('[WEB4DS] No audio track found for this video');
      }
    } else {
      alert('Please add a camera to your scene or set your camera to var = camera. AudioListener not attached.')
    }
  }

  playAudio() {
    if (this.isAudioplaying === false) {
      // Check if audio is loaded and has buffer
      console.log('[WEB4DS] playAudio called - isAudioloaded:', this.isAudioloaded);
      console.log('[WEB4DS] model4D exists:', !!this.model4D);
      console.log('[WEB4DS] audioSound exists:', !!this.model4D?.audioSound);
      console.log('[WEB4DS] audioSound buffer exists:', !!this.model4D?.audioSound?.buffer);
      console.log('[WEB4DS] audioSound isPlaying:', this.model4D?.audioSound?.isPlaying);

      if (!this.isAudioloaded) {
        console.warn('[WEB4DS] Audio not loaded yet, skipping audio playback');
        return;
      }

      if (!this.model4D || !this.model4D.audioSound || !this.model4D.audioSound.buffer) {
        console.warn('[WEB4DS] Audio buffer not available, skipping audio playback');
        return;
      }

      // Resume audio context if suspended (browser autoplay policy)
      if (this.audioCtx.state === 'suspended') {
        console.log('[WEB4DS] Resuming suspended audio context');
        this.audioCtx.resume().then(() => {
          console.log('[WEB4DS] Audio context resumed successfully');
        }).catch(err => {
          console.error('[WEB4DS] Failed to resume audio context:', err);
        });
      }

      this.audioTrack = this.audioCtx.createBufferSource()
      this.audioTrack.loop = true
      this.audioTrack.buffer = this.model4D.audioSound.buffer
      this.audioTrack.connect(this.gainNode)
      this.gainNode.connect(this.audioCtx.destination)
      if (this.isMuted) this.gainNode.gain.value = 0

      this.audioStartOffset = this.currentFrame / resourceManager._sequenceInfo.FrameRate

      console.log('[WEB4DS] Starting audio playback at offset:', this.audioStartOffset, 'context time:', this.audioCtx.currentTime);
      this.audioTrack.start(this.audioCtx.currentTime, this.audioStartOffset)

      this.isAudioplaying = true
      this.audioStartTime = this.audioCtx.currentTime
      console.log('[WEB4DS] Audio playback started successfully');
    }
  }

  pauseAudio() {
    if (this.isAudioplaying === true) {
      if (this.audioTrack) this.audioTrack.stop()

      this.isAudioplaying = false
    }
  }

  restartAudio() {
    console.log('restart audio playback')
    if (this.audioTrack) this.audioTrack.stop()
    this.isAudioplaying = false
    this.audioPassedTime = 0

    this.playAudio()
  }

  // For now, will mute any WEB4DV object created (function is generic)
  mute() {
    this.audioLevel = this.gainNode.gain.value
    console.log(`volume will be set back at:${this.audioLevel}`)

    this.gainNode.gain.value = 0
    this.isMuted = true
  }

  // For now, will unmute any WEB4DV object created (function is generic)
  unmute() {
    this.isMuted = false

    if (this.audioLevel) {
      this.gainNode.gain.value = this.audioLevel
    } else {
      this.gainNode.gain.value = 0.5
    }
  }

  keepsChunksInCache(booleanVal) {
    Decoder4D._keepChunksInCache = booleanVal
  }

  setChunkSize(sizeInBytes) {
    // Allow dynamic chunk size configuration
    // Default is 6MB, can be increased for desktop or decreased for mobile
    if (sizeInBytes && sizeInBytes > 0) {
      resourceManager._internalCacheSize = sizeInBytes
      console.log(`[WEB4DS] Chunk size set to ${(sizeInBytes / 1000000).toFixed(2)}MB`)
    }
  }

  setMaxCacheSize(maxSize) {
    // Configure maximum cache size (number of decoded frames)
    if (maxSize && maxSize > 0) {
      Decoder4D._maxCacheSize = maxSize
      console.log(`[WEB4DS] Max cache size set to ${maxSize} frames`)
    }
  }

  setWaitingGif(url) {
	  this.waiterElemLogo.src = url;
  }
  
  destroy(callback) {
    clearInterval(this.playbackLoop)
    this.stopDecoding()
    // clearInterval(renderLoop); // No more needed: renderLoop is managed outside

    if (this.model4D.audioSound) {
      if (this.audioTrack) {
        this.audioTrack.stop()
      }

      this.model4D.audioLoader = null
      this.model4D.audioSound = null
      this.model4D.audioListener = null

      this.audioStartTime = 0
      this.audioStartOffset = 0
      this.audioPassedTime = 0
    }

    resourceManager.reinitResources()

    if (this.isLoaded) {
      this.scene.remove(this.model4D.mesh)
    }

    this.isLoaded = false
    this.isPlaying = false
    this.isDecoding = false
    this.isAudioplaying = false
    this.isAudioloaded = false

    this.currentMesh = null

    Decoder4D._meshesCache = []
    Decoder4D._chunks4D = []

    // Reset Sequence Infos
    this.currentFrame = 0
    this.sequenceTotalLength = 0
    this.sequenceDecodedFrames = 0

    // Callback
    if (callback) {
      callback()
    }
  }
}
