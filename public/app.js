import WEB4DS from "./web4dv/web4dvImporter.js";

// Performance constants - balanced for stability and performance
const CHUNK_SIZE_MOBILE = 4 * 1024 * 1024;      // 4MB for mobile
const CHUNK_SIZE_DESKTOP = 12 * 1024 * 1024;    // 12MB for desktop
const CHUNK_SIZE_DESKTOP_LARGE = 12 * 1024 * 1024; // 12MB for large files
const CACHE_SIZE_MOBILE = 20;                    // 20 frames mobile cache
const CACHE_SIZE_DESKTOP = 45;                   // 45 frames desktop cache
const CACHE_SIZE_DESKTOP_LARGE = 35;             // 35 frames large file cache
const PROGRESS_POLL_INTERVAL = 750;              // ms
const RESIZE_DEBOUNCE_DELAY = 150;               // ms

const VIDEO_LIBRARY = {
  "dance-nani": {
    name: "Topeng Losari",
    desktop: "https://storage.googleapis.com/spectralysium-volumetrik-4ds-files/DANCE/Nani_Take_02_30_00fps_FILTERED_DESKTOP_720.4ds",
    mobile: "https://storage.googleapis.com/spectralysium-volumetrik-4ds-files/DANCE/Nani_Take_02_30_00fps_FILTERED_MOBILE_720.4ds",
    position: [0, 0, 0]
  },
  "dance-didik": {
    name: "Dua Muka",
    desktop: "https://storage.googleapis.com/spectralysium-volumetrik-4ds-files/DANCE/Didik_Take_01_30_00fps_FILTERED_DESKTOP_720.4ds",
    mobile: "https://storage.googleapis.com/spectralysium-volumetrik-4ds-files/DANCE/Didik_Take_01_30_00fps_FILTERED_MOBILE_720-002.4ds",
    position: [0, 0, 0],
    isLarge: true,
    maxWaitMs: 480000
  },
  "martial-asep": {
    name: "Golok Panglipur",
    desktop: "https://storage.googleapis.com/spectralysium-volumetrik-4ds-files/MARTIAL_ART/Asep_Take_02_30_00fps_FILTERED_DESKTOP_720.4ds",
    mobile: "https://storage.googleapis.com/spectralysium-volumetrik-4ds-files/MARTIAL_ART/Asep_Take_02_30_00fps_FILTERED_MOBILE_720.4ds",
    position: [0, 0, 0]
  },
  "martial-dian": {
    name: "Kipas Panglipur",
    desktop: "https://storage.googleapis.com/spectralysium-volumetrik-4ds-files/MARTIAL_ART/Dian_Take_02_30_00fps_FILTERED_DESKTOP_720.4ds",
    mobile: "https://storage.googleapis.com/spectralysium-volumetrik-4ds-files/MARTIAL_ART/Dian_Take_02_30_00fps_FILTERED_MOBILE_720.4ds",
    position: [0, 0, 0]
  },
  "martial-duel": {
    name: "Duel Panglipur",
    desktop: "https://storage.googleapis.com/spectralysium-volumetrik-4ds-files/MARTIAL_ART/Duel_Take_02_30_00fps_FILTERED_DESKTOP_720.4ds",
    mobile: "https://storage.googleapis.com/spectralysium-volumetrik-4ds-files/MARTIAL_ART/Duel_Take_02_30_00fps_FILTERED_MOBILE_720.4ds",
    position: [0, 0, 0]
  }
};

const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

let videoButtons = [];
const progressDisplays = {};

let timelineEl;
let timelineSlider;
let timeCurrentEl;
let timeTotalEl;

const videoProgressState = {};

let canvas;
let container;
let renderer;
let scene;
let camera;
let controls;

let currentSequence = null;
let currentVideoId = 'dance-nani';
let isPlaying = false;
let isMuted = false;
let isARMode = false;
let userDraggingTimeline = false;
let reticle = null;
let hitTestSource = null;
let hitTestSourceRequested = false;
let progressTimer = null;
let loadingTimeout = null;
let isLoadingVideo = false;

let loadingEl;
let loadingOverlayEl;
let progressFillEl;
let frameCurrentEl;
let frameTotalEl;
let frameBufferedEl;
let instructionsEl;

let hasInitialized = false;
let resizeTimeout = null;
let arEventListenersAdded = false;
let lastFrameUpdate = -1;
let arPlacedMeshes = []; // Track meshes placed in AR mode
let arTouchState = {
  touches: [],
  initialDistance: 0,
  initialScale: 1,
  selectedMesh: null,
  isDragging: false
};

function init() {
  if (hasInitialized) return;
  hasInitialized = true;
  console.log('[Volumetrik] Initializing player');

  videoButtons = Array.from(document.querySelectorAll('.video-btn'));
  Object.keys(progressDisplays).forEach((key) => delete progressDisplays[key]);
  document.querySelectorAll('.video-progress').forEach((el) => {
    if (!el.dataset || !el.dataset.progress) {
      return;
    }
    progressDisplays[el.dataset.progress] = el;
  });

  timelineEl = document.getElementById('timeline');
  timelineSlider = document.getElementById('timeline-slider');
  timeCurrentEl = document.getElementById('time-current');
  timeTotalEl = document.getElementById('time-total');
  loadingEl = document.getElementById('loading');
  loadingOverlayEl = document.getElementById('loading-overlay');
  progressFillEl = document.getElementById('progress-fill');
  frameCurrentEl = document.getElementById('frame-current');
  frameTotalEl = document.getElementById('frame-total');
  frameBufferedEl = document.getElementById('frame-buffered');
  instructionsEl = document.getElementById('instructions');

  // Combined iteration - performance optimization
  Object.keys(VIDEO_LIBRARY).forEach((id) => {
    videoProgressState[id] = { status: 'idle', decoded: 0, total: 0 };
    updateVideoProgressDisplay(id);
  });

  canvas = document.getElementById('canvas4D');
  if (!canvas) {
    throw new Error('Canvas element with id #canvas4D was not found');
  }
  container = canvas.parentElement || document.body;

  setupRenderer();
  setupScene();
  setupARButton();
  setupEventListeners();
  resetTimeline();
  setActiveVideoButton(currentVideoId);

  window.addEventListener('resize', onWindowResize);

  if (instructionsEl) {
    setTimeout(() => instructionsEl.classList.add('show'), 500);
  }

  animate();
  loadVideo(currentVideoId);
}
function setupRenderer() {
  let context;
  if (WEBGL.isWebGL2Available()) {
    context = canvas.getContext('webgl2');
    renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true });
    console.log('[Volumetrik] Using WebGL2 context');
  } else if (WEBGL.isWebGLAvailable()) {
    context = canvas.getContext('webgl');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    console.log('[Volumetrik] Using WebGL1 context');
  } else {
    const warning = WEBGL.getWebGLErrorMessage();
    container.appendChild(warning);
    throw new Error('WebGL is not available on this device');
  }

  renderer.setSize(container.offsetWidth, container.offsetHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.xr.enabled = true;
}

function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  camera = new THREE.PerspectiveCamera(60, container.offsetWidth / container.offsetHeight, 0.1, 100);
  camera.position.set(0, 1.5, 3);
  scene.add(camera);

  controls = new THREE.OrbitControls(camera, container);
  controls.target.set(0, 1, 0);
  controls.minDistance = 1.5;
  controls.maxDistance = 8;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(5, 10, 5);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x8899ff, 0.6);
  fillLight.position.set(-3, 6, -6);
  scene.add(fillLight);

  const ambient = new THREE.AmbientLight(0x505050, 0.8);
  scene.add(ambient);

  const gridHelper = new THREE.GridHelper(10, 10, 0x667eea, 0x444444);
  gridHelper.name = 'grid';
  scene.add(gridHelper);
}

function setupEventListeners() {
  videoButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const videoId = btn.dataset.video;
      if (!videoId || videoId === currentVideoId) {
        return;
      }
      setActiveVideoButton(videoId);
      loadVideo(videoId, { resumePlayback: true });
    });
  });

  const playBtn = document.getElementById('btn-play');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (currentSequence) {
        currentSequence.play(true);
        isPlaying = true;
      }
    });
  }

  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      if (currentSequence) {
        currentSequence.pause();
        isPlaying = false;
      }
    });
  }

  const restartBtn = document.getElementById('btn-restart');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      seekToFrame(0);
    });
  }

  const muteBtn = document.getElementById('btn-mute');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      if (!currentSequence) return;
      if (isMuted) {
        currentSequence.unmute();
        muteBtn.textContent = '\u{1F50A}';
      } else {
        currentSequence.mute();
        muteBtn.textContent = '\u{1F507}';
      }
      isMuted = !isMuted;
    });
  }

  if (timelineSlider) {
    const commitSeek = () => {
      if (timelineSlider.disabled) {
        userDraggingTimeline = false;
        return;
      }
      const targetFrame = Math.max(0, Math.round(Number(timelineSlider.value) || 0));
      userDraggingTimeline = false;
      seekToFrame(targetFrame);
    };

    timelineSlider.addEventListener('pointerdown', () => {
      if (!timelineSlider.disabled) {
        userDraggingTimeline = true;
      }
    });

    timelineSlider.addEventListener('input', () => {
      if (timelineSlider.disabled) return;
      userDraggingTimeline = true;
      const frameValue = Math.round(Number(timelineSlider.value) || 0);
      updateTimelineLabels(frameValue, Number(timelineSlider.max) + 1);
    });

    timelineSlider.addEventListener('change', commitSeek);
    timelineSlider.addEventListener('pointerup', commitSeek);
    timelineSlider.addEventListener('keyup', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        commitSeek();
      }
    });
  }
}

function setActiveVideoButton(videoId) {
  videoButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.video === videoId);
  });
}

function loadVideo(videoId, options = {}) {
  // Exit AR mode if active before switching videos
  if (isARMode && renderer && renderer.xr && renderer.xr.isPresenting) {
    console.log('[Volumetrik] Exiting AR mode before switching videos');
    try {
      renderer.xr.getSession().end();
    } catch (error) {
      console.warn('[Volumetrik] Error ending AR session:', error);
    }
  }

  // If another load is already underway, cancel it so we can switch quickly
  if (isLoadingVideo) {
    console.log('[Volumetrik] Cancelling in-progress load for', currentVideoId);

    // Clear all timers to prevent race conditions
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      loadingTimeout = null;
    }

    // Destroy current sequence safely
    if (currentSequence) {
      try {
        currentSequence.destroy();
      } catch (destroyError) {
        console.warn('[Volumetrik] Error destroying sequence during cancel', destroyError);
      } finally {
        currentSequence = null;
      }
    }

    isLoadingVideo = false;
  }

  const fallbackId = Object.keys(VIDEO_LIBRARY)[0];
  const targetVideoId = videoId || currentVideoId || fallbackId;
  const videoConfig = VIDEO_LIBRARY[targetVideoId];
  if (!videoConfig) {
    console.error('[Volumetrik] Video not found', videoId);
    openLoadingPanel();
    renderLoadingTemplate({
      heading: 'Video unavailable',
      headingColor: '#ff6b6b',
      description: `The requested video identifier "${String(videoId || targetVideoId)}" was not found.`,
      detailItems: ['Please pick another performance from the menu.'],
      showSpinner: false,
      showCloseButton: true
    });
    return;
  }

  const startFrame = Math.max(0, Math.floor(options.startFrame || 0));
  const resumePlayback = options.resumePlayback !== undefined ? !!options.resumePlayback : true;

  // Clear any existing timers to prevent orphaned intervals
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }

  isLoadingVideo = true;
  currentVideoId = targetVideoId;
  if (!options.preserveSelection) {
    setActiveVideoButton(targetVideoId);
  }
  isPlaying = resumePlayback;

  if (!loadingEl || !loadingOverlayEl) {
    console.error('[Volumetrik] UI not ready');
    isLoadingVideo = false;
    return;
  }

  showLoadingPanel(videoConfig, startFrame);
  resetTimeline();
  setVideoProgress(targetVideoId, { status: 'loading', decoded: 0, total: 0 });

  const create = () => createSequence(targetVideoId, videoConfig, { startFrame, resumePlayback });

  if (currentSequence) {
    const seq = currentSequence;
    currentSequence = null;
    try {
      seq.destroy(create);
    } catch (error) {
      console.warn('[Volumetrik] destroy failed', error);
      create();
    }
  } else {
    create();
  }
}

function openLoadingPanel() {
  if (loadingOverlayEl) loadingOverlayEl.classList.add('show');
  if (loadingEl) loadingEl.classList.add('show');
}

function hideLoadingPanel() {
  if (loadingOverlayEl) loadingOverlayEl.classList.remove('show');
  if (loadingEl) {
    loadingEl.classList.remove('show');
    loadingEl.innerHTML = '';
  }
}

function renderLoadingTemplate({
  heading = '',
  description = '',
  detailItems = [],
  footnote = '',
  showSpinner = true,
  showCloseButton = false,
  headingColor = 'inherit'
}) {
  if (!loadingEl) return;

  const spinnerMarkup = showSpinner ? '<div class="spinner"></div>' : '';
  const headingMarkup = heading
    ? `<div style="font-weight: 600; font-size: 18px; margin-bottom: 8px; color: ${headingColor};">${heading}</div>`
    : '';
  const descriptionMarkup = description
    ? `<div style="font-size: 14px; margin-top: 6px; line-height: 1.5;">${description}</div>`
    : '';
  const detailsMarkup = Array.isArray(detailItems)
    ? detailItems
        .filter(Boolean)
        .map(
          (item) =>
            `<div style="font-size: 13px; margin-top: 6px; line-height: 1.5; opacity: 0.85;">${item}</div>`
        )
        .join('')
    : '';
  const footnoteMarkup = footnote
    ? `<div style="font-size: 12px; margin-top: 10px; opacity: 0.75; line-height: 1.4;">${footnote}</div>`
    : '';
  const closeMarkup = showCloseButton
    ? '<button type="button" class="loading-close" style="margin-top: 20px; padding: 12px 24px; background: white; color: #333; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">Close</button>'
    : '';

  loadingEl.innerHTML = `
    ${spinnerMarkup}
    ${headingMarkup}
    ${descriptionMarkup}
    ${detailsMarkup}
    ${footnoteMarkup}
    ${closeMarkup}
  `;

  const closeBtn = loadingEl.querySelector('.loading-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideLoadingPanel);
  }
}

function renderLoadingProgress({ heading = 'Loading ...', decoded = 0, total = 0, elapsedSec = 0, waitHint = '' }) {
  const decodedLabel = Number.isFinite(decoded) ? decoded.toLocaleString('en-US') : '--';
  const totalLabel = Number.isFinite(total) && total > 0 ? total.toLocaleString('en-US') : '--';
  const percent = total > 0 ? Math.min(100, Math.round((decoded / total) * 100)) : 0;
  const percentLabel = total > 0 ? `${percent}%` : '';
  const elapsedLabel = elapsedSec > 0 ? formatElapsed(elapsedSec) : null;

  const detailItems = [];
  if (elapsedLabel) {
    detailItems.push(`Time elapsed: <strong>${elapsedLabel}</strong>`);
  }

  openLoadingPanel();
  renderLoadingTemplate({
    heading,
    description:
      total > 0
        ? `Decoded <strong>${decodedLabel}</strong> of <strong>${totalLabel}</strong> frames${percentLabel ? ` (${percentLabel})` : ''}`
        : 'Preparing volumetric assets...',
    detailItems,
    footnote: waitHint,
    showSpinner: true,
    showCloseButton: false
  });
}

function showLoadingPanel(videoConfig, startFrame) {
  if (!loadingEl || !loadingOverlayEl) return;
  const waitHint = getWaitHint(videoConfig, startFrame);
  openLoadingPanel();
  renderLoadingTemplate({
    heading: 'Loading ...',
    description: 'Preparing volumetric assets...',
    footnote: waitHint,
    showSpinner: true,
    showCloseButton: false
  });
}

function getWaitHint(videoConfig, startFrame) {
  if (videoConfig.isLarge) {
    if (startFrame > 0) {
      return 'Large file (~3 GB). Seeking to the requested position, please keep the device awake.';
    }
    return 'Large file (~3 GB). First load can take up to 2-3 minutes on mobile. Keep the device awake and ensure a reliable connection.';
  }
  return 'This may take 10-30 seconds depending on your network speed.';
}

function createSequence(videoId, videoConfig, options = {}) {
  const startFrame = Math.max(0, Math.floor(options.startFrame || 0));
  const resumePlayback = options.resumePlayback !== undefined ? !!options.resumePlayback : true;
  const hasRendererExtensions = renderer && renderer.extensions && typeof renderer.extensions.get === 'function';
  const supportsAstc = hasRendererExtensions && !!renderer.extensions.get('WEBGL_compressed_texture_astc');
  const defaultUrl = videoConfig.desktop || videoConfig.mobile || '';
  const mobileUrl = videoConfig.mobile || defaultUrl;
  const primaryUrl = IS_MOBILE && supportsAstc && mobileUrl ? mobileUrl : defaultUrl;

  try {
    currentSequence = new WEB4DS(
      videoId,
      primaryUrl,
      mobileUrl,
      '',
      videoConfig.position,
      renderer,
      scene,
      camera
    );

    currentSequence.startFrame = startFrame;

    // Optimize caching based on device and file size
    const isLargeFile = videoConfig.isLarge || false;

    if (IS_MOBILE) {
      // Mobile: streaming mode to prevent memory issues
      currentSequence.keepsChunksInCache(false);
      currentSequence.setChunkSize(CHUNK_SIZE_MOBILE);
      currentSequence.setMaxCacheSize(CACHE_SIZE_MOBILE);
      console.log('[Volumetrik] Mobile:', (CHUNK_SIZE_MOBILE / 1024 / 1024).toFixed(1), 'MB chunks,', CACHE_SIZE_MOBILE, 'frame cache');
    } else {
      // Desktop: larger chunks for better performance
      if (isLargeFile) {
        // Large desktop files: streaming mode for memory safety
        currentSequence.keepsChunksInCache(false);
        currentSequence.setChunkSize(CHUNK_SIZE_DESKTOP_LARGE);
        currentSequence.setMaxCacheSize(CACHE_SIZE_DESKTOP_LARGE);
        console.log('[Volumetrik] Desktop large:', (CHUNK_SIZE_DESKTOP_LARGE / 1024 / 1024).toFixed(1), 'MB chunks,', CACHE_SIZE_DESKTOP_LARGE, 'frame cache');
      } else {
        // Normal desktop files: full caching for smooth playback
        currentSequence.keepsChunksInCache(true);
        currentSequence.setChunkSize(CHUNK_SIZE_DESKTOP);
        currentSequence.setMaxCacheSize(CACHE_SIZE_DESKTOP);
        console.log('[Volumetrik] Desktop normal:', (CHUNK_SIZE_DESKTOP / 1024 / 1024).toFixed(1), 'MB chunks,', CACHE_SIZE_DESKTOP, 'frame cache');
      }
    }

    currentSequence.shouldResumePlayback = resumePlayback;

    try {
      if (typeof currentSequence.setWaitingGif === 'function') {
        currentSequence.setWaitingGif('./web4dv/waiter/waiter.gif');
      }
    } catch (error) {
      console.warn('[Volumetrik] Unable to set waiting gif', error);
    }

    const waitHint = getWaitHint(videoConfig, startFrame);
    const maxWaitMs = videoConfig.maxWaitMs || (videoConfig.isLarge ? 240000 : 90000);
    const loadStart = performance.now ? performance.now() : Date.now();

    console.log('[Volumetrik] Starting decode', { videoId, startFrame, resumePlayback });
    currentSequence.load(true, false);

    progressTimer = setInterval(() => {
      // Safety check - clear if sequence destroyed
      if (!currentSequence) {
        if (progressTimer) {
          clearInterval(progressTimer);
          progressTimer = null;
        }
        isLoadingVideo = false;
        return;
      }

      const decoded = currentSequence.sequenceDecodedFrames || 0;
      const total = currentSequence.sequenceTotalLength || 0;
      setVideoProgress(videoId, { status: 'loading', decoded, total });

      // Stop polling when loaded - performance optimization
      if (currentSequence.isLoaded) {
        if (progressTimer) {
          clearInterval(progressTimer);
          progressTimer = null;
        }
        finalizeLoad(videoId, videoConfig, startFrame);
        return;
      }

      const elapsedMs = (performance.now ? performance.now() : Date.now()) - loadStart;
      const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
      renderLoadingProgress({ decoded, total, elapsedSec, waitHint });
    }, PROGRESS_POLL_INTERVAL);

    loadingTimeout = setTimeout(() => {
      if (!currentSequence || currentSequence.isLoaded) {
        isLoadingVideo = false;
        return;
      }
      console.warn('[Volumetrik] Loading timeout');
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
      isLoadingVideo = false;
      setVideoProgress(videoId, { status: 'error' });
      renderLoadingTemplate({
        heading: 'Loading Timeout',
        headingColor: '#ff6b6b',
        description: 'We could not finish loading this volumetric recording in time.',
        detailItems: [
          'Please ensure a stable connection, keep the device awake, and try again.'
        ],
        footnote: waitHint,
        showSpinner: false,
        showCloseButton: true
      });
    }, maxWaitMs);
  } catch (error) {
    console.error('[Volumetrik] Failed to create sequence', error);
    isLoadingVideo = false;
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      loadingTimeout = null;
    }
    openLoadingPanel();
    renderLoadingTemplate({
      heading: 'Unexpected error',
      headingColor: '#ff6b6b',
      description: 'Something went wrong while preparing this volumetric recording. Please try again.',
      showSpinner: false,
      showCloseButton: true
    });
    setVideoProgress(videoId, { status: 'error' });
  }
}

function finalizeLoad(videoId, videoConfig, startFrame) {
  if (!currentSequence) {
    isLoadingVideo = false;
    return;
  }

  hideLoadingPanel();

  // Clear timeout since loading completed successfully
  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }

  isLoadingVideo = false;

  const totalFrames = currentSequence.sequenceTotalLength || 0;
  const frameRate = currentSequence.frameRate || 30;
  setVideoProgress(videoId, { status: 'ready', decoded: totalFrames, total: totalFrames });
  prepareTimeline(totalFrames, frameRate, startFrame);

  if (currentSequence.shouldResumePlayback === false) {
    currentSequence.pause();
    isPlaying = false;
  } else {
    currentSequence.play(true);
    isPlaying = true;
  }

  if (isMuted) {
    currentSequence.mute();
  }
}

function seekToFrame(targetFrame) {
  if (!currentSequence || !currentSequence.isLoaded) {
    console.warn('[Volumetrik] Cannot seek - sequence not loaded');
    return;
  }

  const totalFrames = currentSequence.sequenceTotalLength || 0;
  const frameRate = currentSequence.frameRate || 30;
  const clampedFrame = Math.max(0, Math.min(targetFrame, totalFrames - 1));

  console.log('[Volumetrik] Seeking to frame', clampedFrame);

  // Update the frame offset which controls playback position
  currentSequence.frameOffset = clampedFrame;

  // If playing, we need to restart the playback from the new position
  if (isPlaying) {
    currentSequence.pause();
    currentSequence.play(true);
  } else {
    // If paused, update the current frame for display
    currentSequence.currentFrame = clampedFrame;
  }

  // Update timeline UI
  if (timelineSlider && !timelineSlider.disabled) {
    timelineSlider.value = clampedFrame;
    updateTimelineLabels(clampedFrame, totalFrames, frameRate);
  }
}

function setVideoProgress(videoId, patch) {
  const previous = videoProgressState[videoId] || { status: 'idle', decoded: 0, total: 0 };
  const next = { ...previous, ...patch };
  videoProgressState[videoId] = next;
  updateVideoProgressDisplay(videoId);
}

function updateVideoProgressDisplay(videoId) {
  const display = progressDisplays[videoId];
  if (!display) return;
  const state = videoProgressState[videoId];
  if (!state) {
    display.textContent = '--';
    return;
  }
  if (state.status === 'error') {
    display.textContent = 'Error';
    return;
  }
  if (state.total > 0) {
    const pct = Math.min(100, Math.round((state.decoded / state.total) * 100));
    display.textContent = pct >= 100 ? 'Ready' : `${pct}%`;
  } else if (state.status === 'loading') {
    display.textContent = '...';
  } else if (state.status === 'ready') {
    display.textContent = 'Ready';
  } else {
    display.textContent = '--';
  }
}

function resetTimeline() {
  if (!timelineSlider) return;
  timelineSlider.disabled = true;
  timelineSlider.value = 0;
  timelineSlider.max = 1;
  userDraggingTimeline = false;
  if (timelineEl) timelineEl.style.display = 'none';
  if (timeCurrentEl) timeCurrentEl.textContent = '00:00';
  if (timeTotalEl) timeTotalEl.textContent = '00:00';
}

function prepareTimeline(totalFrames, frameRate, startFrame) {
  if (!timelineSlider) return;
  const effectiveTotal = Math.max(totalFrames, 1);
  timelineSlider.disabled = false;
  timelineSlider.max = Math.max(effectiveTotal - 1, 1);
  timelineSlider.value = Math.min(Math.max(startFrame, 0), Number(timelineSlider.max));
  userDraggingTimeline = false;
  if (timelineEl) timelineEl.style.display = 'flex';
  updateTimelineLabels(Number(timelineSlider.value), effectiveTotal, frameRate);
}

function updateTimelineLabels(currentFrame, totalFrames, frameRateOverride) {
  if (!timeCurrentEl || !timeTotalEl) return;
  const rate = frameRateOverride || (currentSequence ? currentSequence.frameRate || 30 : 30);
  const total = totalFrames || (currentSequence ? currentSequence.sequenceTotalLength || 0 : 0);
  timeCurrentEl.textContent = formatTime(currentFrame / rate);
  timeTotalEl.textContent = formatTime(total / rate);
}

function formatElapsed(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins > 0) {
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${secs}s`;
}

function formatTime(totalSeconds) {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const rem = secs % 60;
  const remStr = rem.toString().padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${remStr}`;
  }
  return `${mins.toString().padStart(2, '0')}:${remStr}`;
}

function setupARButton() {
  const arButton = document.getElementById('ar-button');

  if (!arButton) {
    console.log('[Volumetrik] AR button not found');
    return;
  }

  if (!('xr' in navigator)) {
    console.log('[Volumetrik] WebXR not available in this browser');
    arButton.style.display = 'none';
    return;
  }

  navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
    if (!supported) {
      console.log('[Volumetrik] AR not supported on this device');
      arButton.style.display = 'none';
      return;
    }

    console.log('[Volumetrik] AR is supported! Showing AR button');
    arButton.style.display = 'flex';

    // Add click handler to start/end AR session (only once)
    arButton.onclick = async () => {
      console.log('[Volumetrik] AR button clicked');

      if (!renderer.xr.isPresenting) {
        // Start AR session
        try {
          let session;

          // Try basic AR session with proper reference space handling
          console.log('[Volumetrik] Requesting AR session...');

          try {
            // Attempt 1: Try with local-floor reference space (better tracking)
            session = await navigator.xr.requestSession('immersive-ar', {
              optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
            });
            console.log('[Volumetrik] AR session granted with local-floor');
            // Use local-floor reference space for better tracking
            renderer.xr.setReferenceSpaceType('local-floor');
          } catch (e) {
            console.warn('[Volumetrik] local-floor AR failed, trying viewer mode:', e.message);

            // Attempt 2: Fallback to viewer reference space (more compatible)
            try {
              session = await navigator.xr.requestSession('immersive-ar', {});
              console.log('[Volumetrik] AR session granted with viewer mode');
              // Use viewer reference space for devices that don't support local-floor
              renderer.xr.setReferenceSpaceType('viewer');
            } catch (e2) {
              // Provide helpful error message
              throw new Error('Your device reports AR support but cannot create an AR session. This may be due to:\n\n' +
                '1. Missing or outdated ARCore/ARKit\n' +
                '2. Camera permissions not granted\n' +
                '3. Browser version too old (needs Chrome 79+)\n' +
                '4. Device limitation\n\n' +
                'Original error: ' + e2.message);
            }
          }

          console.log('[Volumetrik] Setting up renderer for AR...');
          await renderer.xr.setSession(session);
          console.log('[Volumetrik] AR session active!');
        } catch (error) {
          console.error('[Volumetrik] AR session failed:', error);
          alert('Unable to start AR\n\n' + error.message);
        }
      } else {
        // End AR session
        console.log('[Volumetrik] Ending AR session');
        renderer.xr.getSession().end();
      }
    };

    // Add event listeners only once - prevent duplicates
    if (!arEventListenersAdded) {
      renderer.xr.addEventListener('sessionstart', onARSessionStart);
      renderer.xr.addEventListener('sessionend', onARSessionEnd);
      arEventListenersAdded = true;
      console.log('[Volumetrik] AR event listeners registered');
    }
  }).catch((error) => {
    console.error('[Volumetrik] WebXR support check failed:', error);
    arButton.style.display = 'none';
  });
}

function onARSessionStart() {
  console.log('[Volumetrik] AR session started');
  isARMode = true;

  // Enable passthrough: make background transparent to show camera feed
  scene.background = null;

  // Hide the grid in AR mode
  const grid = scene.getObjectByName('grid');
  if (grid) grid.visible = false;

  // Place the volumetric actor 1 meter in front of user
  if (currentSequence && currentSequence.isLoaded && currentSequence.model4D && currentSequence.model4D.mesh) {
    const mesh = currentSequence.model4D.mesh;

    // Get camera position and direction
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    // Position 1 meter in front of camera, facing the user
    const distance = 1.0; // 1 meter
    mesh.position.copy(camera.position).add(cameraDirection.multiplyScalar(distance));
    mesh.position.y = camera.position.y - 0.5; // Lower it a bit so it's not at eye level

    // Make actor face the camera
    mesh.lookAt(camera.position);

    // Scale appropriately for AR
    mesh.scale.set(0.3, 0.3, 0.3);

    // Add to arPlacedMeshes so touch gestures can manipulate it
    arPlacedMeshes.push(mesh);

    console.log('[Volumetrik] AR: Positioned actor 1m in front of user');
  }

  // Set up hit test reticle for placing additional copies
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', onARSelect);
  scene.add(controller);

  // Add touch gesture handlers for AR transform controls
  setupARGestureControls();

  // Change AR button to show "VR" to exit AR mode
  const arButton = document.getElementById('ar-button');
  if (arButton) {
    arButton.textContent = 'VR';
    arButton.title = 'Exit AR and return to VR mode';
  }
}

function onARSessionEnd() {
  console.log('[Volumetrik] AR session ended');
  isARMode = false;
  hitTestSourceRequested = false;
  hitTestSource = null;

  // Remove AR gesture controls
  document.removeEventListener('touchstart', onARTouchStart);
  document.removeEventListener('touchmove', onARTouchMove);
  document.removeEventListener('touchend', onARTouchEnd);

  // Reset touch state
  arTouchState = {
    touches: [],
    initialDistance: 0,
    initialScale: 1,
    selectedMesh: null,
    isDragging: false
  };

  // Restore scene background
  scene.background = new THREE.Color(0x1a1a2e);

  // Remove reticle
  if (reticle) {
    scene.remove(reticle);
    reticle = null;
  }

  // Remove all placed AR meshes (clones) from the scene
  // Note: The original mesh is in arPlacedMeshes, so we need to handle it carefully
  arPlacedMeshes.forEach((mesh) => {
    // Only dispose clones, not the original mesh
    if (mesh !== currentSequence?.model4D?.mesh) {
      scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => mat.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    }
  });
  arPlacedMeshes = [];
  console.log('[Volumetrik] AR: Removed all placed meshes');

  // Reset the original actor position and scale
  if (currentSequence && currentSequence.model4D && currentSequence.model4D.mesh) {
    const mesh = currentSequence.model4D.mesh;
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    console.log('[Volumetrik] AR: Reset actor to default position');
  }

  // Restore grid visibility
  const grid = scene.getObjectByName('grid');
  if (grid) grid.visible = true;

  // Change button back to "AR"
  const arButton = document.getElementById('ar-button');
  if (arButton) {
    arButton.textContent = 'AR';
    arButton.title = 'Enter AR mode';
  }
}

function onARSelect() {
  // Add null checks to prevent crashes
  if (!reticle) {
    console.warn('[Volumetrik] AR select: reticle not found');
    return;
  }

  if (!currentSequence || !currentSequence.isLoaded) {
    console.warn('[Volumetrik] AR select: sequence not loaded');
    return;
  }

  if (!currentSequence.model4D || !currentSequence.model4D.mesh) {
    console.warn('[Volumetrik] AR select: model4D mesh not available');
    return;
  }

  try {
    // Remove any previously placed meshes - only allow one at a time
    arPlacedMeshes.forEach((mesh) => {
      scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => mat.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
    arPlacedMeshes = [];

    // Place new mesh at reticle position
    const mesh = currentSequence.model4D.mesh.clone();
    mesh.position.setFromMatrixPosition(reticle.matrix);
    mesh.scale.set(0.3, 0.3, 0.3);
    mesh.name = 'ar-placed-actor'; // Name it for easy identification
    scene.add(mesh);
    arPlacedMeshes.push(mesh);
    console.log('[Volumetrik] AR: Placed actor at new position (replacing previous)');
  } catch (error) {
    console.error('[Volumetrik] AR select failed:', error);
  }
}

function handleARHitTest(frame) {
  const referenceSpace = renderer.xr.getReferenceSpace();
  const session = renderer.xr.getSession();

  if (!hitTestSourceRequested) {
    // Try to set up hit testing if available
    session.requestReferenceSpace('viewer').then((refSpace) => {
      if (session.requestHitTestSource) {
        session.requestHitTestSource({ space: refSpace }).then((source) => {
          hitTestSource = source;
          console.log('[Volumetrik] Hit test source initialized');
        }).catch((error) => {
          console.warn('[Volumetrik] Hit test not available:', error);
        });
      } else {
        console.warn('[Volumetrik] Hit test API not supported on this device');
      }
    }).catch((error) => {
      console.warn('[Volumetrik] Could not get viewer reference space:', error);
    });

    session.addEventListener('end', () => {
      hitTestSourceRequested = false;
      hitTestSource = null;
    });

    hitTestSourceRequested = true;
  }

  if (hitTestSource && reticle) {
    try {
      const hitTestResults = frame.getHitTestResults(hitTestSource);
      if (hitTestResults.length) {
        const hit = hitTestResults[0];
        reticle.visible = true;
        reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
      } else {
        reticle.visible = false;
      }
    } catch (error) {
      // Hit test failed, just show reticle at default position
      reticle.visible = true;
    }
  } else if (reticle && isARMode) {
    // No hit test available, show reticle at a fixed position in front of camera
    reticle.visible = true;
  }
}

function setupARGestureControls() {
  // Remove existing listeners if any
  document.removeEventListener('touchstart', onARTouchStart);
  document.removeEventListener('touchmove', onARTouchMove);
  document.removeEventListener('touchend', onARTouchEnd);

  // Add new listeners
  document.addEventListener('touchstart', onARTouchStart, { passive: false });
  document.addEventListener('touchmove', onARTouchMove, { passive: false });
  document.addEventListener('touchend', onARTouchEnd, { passive: false });

  console.log('[Volumetrik] AR gesture controls enabled');
}

function onARTouchStart(event) {
  if (!isARMode || arPlacedMeshes.length === 0) return;

  // Check if touch is on a UI control element - if so, don't manipulate AR object
  const touch = event.touches[0];
  const element = document.elementFromPoint(touch.clientX, touch.clientY);

  // Allow touches on controls, buttons, sliders, etc.
  if (element && (
    element.tagName === 'BUTTON' ||
    element.tagName === 'INPUT' ||
    element.closest('#controls-container') ||
    element.closest('#video-selector') ||
    element.closest('.control-button') ||
    element.id === 'ar-button'
  )) {
    return; // Let the UI element handle the touch
  }

  arTouchState.touches = Array.from(event.touches);

  if (event.touches.length === 1) {
    // Single touch - rotation mode
    arTouchState.isDragging = true;
    arTouchState.selectedMesh = arPlacedMeshes[0];
    event.preventDefault();
  } else if (event.touches.length === 2) {
    // Two fingers - scale and move mode
    const dx = event.touches[0].clientX - event.touches[1].clientX;
    const dy = event.touches[0].clientY - event.touches[1].clientY;
    arTouchState.initialDistance = Math.sqrt(dx * dx + dy * dy);
    arTouchState.initialScale = arPlacedMeshes[0].scale.x;
    arTouchState.selectedMesh = arPlacedMeshes[0];
    event.preventDefault();
  }
}

function onARTouchMove(event) {
  if (!isARMode || !arTouchState.selectedMesh) return;

  if (event.touches.length === 1 && arTouchState.isDragging) {
    // Single finger drag - rotate the actor around Y axis
    const touch = event.touches[0];
    const previousTouch = arTouchState.touches[0];

    if (previousTouch) {
      const deltaX = touch.clientX - previousTouch.clientX;
      // Reduced sensitivity from 0.01 to 0.005 (half as sensitive)
      arTouchState.selectedMesh.rotation.y -= deltaX * 0.005;
    }

    arTouchState.touches = Array.from(event.touches);
    event.preventDefault();
  } else if (event.touches.length === 2) {
    // Pinch to scale - with smoother sensitivity
    const dx = event.touches[0].clientX - event.touches[1].clientX;
    const dy = event.touches[0].clientY - event.touches[1].clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Add minimum distance threshold to prevent extreme scaling
    if (arTouchState.initialDistance < 10) {
      arTouchState.initialDistance = distance;
      arTouchState.initialScale = arTouchState.selectedMesh.scale.x;
      return;
    }

    const scaleFactor = distance / arTouchState.initialDistance;
    const scale = scaleFactor * arTouchState.initialScale;
    // Tighter clamp between 0.2x and 1.5x to prevent disappearing
    const clampedScale = Math.max(0.2, Math.min(1.5, scale));

    arTouchState.selectedMesh.scale.set(clampedScale, clampedScale, clampedScale);
    event.preventDefault();
  }
}

function onARTouchEnd(event) {
  if (!isARMode) return;

  if (event.touches.length === 0) {
    arTouchState.isDragging = false;
    arTouchState.selectedMesh = null;
    arTouchState.touches = [];
  } else {
    arTouchState.touches = Array.from(event.touches);
  }
}

function onWindowResize() {
  if (!camera || !renderer) return;

  // Debounce resize to avoid excessive calls
  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }

  resizeTimeout = setTimeout(() => {
    camera.aspect = container.offsetWidth / container.offsetHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    resizeTimeout = null;
  }, RESIZE_DEBOUNCE_DELAY);
}

function animate() {
  renderer.setAnimationLoop((timestamp, frame) => {
    if (isARMode && frame) {
      handleARHitTest(frame);
    } else {
      if (currentSequence && currentSequence.isLoaded) {
        updatePlaybackUI();
      }
      controls.update();
    }
    renderer.render(scene, camera);
  });
}

function updatePlaybackUI() {
  if (!currentSequence || !currentSequence.isLoaded) return;

  const currentFrame = currentSequence.currentFrame || 0;
  const totalFrames = currentSequence.sequenceTotalLength || 0;

  // Performance optimization: only update if frame actually changed
  if (currentFrame === lastFrameUpdate) {
    return;
  }
  lastFrameUpdate = currentFrame;

  if (frameCurrentEl) frameCurrentEl.textContent = currentFrame;
  if (frameTotalEl) frameTotalEl.textContent = totalFrames;
  if (frameBufferedEl) frameBufferedEl.textContent = currentSequence.sequenceDecodedFrames || 0;

  const percent = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0;
  if (progressFillEl) {
    progressFillEl.style.width = `${percent}%`;
  }

  if (!userDraggingTimeline && timelineSlider && !timelineSlider.disabled && totalFrames > 0) {
    timelineSlider.max = Math.max(totalFrames - 1, 1);
    timelineSlider.value = Math.min(currentFrame, Number(timelineSlider.max));
    updateTimelineLabels(currentFrame, totalFrames);
  }
}

function bootstrap() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}

bootstrap();


