import WEB4DS from "./web4dv/web4dvImporter.js";
import CacheManager from "./CacheManager.js";

// Debug mode - disable console logs in production for better performance
const DEBUG_MODE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const logger = {
  log: DEBUG_MODE ? console.log.bind(console) : () => {},
  warn: DEBUG_MODE ? console.warn.bind(console) : () => {},
  error: console.error.bind(console), // Always log errors
};

// Performance constants - optimized for HTTP/3/QUIC with smaller chunks for better loss recovery
const CHUNK_SIZE_MOBILE = 512 * 1024;            // 512KB for mobile - better packet loss recovery
const CHUNK_SIZE_DESKTOP = 1024 * 1024;          // 1MB for desktop - optimal for HTTP/3
const CHUNK_SIZE_DESKTOP_LARGE = 768 * 1024;     // 768KB for large files - balance between throughput and recovery
const CACHE_SIZE_MOBILE = 20;                    // 20 frames mobile cache
const CACHE_SIZE_DESKTOP = 45;                   // 45 frames desktop cache
const CACHE_SIZE_DESKTOP_LARGE = 35;             // 35 frames large file cache
const PROGRESS_POLL_INTERVAL = 750;              // ms
const RESIZE_DEBOUNCE_DELAY = 150;               // ms
const MAX_PARALLEL_RANGE_REQUESTS = 3;           // Cap parallel Range requests for optimal throughput

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
    mobile: "https://storage.googleapis.com/spectralysium-volumetrik-4ds-files/DANCE/Didik_Take_01_30_00fps_FILTERED_MOBILE_720.4ds",
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
  "music-greybeard": {
    name: "Musisi",
    desktop: "https://storage.googleapis.com/spectralysium-volumetrik-4ds-files/MUSIC/Greybeard_60fps_DESKTOP_720.4ds",
    mobile: "https://storage.googleapis.com/spectralysium-volumetrik-4ds-files/MUSIC/Greybeard_60fps_MOBILE_720.4ds",
    position: [0, 0, 0],
    hasAudio: true
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
let cacheButtons = [];
const cacheState = {}; // Track cache status per video: 'none', 'caching', 'cached'

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

// Cache UI elements
let cacheToggleBtn;
let cachePanel;
let cacheSizeEl;
let cacheCountEl;
let clearAllCacheBtn;

// AR UI elements
let arOverlayEl;
let arHintEl;
let arModeIndicatorEl;
let arResetBtn;
let arMoveBtn;
let arRotateBtn;
let arShadowBtn;
let arHintTimeout = null;
let arCurrentMode = 'rotate'; // Default mode: rotate
let shadowsEnabled = true; // Track shadow state

let hasInitialized = false;
let resizeTimeout = null;
let arEventListenersAdded = false;
let lastFrameUpdate = -1;
let arPlacedMeshes = []; // Track meshes placed in AR mode
let arInitialPlacement = null; // Store initial placement for reset
let arTouchState = {
  touches: [],
  initialDistance: 0,
  initialScale: 1,
  selectedMesh: null,
  isDragging: false,
  isMoving: false
};

// AR Performance: Position clamping boundaries (prevent actor from going too far)
const AR_MAX_DISTANCE = 10; // Maximum distance from camera (10 meters)

function init() {
  if (hasInitialized) return;
  hasInitialized = true;
  logger.log('[Volumetrik] Initializing player');

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

  // AR UI elements
  arOverlayEl = document.getElementById('ar-overlay');
  arHintEl = document.getElementById('ar-hint');
  arModeIndicatorEl = document.getElementById('ar-mode-indicator');
  arResetBtn = document.getElementById('ar-reset-btn');
  arMoveBtn = document.getElementById('ar-move-btn');
  arRotateBtn = document.getElementById('ar-rotate-btn');
  arShadowBtn = document.getElementById('ar-shadow-btn');

  // AR reset button handler
  if (arResetBtn) {
    arResetBtn.addEventListener('click', resetARPlacement);
  }

  // AR mode toggle button handlers
  if (arMoveBtn) {
    arMoveBtn.addEventListener('click', () => setARMode('move'));
  }
  if (arRotateBtn) {
    arRotateBtn.addEventListener('click', () => setARMode('rotate'));
  }
  if (arShadowBtn) {
    arShadowBtn.addEventListener('click', toggleShadows);
  }

  // Cache UI elements
  cacheToggleBtn = document.getElementById('cache-toggle-btn');
  cachePanel = document.getElementById('cache-panel');
  cacheSizeEl = document.getElementById('cache-size');
  cacheCountEl = document.getElementById('cache-count');
  clearAllCacheBtn = document.getElementById('clear-all-cache-btn');

  // Initialize cache system (mobile only)
  if (IS_MOBILE) {
    setupCacheSystem();
  }

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
    renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: !IS_MOBILE, // Disable antialiasing on mobile for better performance
      alpha: true,
      powerPreference: 'high-performance' // Request dedicated GPU when available
    });
    logger.log('[Volumetrik] Using WebGL2 context');
  } else if (WEBGL.isWebGLAvailable()) {
    context = canvas.getContext('webgl');
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !IS_MOBILE, // Disable antialiasing on mobile for better performance
      alpha: true,
      powerPreference: 'high-performance' // Request dedicated GPU when available
    });
    logger.log('[Volumetrik] Using WebGL1 context');
  } else {
    const warning = WEBGL.getWebGLErrorMessage();
    container.appendChild(warning);
    throw new Error('WebGL is not available on this device');
  }

  renderer.setSize(container.offsetWidth, container.offsetHeight);

  // Adaptive pixel ratio for performance
  // Mobile: Use 1x for best performance (high-DPI devices render 4-9x pixels at native ratio)
  // Desktop: Cap at 2x to prevent excessive rendering on ultra high-DPI screens
  const adaptivePixelRatio = IS_MOBILE ? 1 : Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(adaptivePixelRatio);
  logger.log('[Volumetrik] Pixel ratio:', adaptivePixelRatio, '(device:', window.devicePixelRatio + ')');

  // Enable shadow rendering for realistic lighting (disable on mobile for performance)
  renderer.shadowMap.enabled = !IS_MOBILE;
  if (!IS_MOBILE) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    logger.log('[Volumetrik] Shadow rendering enabled');
  } else {
    logger.log('[Volumetrik] Shadow rendering disabled on mobile for performance');
  }

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
  keyLight.name = 'keyLight'; // Named for AR mode optimization
  keyLight.castShadow = true; // Enable shadows
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 50;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x8899ff, 0.6);
  fillLight.position.set(-3, 6, -6);
  fillLight.name = 'fillLight'; // Named for AR mode optimization
  fillLight.castShadow = false; // Fill light doesn't cast shadows
  scene.add(fillLight);

  const ambient = new THREE.AmbientLight(0x505050, 0.8);
  ambient.name = 'ambientLight'; // Named for AR mode optimization
  scene.add(ambient);

  const gridHelper = new THREE.GridHelper(10, 10, 0x667eea, 0x444444);
  gridHelper.name = 'grid';
  scene.add(gridHelper);
}

function setupEventListeners() {
  videoButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const videoId = btn.dataset.video;
      if (!videoId) {
        return;
      }
      // Allow re-clicking same video for retry (removed currentVideoId check)
      setActiveVideoButton(videoId);
      loadVideo(videoId, { resumePlayback: true });
    });
  });

  const playBtn = document.getElementById('btn-play');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (currentSequence) {
        // Resume audio context on user interaction (required by browser autoplay policy)
        if (currentSequence.audioCtx && currentSequence.audioCtx.state === 'suspended') {
          currentSequence.audioCtx.resume().then(() => {
            logger.log('[Volumetrik] Audio context resumed');
          }).catch(err => {
            logger.warn('[Volumetrik] Failed to resume audio context:', err);
          });
        }

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

function removeSequenceMeshFromScene(sequence) {
  if (!sequence || !scene) return;

  try {
    // Get the mesh from the sequence's model4D
    const mesh = sequence.model4D?.mesh;
    if (mesh) {
      logger.log('[Volumetrik] Removing sequence mesh from scene');
      scene.remove(mesh);

      // Dispose geometry and materials to free memory
      if (mesh.geometry) {
        mesh.geometry.dispose();
        logger.log('[Volumetrik] Disposed mesh geometry');
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => {
            if (mat.map) mat.map.dispose();
            if (mat.normalMap) mat.normalMap.dispose();
            if (mat.roughnessMap) mat.roughnessMap.dispose();
            if (mat.metalnessMap) mat.metalnessMap.dispose();
            mat.dispose();
          });
        } else {
          if (mesh.material.map) mesh.material.map.dispose();
          if (mesh.material.normalMap) mesh.material.normalMap.dispose();
          if (mesh.material.roughnessMap) mesh.material.roughnessMap.dispose();
          if (mesh.material.metalnessMap) mesh.material.metalnessMap.dispose();
          mesh.material.dispose();
        }
        logger.log('[Volumetrik] Disposed mesh materials');
      }
    }
  } catch (error) {
    logger.warn('[Volumetrik] Error removing mesh from scene:', error);
  }
}

async function loadVideo(videoId, options = {}) {
  // Clean up AR state when switching videos in AR mode
  if (isARMode) {
    logger.log('[Volumetrik] Cleaning up AR state before switching videos');

    // Remove old mesh from placed meshes if it exists
    if (arPlacedMeshes.length > 0 && currentSequence) {
      const oldMesh = currentSequence.model4D?.mesh;
      if (oldMesh) {
        logger.log('[Volumetrik] AR: Removing old placed mesh from scene');
        scene.remove(oldMesh);
      }
    }

    // Clear placed meshes array and reset AR placement
    arPlacedMeshes = [];
    arInitialPlacement = null;

    // Remove and recreate reticle to prevent double reticle issue
    if (reticle) {
      logger.log('[Volumetrik] Removing old reticle');
      scene.remove(reticle);
      if (reticle.geometry) reticle.geometry.dispose();
      if (reticle.material) reticle.material.dispose();
      reticle = null;
    }

    // Recreate reticle for new video
    reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.5, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    logger.log('[Volumetrik] Created new reticle for video switch (40-50cm ring)');

    // Reset hit test
    hitTestSourceRequested = false;
    hitTestSource = null;

    // Don't exit AR session - let user stay in AR mode
    logger.log('[Volumetrik] Staying in AR mode, will hide new mesh for SLAM placement');
  }

  // If another load is already underway, cancel it so we can switch quickly
  if (isLoadingVideo) {
    logger.log('[Volumetrik] Cancelling in-progress load for', currentVideoId);

    // Clear all timers to prevent race conditions
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      loadingTimeout = null;
    }

    // Destroy current sequence safely with proper cleanup
    if (currentSequence) {
      try {
        // Remove mesh from scene first
        removeSequenceMeshFromScene(currentSequence);
        // Then destroy the sequence
        currentSequence.destroy();
      } catch (destroyError) {
        logger.warn('[Volumetrik] Error destroying sequence during cancel', destroyError);
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
    logger.error('[Volumetrik] Video not found', videoId);
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
    logger.error('[Volumetrik] UI not ready');
    isLoadingVideo = false;
    return;
  }

  showLoadingPanel(videoConfig, startFrame);
  resetTimeline();
  setVideoProgress(targetVideoId, { status: 'loading', decoded: 0, total: 0 });

  // Check if video is cached (mobile only)
  let cachedBlob = null;
  if (IS_MOBILE && cacheState[targetVideoId] === 'cached') {
    logger.log('[Volumetrik] Checking cache for', targetVideoId);
    const cachedEntry = await CacheManager.getCachedVideo(targetVideoId);
    if (cachedEntry && cachedEntry.blob) {
      cachedBlob = cachedEntry.blob;
      logger.log('[Volumetrik] Loading from cache:', targetVideoId, 'Size:', (cachedBlob.size / 1024 / 1024).toFixed(1), 'MB');
    }
  }

  const create = () => createSequence(targetVideoId, videoConfig, { startFrame, resumePlayback, cachedBlob });

  if (currentSequence) {
    logger.log('[Volumetrik] Destroying previous sequence before loading new one');
    const seq = currentSequence;

    try {
      // Remove mesh from scene BEFORE destroy to prevent visual corruption
      removeSequenceMeshFromScene(seq);

      // Clear the reference immediately after cleanup
      currentSequence = null;

      // Try destroy with callback
      if (typeof seq.destroy === 'function') {
        // Call destroy and pass create callback
        seq.destroy(create);
      } else {
        // Fallback: if destroy doesn't exist or fails, create anyway
        logger.warn('[Volumetrik] Sequence has no destroy method, creating new sequence anyway');
        create();
      }
    } catch (error) {
      logger.warn('[Volumetrik] destroy failed:', error);
      // Ensure we still create the new sequence even if destroy fails
      currentSequence = null;
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
  const cachedBlob = options.cachedBlob || null;
  const hasRendererExtensions = renderer && renderer.extensions && typeof renderer.extensions.get === 'function';
  const supportsAstc = hasRendererExtensions && !!renderer.extensions.get('WEBGL_compressed_texture_astc');
  const defaultUrl = videoConfig.desktop || videoConfig.mobile || '';
  const mobileUrl = videoConfig.mobile || defaultUrl;

  // Use blob URL if we have cached content, otherwise use remote URL
  let primaryUrl;
  if (cachedBlob) {
    primaryUrl = URL.createObjectURL(cachedBlob);
    logger.log('[Volumetrik] Using cached blob URL:', primaryUrl);
  } else {
    primaryUrl = IS_MOBILE && supportsAstc && mobileUrl ? mobileUrl : defaultUrl;
  }

  try {
    logger.log('[Volumetrik] Creating new WEB4DS sequence for', videoId);
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

    logger.log('[Volumetrik] WEB4DS sequence created, mesh will be added to scene by library');
    currentSequence.startFrame = startFrame;

    // Optimize caching based on device and file size
    const isLargeFile = videoConfig.isLarge || false;

    if (IS_MOBILE) {
      // Mobile: streaming mode to prevent memory issues
      currentSequence.keepsChunksInCache(false);
      currentSequence.setChunkSize(CHUNK_SIZE_MOBILE);
      currentSequence.setMaxCacheSize(CACHE_SIZE_MOBILE);
      logger.log('[Volumetrik] Mobile:', (CHUNK_SIZE_MOBILE / 1024 / 1024).toFixed(1), 'MB chunks,', CACHE_SIZE_MOBILE, 'frame cache');
    } else {
      // Desktop: larger chunks for better performance
      if (isLargeFile) {
        // Large desktop files: streaming mode for memory safety
        currentSequence.keepsChunksInCache(false);
        currentSequence.setChunkSize(CHUNK_SIZE_DESKTOP_LARGE);
        currentSequence.setMaxCacheSize(CACHE_SIZE_DESKTOP_LARGE);
        logger.log('[Volumetrik] Desktop large:', (CHUNK_SIZE_DESKTOP_LARGE / 1024 / 1024).toFixed(1), 'MB chunks,', CACHE_SIZE_DESKTOP_LARGE, 'frame cache');
      } else {
        // Normal desktop files: full caching for smooth playback
        currentSequence.keepsChunksInCache(true);
        currentSequence.setChunkSize(CHUNK_SIZE_DESKTOP);
        currentSequence.setMaxCacheSize(CACHE_SIZE_DESKTOP);
        logger.log('[Volumetrik] Desktop normal:', (CHUNK_SIZE_DESKTOP / 1024 / 1024).toFixed(1), 'MB chunks,', CACHE_SIZE_DESKTOP, 'frame cache');
      }
    }

    currentSequence.shouldResumePlayback = resumePlayback;

    try {
      if (typeof currentSequence.setWaitingGif === 'function') {
        currentSequence.setWaitingGif('./web4dv/waiter/waiter.gif');
      }
    } catch (error) {
      logger.warn('[Volumetrik] Unable to set waiting gif', error);
    }

    const waitHint = getWaitHint(videoConfig, startFrame);
    const maxWaitMs = videoConfig.maxWaitMs || (videoConfig.isLarge ? 240000 : 90000);
    const loadStart = performance.now ? performance.now() : Date.now();

    logger.log('[Volumetrik] Starting decode', { videoId, startFrame, resumePlayback });
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
      logger.warn('[Volumetrik] Loading timeout');
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
    logger.error('[Volumetrik] Failed to create sequence', error);
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

  logger.log('[Volumetrik] Finalizing load for', videoId, '- mesh in scene:', currentSequence.model4D?.mesh ? 'YES' : 'NO');

  // Enable shadows on the volumetric mesh and library objects (skip on mobile)
  if (currentSequence.model4D && !IS_MOBILE) {
    if (currentSequence.model4D.mesh) {
      currentSequence.model4D.mesh.castShadow = true;
      currentSequence.model4D.mesh.receiveShadow = false; // Volumetric mesh doesn't receive shadows
      logger.log('[Volumetrik] Enabled shadows on volumetric mesh');
    }
    if (currentSequence.model4D.surface) {
      currentSequence.model4D.surface.receiveShadow = true; // Ground plane receives shadows
      currentSequence.model4D.surface.visible = true; // Show shadow plane
      logger.log('[Volumetrik] Shadow plane visible for ground shadows');
    }
    if (currentSequence.model4D.light) {
      currentSequence.model4D.light.castShadow = false; // Library light doesn't cast shadows (we use scene lights)
      logger.log('[Volumetrik] Library light shadows disabled (using scene lights)');
    }
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
    // Resume audio context before playing (required by browser autoplay policy)
    if (currentSequence.audioCtx && currentSequence.audioCtx.state === 'suspended') {
      currentSequence.audioCtx.resume().then(() => {
        logger.log('[Volumetrik] Audio context resumed for autoplay');
      }).catch(err => {
        logger.warn('[Volumetrik] Failed to resume audio context for autoplay:', err);
      });
    }

    currentSequence.play(true);
    isPlaying = true;
  }

  if (isMuted) {
    currentSequence.mute();
  }
}

function seekToFrame(targetFrame) {
  if (!currentSequence || !currentSequence.isLoaded) {
    logger.warn('[Volumetrik] Cannot seek - sequence not loaded');
    return;
  }

  const totalFrames = currentSequence.sequenceTotalLength || 0;
  const frameRate = currentSequence.frameRate || 30;
  const clampedFrame = Math.max(0, Math.min(targetFrame, totalFrames - 1));

  logger.log('[Volumetrik] Seeking to frame', clampedFrame);

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

// AR UI Helper Functions
function showAROverlay() {
  if (arOverlayEl) {
    arOverlayEl.classList.add('show');
  }
}

function hideAROverlay() {
  if (arOverlayEl) {
    arOverlayEl.classList.remove('show');
  }
}

function showARHint(message, duration = 3000) {
  if (!arHintEl) return;

  // Clear any existing timeout
  if (arHintTimeout) {
    clearTimeout(arHintTimeout);
    arHintTimeout = null;
  }

  arHintEl.textContent = message;
  arHintEl.classList.add('show');

  if (duration > 0) {
    arHintTimeout = setTimeout(() => {
      arHintEl.classList.remove('show');
      arHintTimeout = null;
    }, duration);
  }
}

function hideARHint() {
  if (arHintEl) {
    arHintEl.classList.remove('show');
  }
  if (arHintTimeout) {
    clearTimeout(arHintTimeout);
    arHintTimeout = null;
  }
}

function showARModeIndicator(mode) {
  if (!arModeIndicatorEl) return;

  // Remove all mode classes
  arModeIndicatorEl.classList.remove('rotate-mode', 'move-mode', 'scale-mode');

  // Set message and class based on mode
  switch(mode) {
    case 'rotate':
      arModeIndicatorEl.textContent = 'Drag to rotate';
      arModeIndicatorEl.classList.add('rotate-mode');
      break;
    case 'move':
      arModeIndicatorEl.textContent = 'Drag to move';
      arModeIndicatorEl.classList.add('move-mode');
      break;
    case 'scale':
      arModeIndicatorEl.textContent = 'Pinch to scale';
      arModeIndicatorEl.classList.add('scale-mode');
      break;
    default:
      arModeIndicatorEl.textContent = '';
  }

  arModeIndicatorEl.classList.add('show');
}

function hideARModeIndicator() {
  if (arModeIndicatorEl) {
    arModeIndicatorEl.classList.remove('show');
  }
}

function setARMode(mode) {
  if (!isARMode || arPlacedMeshes.length === 0) return;

  arCurrentMode = mode;

  // Update button states
  if (arMoveBtn && arRotateBtn) {
    arMoveBtn.classList.toggle('active', mode === 'move');
    arRotateBtn.classList.toggle('active', mode === 'rotate');
  }

  // Update mode indicator
  showARModeIndicator(mode);

  // Haptic feedback
  if (navigator.vibrate) {
    navigator.vibrate(30);
  }

  logger.log('[Volumetrik] AR: Mode changed to', mode);
}

function resetARPlacement() {
  if (!isARMode || arPlacedMeshes.length === 0) return;

  const mesh = arPlacedMeshes[0];

  if (arInitialPlacement && mesh) {
    // Reset to initial placement
    mesh.position.copy(arInitialPlacement.position);
    mesh.rotation.copy(arInitialPlacement.rotation);
    mesh.scale.copy(arInitialPlacement.scale);

    logger.log('[Volumetrik] AR: Reset to initial placement');
    showARHint('Position reset', 2000);

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }
}

function clampARPosition(mesh) {
  // Clamp actor position to prevent it from going too far from camera
  const distance = camera.position.distanceTo(mesh.position);

  if (distance > AR_MAX_DISTANCE) {
    // Calculate direction from camera to mesh
    const direction = new THREE.Vector3();
    direction.subVectors(mesh.position, camera.position).normalize();

    // Set position to max distance
    mesh.position.copy(camera.position).addScaledVector(direction, AR_MAX_DISTANCE);

    logger.log('[Volumetrik] AR: Position clamped to max distance', AR_MAX_DISTANCE);
  }
}

function toggleShadows() {
  shadowsEnabled = !shadowsEnabled;

  // Toggle renderer shadow map
  renderer.shadowMap.enabled = shadowsEnabled;

  // Toggle scene light shadows
  const keyLight = scene.getObjectByName('keyLight');
  if (keyLight) {
    keyLight.castShadow = shadowsEnabled;
  }

  // Toggle mesh shadows
  if (currentSequence && currentSequence.model4D) {
    if (currentSequence.model4D.mesh) {
      currentSequence.model4D.mesh.castShadow = shadowsEnabled;
    }
    if (currentSequence.model4D.surface) {
      currentSequence.model4D.surface.receiveShadow = shadowsEnabled;
      currentSequence.model4D.surface.visible = shadowsEnabled;
    }
  }

  // Update button state
  if (arShadowBtn) {
    arShadowBtn.classList.toggle('active', shadowsEnabled);
  }

  logger.log('[Volumetrik] Shadows', shadowsEnabled ? 'enabled' : 'disabled');

  // Haptic feedback
  if (navigator.vibrate) {
    navigator.vibrate(30);
  }
}

function setupARButton() {
  const arButton = document.getElementById('ar-button');

  if (!arButton) {
    logger.log('[Volumetrik] AR button not found');
    return;
  }

  if (!('xr' in navigator)) {
    logger.log('[Volumetrik] WebXR not available in this browser');
    arButton.style.display = 'none';
    return;
  }

  navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
    if (!supported) {
      logger.log('[Volumetrik] AR not supported on this device');
      arButton.style.display = 'none';
      return;
    }

    logger.log('[Volumetrik] AR is supported! Showing AR button');
    arButton.style.display = 'flex';

    // Add click handler to start/end AR session (only once)
    arButton.onclick = async () => {
      logger.log('[Volumetrik] AR button clicked');

      if (!renderer.xr.isPresenting) {
        // Start AR session
        try {
          let session;

          // Try basic AR session with proper reference space handling
          logger.log('[Volumetrik] Requesting AR session...');

          try {
            // Get the body element for dom-overlay
            const domOverlay = document.body;

            // Attempt 1: Try with local-floor and dom-overlay (best experience)
            try {
              session = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['dom-overlay'],
                domOverlay: { root: domOverlay },
                optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
              });
              logger.log('[Volumetrik] AR session granted with local-floor and dom-overlay');
              renderer.xr.setReferenceSpaceType('local-floor');
            } catch (e) {
              logger.warn('[Volumetrik] local-floor with dom-overlay failed, trying viewer mode:', e.message);

              // Attempt 2: Fallback to viewer reference space with dom-overlay
              try {
                session = await navigator.xr.requestSession('immersive-ar', {
                  requiredFeatures: ['dom-overlay'],
                  domOverlay: { root: domOverlay }
                });
                logger.log('[Volumetrik] AR session granted with viewer mode and dom-overlay');
                renderer.xr.setReferenceSpaceType('viewer');
              } catch (e2) {
                logger.warn('[Volumetrik] dom-overlay failed, trying without it:', e2.message);

                // Attempt 3: Last resort - no dom-overlay (controls will be hidden)
                try {
                  session = await navigator.xr.requestSession('immersive-ar', {
                    optionalFeatures: ['local-floor', 'bounded-floor']
                  });
                  logger.log('[Volumetrik] AR session granted without dom-overlay');
                  renderer.xr.setReferenceSpaceType('viewer');
                } catch (e3) {
                  throw new Error('Your device reports AR support but cannot create an AR session. This may be due to:\n\n' +
                    '1. Missing or outdated ARCore/ARKit\n' +
                    '2. Camera permissions not granted\n' +
                    '3. Browser version too old (needs Chrome 79+)\n' +
                    '4. Device limitation\n\n' +
                    'Original error: ' + e3.message);
                }
              }
            }
          } catch (error) {
            throw error;
          }

          logger.log('[Volumetrik] Setting up renderer for AR...');
          await renderer.xr.setSession(session);
          logger.log('[Volumetrik] AR session active!');
        } catch (error) {
          logger.error('[Volumetrik] AR session failed:', error);
          alert('Unable to start AR\n\n' + error.message);
        }
      } else {
        // End AR session
        logger.log('[Volumetrik] Ending AR session');
        renderer.xr.getSession().end();
      }
    };

    // Add event listeners only once - prevent duplicates
    if (!arEventListenersAdded) {
      renderer.xr.addEventListener('sessionstart', onARSessionStart);
      renderer.xr.addEventListener('sessionend', onARSessionEnd);
      arEventListenersAdded = true;
      logger.log('[Volumetrik] AR event listeners registered');
    }
  }).catch((error) => {
    logger.error('[Volumetrik] WebXR support check failed:', error);
    arButton.style.display = 'none';
  });
}

function onARSessionStart() {
  logger.log('[Volumetrik] AR session started');
  isARMode = true;

  // Show AR UI overlay
  showAROverlay();
  showARHint('Tap anywhere to place actor', 5000);

  // Enable passthrough: make background transparent to show camera feed
  scene.background = null;

  // Hide the grid in AR mode
  const grid = scene.getObjectByName('grid');
  if (grid) grid.visible = false;

  // Hide scene lights in AR mode (AR uses real-world lighting from camera feed)
  // This improves performance by skipping unnecessary light calculations
  const keyLight = scene.getObjectByName('keyLight');
  const fillLight = scene.getObjectByName('fillLight');
  const ambientLight = scene.getObjectByName('ambientLight');
  if (keyLight) keyLight.visible = false;
  if (fillLight) fillLight.visible = false;
  if (ambientLight) ambientLight.visible = false;
  logger.log('[Volumetrik] AR: Scene lights hidden for better performance');

  // Hide the original mesh - user will place it with SLAM
  if (currentSequence && currentSequence.isLoaded && currentSequence.model4D && currentSequence.model4D.mesh) {
    const mesh = currentSequence.model4D.mesh;
    mesh.visible = false; // Hide until placed with SLAM
    logger.log('[Volumetrik] AR: Original mesh hidden, waiting for SLAM placement');
  }

  // Set up hit test reticle for SLAM placement (only if not already exists)
  if (!reticle) {
    reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.5, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    logger.log('[Volumetrik] AR: Created reticle for SLAM placement (40-50cm ring)');
  } else {
    logger.log('[Volumetrik] AR: Reusing existing reticle');
  }

  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', onARSelect);
  scene.add(controller);

  // Add touch gesture handlers for AR transform controls and placement
  setupARGestureControls();

  // Change AR button to show "VR" to exit AR mode
  const arButton = document.getElementById('ar-button');
  if (arButton) {
    arButton.textContent = 'VR';
    arButton.title = 'Exit AR and return to VR mode';
  }
}

function onARSessionEnd() {
  logger.log('[Volumetrik] AR session ended');
  isARMode = false;
  hitTestSourceRequested = false;
  hitTestSource = null;

  // Hide AR UI overlay
  hideAROverlay();
  hideARHint();
  hideARModeIndicator();

  // Reset AR initial placement
  arInitialPlacement = null;

  // Remove AR gesture controls
  document.removeEventListener('touchstart', onARTouchStart);
  document.removeEventListener('touchmove', onARTouchMove);
  document.removeEventListener('touchend', onARTouchEnd);
  canvas.removeEventListener('touchstart', onARTouchStart);
  canvas.removeEventListener('touchmove', onARTouchMove);
  canvas.removeEventListener('touchend', onARTouchEnd);

  // Reset touch state
  arTouchState = {
    touches: [],
    initialDistance: 0,
    initialScale: 1,
    selectedMesh: null,
    isDragging: false,
    isMoving: false
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
  logger.log('[Volumetrik] AR: Removed all placed meshes');

  // Reset the original actor position, scale, and visibility
  if (currentSequence && currentSequence.model4D && currentSequence.model4D.mesh) {
    const mesh = currentSequence.model4D.mesh;
    mesh.visible = true; // Restore visibility
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    logger.log('[Volumetrik] AR: Reset actor to default position');
  }

  // Restore grid visibility
  const grid = scene.getObjectByName('grid');
  if (grid) grid.visible = true;

  // Restore scene lights visibility
  const keyLight = scene.getObjectByName('keyLight');
  const fillLight = scene.getObjectByName('fillLight');
  const ambientLight = scene.getObjectByName('ambientLight');
  if (keyLight) keyLight.visible = true;
  if (fillLight) fillLight.visible = true;
  if (ambientLight) ambientLight.visible = true;
  logger.log('[Volumetrik] AR: Scene lights restored');

  // Change button back to "AR"
  const arButton = document.getElementById('ar-button');
  if (arButton) {
    arButton.textContent = 'AR';
    arButton.title = 'Enter AR mode';
  }
}

function onARSelect() {
  logger.log('[Volumetrik] AR select triggered');

  // Check if we have the mesh (even if not fully loaded)
  if (!currentSequence || !currentSequence.model4D || !currentSequence.model4D.mesh) {
    logger.warn('[Volumetrik] AR select: mesh not available yet');
    return;
  }

  const mesh = currentSequence.model4D.mesh;

  // Only place if not already placed
  if (arPlacedMeshes.includes(mesh)) {
    logger.log('[Volumetrik] AR: Mesh already placed, ignoring select');
    return;
  }

  try {
    // If reticle exists and has a valid position, use it but add extra forward offset
    if (reticle && reticle.visible) {
      if (reticle.matrix && reticle.matrix.elements.some(e => e !== 0)) {
        // Use hit test matrix position
        mesh.position.setFromMatrixPosition(reticle.matrix);

        // Add extra forward offset (1m on XY plane) so actor doesn't overlap with user
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0; // Project onto floor plane
        cameraDirection.normalize();
        mesh.position.addScaledVector(cameraDirection, 1.5); // Move 1.5m forward on floor plane

        logger.log('[Volumetrik] AR: Placed at reticle matrix position + 1.5m forward offset');
      } else if (reticle.position) {
        // Use reticle's direct position (fallback positioning) + forward offset
        mesh.position.copy(reticle.position);

        // Add extra forward offset (1m on XY plane) so actor doesn't overlap with user
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0; // Project onto floor plane
        cameraDirection.normalize();
        mesh.position.addScaledVector(cameraDirection, 1.0); // Move 1m forward on floor plane

        logger.log('[Volumetrik] AR: Placed at reticle position + 1m forward offset');
      } else {
        // Last resort: 1m forward on floor plane from camera
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0; // Project onto floor plane
        cameraDirection.normalize();

        const position = camera.position.clone();
        position.addScaledVector(cameraDirection, 1.0); // 1m forward on floor
        mesh.position.copy(position);

        logger.log('[Volumetrik] AR: Placed at fallback position (1m forward on floor)');
      }
    } else {
      // No reticle: place 1m forward on floor plane from camera
      const cameraDirection = new THREE.Vector3();
      camera.getWorldDirection(cameraDirection);
      cameraDirection.y = 0; // Project onto floor plane
      cameraDirection.normalize();

      const position = camera.position.clone();
      position.addScaledVector(cameraDirection, 1.0); // 1m forward on floor
      mesh.position.copy(position);

      logger.log('[Volumetrik] AR: Placed at fallback position (no reticle, 1m forward on floor)');
    }

    // Make mesh visible and set AR scale (1.5 = human scale)
    mesh.visible = true;
    mesh.scale.set(1.5, 1.5, 1.5);

    // Reset rotation to face forward (0,0,0) - don't use lookAt which makes it face camera
    mesh.rotation.set(0, 0, 0);

    // Store initial placement for reset functionality
    arInitialPlacement = {
      position: mesh.position.clone(),
      rotation: mesh.rotation.clone(),
      scale: mesh.scale.clone()
    };

    // Add to placed meshes for manipulation
    arPlacedMeshes.push(mesh);

    logger.log('[Volumetrik] AR: Actor placed at human scale (1.5x)');

    // Show manipulation hints
    hideARHint();
    showARHint('Use buttons to switch Move/Rotate • Pinch to scale', 5000);
    showARModeIndicator('rotate');

    // Set rotate mode as default and update button states
    setARMode('rotate');
  } catch (error) {
    logger.error('[Volumetrik] AR select failed:', error);
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
          logger.log('[Volumetrik] Hit test source initialized');
        }).catch((error) => {
          logger.warn('[Volumetrik] Hit test not available:', error);
        });
      } else {
        logger.warn('[Volumetrik] Hit test API not supported on this device');
      }
    }).catch((error) => {
      logger.warn('[Volumetrik] Could not get viewer reference space:', error);
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
    // No hit test available, position reticle 3m in front of camera at chest height
    reticle.visible = true;
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    // Position 3m forward from camera at chest height (1.2m above ground)
    const position = camera.position.clone();
    const forwardOffset = cameraDirection.multiplyScalar(3.0);
    forwardOffset.y = 0; // Don't move vertically
    position.add(forwardOffset);
    position.y = 1.2; // Chest height - lower than eye level for better floor visibility

    reticle.position.copy(position);
    reticle.rotation.x = -Math.PI / 2; // Face up
    reticle.updateMatrixWorld(true);
    logger.log('[Volumetrik] Reticle fallback position (3m forward at 1.2m height):', position, 'Camera pos:', camera.position);
  }
}

function setupARGestureControls() {
  // Remove existing listeners if any
  document.removeEventListener('touchstart', onARTouchStart);
  document.removeEventListener('touchmove', onARTouchMove);
  document.removeEventListener('touchend', onARTouchEnd);
  canvas.removeEventListener('touchstart', onARTouchStart);
  canvas.removeEventListener('touchmove', onARTouchMove);
  canvas.removeEventListener('touchend', onARTouchEnd);

  // Add listeners to both document and canvas to ensure touch events are captured
  document.addEventListener('touchstart', onARTouchStart, { passive: false });
  document.addEventListener('touchmove', onARTouchMove, { passive: false });
  document.addEventListener('touchend', onARTouchEnd, { passive: false });

  // Also add to canvas directly for better responsiveness
  canvas.addEventListener('touchstart', onARTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onARTouchMove, { passive: false });
  canvas.addEventListener('touchend', onARTouchEnd, { passive: false });

  logger.log('[Volumetrik] AR gesture controls enabled on document and canvas');
}

function onARTouchStart(event) {
  if (!isARMode) return;

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
    element.closest('.ar-mode-buttons') ||
    element.id === 'ar-button' ||
    element.id === 'ar-reset-btn'
  )) {
    return; // Let the UI element handle the touch
  }

  // If no meshes placed yet, this is a placement touch
  if (arPlacedMeshes.length === 0) {
    logger.log('[Volumetrik] AR: Touch detected for placement, reticle visible:', reticle?.visible);
    // Call AR select to place the mesh (even if reticle not visible yet)
    onARSelect();
    return;
  }

  // Otherwise, handle manipulation
  if (arPlacedMeshes.length > 0) {
    logger.log('[Volumetrik] AR: Touch for manipulation, fingers:', event.touches.length, 'mode:', arCurrentMode);
    arTouchState.touches = Array.from(event.touches);

    if (event.touches.length === 1) {
      // Single touch - use current mode (rotate or move)
      const touch = event.touches[0];
      arTouchState.selectedMesh = arPlacedMeshes[0];

      if (arCurrentMode === 'rotate') {
        arTouchState.isDragging = true;
        arTouchState.isMoving = false;
        showARModeIndicator('rotate');
      } else if (arCurrentMode === 'move') {
        arTouchState.isMoving = true;
        arTouchState.isDragging = false;
        showARModeIndicator('move');
      }

      logger.log('[Volumetrik] AR: Single touch started -', arCurrentMode, 'mode active');
      event.preventDefault();
    } else if (event.touches.length === 2) {
      // Two fingers - scale mode (overrides current mode)
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      arTouchState.initialDistance = Math.sqrt(dx * dx + dy * dy);
      arTouchState.initialScale = arPlacedMeshes[0].scale.x;
      arTouchState.selectedMesh = arPlacedMeshes[0];
      arTouchState.isDragging = false;
      arTouchState.isMoving = false;

      // Show scale mode indicator
      showARModeIndicator('scale');

      logger.log('[Volumetrik] AR: Pinch scale mode activated, initial distance:', arTouchState.initialDistance);
      event.preventDefault();
    }
  }
}

function onARTouchMove(event) {
  if (!isARMode) return;
  if (!arTouchState.selectedMesh) {
    logger.log('[Volumetrik] AR: TouchMove but no selected mesh');
    return;
  }

  const touch = event.touches[0];

  if (event.touches.length === 1) {
    if (arTouchState.isMoving) {
      // Move mode - translate touch movement to floor plane (XZ)
      const previousTouch = arTouchState.touches[0];

      if (previousTouch) {
        const deltaX = touch.clientX - previousTouch.clientX;
        const deltaY = touch.clientY - previousTouch.clientY;

        // Calculate camera's forward direction projected onto XZ plane (floor)
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0; // Project onto floor plane
        cameraDirection.normalize();

        // Calculate right vector (perpendicular to forward on floor plane)
        const right = new THREE.Vector3();
        right.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();

        // Scale movement based on distance for intuitive control
        const distanceToCamera = camera.position.distanceTo(arTouchState.selectedMesh.position);
        const movementScale = distanceToCamera * 0.002; // Adjusted sensitivity for floor movement

        // Move on floor plane: deltaX = left/right, deltaY = forward/back
        const worldMovement = new THREE.Vector3();
        worldMovement.addScaledVector(right, deltaX * movementScale); // Left/right movement (matches swipe direction)
        worldMovement.addScaledVector(cameraDirection, -deltaY * movementScale); // Forward/back movement (inverted for natural feel)

        // Apply movement but keep Y coordinate locked (stay on floor level)
        const currentY = arTouchState.selectedMesh.position.y;
        arTouchState.selectedMesh.position.add(worldMovement);
        arTouchState.selectedMesh.position.y = currentY; // Lock Y to prevent vertical drift

        // Clamp position to prevent actor from going too far
        clampARPosition(arTouchState.selectedMesh);

        logger.log('[Volumetrik] AR: Moving on floor, delta:', deltaX, deltaY, 'position:', arTouchState.selectedMesh.position);
      }
    } else if (arTouchState.isDragging) {
      // Rotation mode - rotate ONLY around Z axis (horizontal spin like a turntable)
      const previousTouch = arTouchState.touches[0];

      if (previousTouch) {
        const deltaX = touch.clientX - previousTouch.clientX;
        // Only apply rotation if there's actual movement to avoid jitter
        if (Math.abs(deltaX) > 0) {
          arTouchState.selectedMesh.rotation.z += deltaX * 0.005; // Only rotate around Z
          logger.log('[Volumetrik] AR: Rotating around Z axis only, deltaX:', deltaX, 'rotation.z:', arTouchState.selectedMesh.rotation.z);
        }
      }
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
    // Allow scaling from 0.5x to 3.0x for proper human scale adjustment
    const clampedScale = Math.max(0.5, Math.min(3.0, scale));

    arTouchState.selectedMesh.scale.set(clampedScale, clampedScale, clampedScale);
    event.preventDefault();
  }
}

function onARTouchEnd(event) {
  if (!isARMode) return;

  if (event.touches.length === 0) {
    // All fingers lifted - reset state
    arTouchState.isDragging = false;
    arTouchState.isMoving = false;
    arTouchState.selectedMesh = null;
    arTouchState.touches = [];

    // Hide mode indicator when all touches end
    hideARModeIndicator();

    logger.log('[Volumetrik] AR: Touch ended, state reset');
  } else {
    // Still some fingers touching - update touch array
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
      // Also update playback UI in AR mode
      if (currentSequence && currentSequence.isLoaded) {
        updatePlaybackUI();
      }
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

// ===== Cache Management Functions (Mobile Only) =====

async function setupCacheSystem() {
  logger.log('[Volumetrik] Setting up cache system for mobile');

  // Check if IndexedDB is available
  if (!window.indexedDB) {
    logger.error('[Volumetrik] IndexedDB not supported in this browser');
    alert('Cache system requires IndexedDB support. Offline caching will not be available.');
    return;
  }

  // Initialize cache manager
  try {
    await CacheManager.init();
    logger.log('[Volumetrik] Cache manager initialized successfully');

    // Log storage quota information
    const quota = await CacheManager.getStorageQuota();
    if (quota) {
      logger.log('[Volumetrik] Storage quota:', {
        used: (quota.usage / 1024 / 1024).toFixed(1) + ' MB',
        total: (quota.quota / 1024 / 1024).toFixed(1) + ' MB',
        percentUsed: quota.percentUsed.toFixed(1) + '%'
      });
    }
  } catch (error) {
    logger.error('[Volumetrik] Failed to initialize cache manager:', error);
    alert('Failed to initialize cache system: ' + error.message);
    return;
  }

  // Get all cache buttons
  cacheButtons = Array.from(document.querySelectorAll('.cache-btn'));

  // Show cache buttons on mobile
  cacheButtons.forEach(btn => {
    btn.style.display = 'flex';
  });

  // Show cache toggle button on mobile
  if (cacheToggleBtn) {
    cacheToggleBtn.style.display = 'flex';
  }

  // Initialize cache state for all videos
  for (const videoId of Object.keys(VIDEO_LIBRARY)) {
    const isCached = await CacheManager.isCached(videoId);
    cacheState[videoId] = isCached ? 'cached' : 'none';
    updateCacheButtonUI(videoId);
  }

  // Update cache panel info
  updateCachePanel();

  // Set up event listeners
  setupCacheEventListeners();
}

function setupCacheEventListeners() {
  // Cache button click handlers
  cacheButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); // Prevent triggering video button
      const videoId = btn.dataset.cacheVideo;
      await handleCacheButtonClick(videoId);
    });
  });

  // Cache toggle button
  if (cacheToggleBtn) {
    cacheToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (cachePanel) {
        cachePanel.classList.toggle('show');
      }
    });
  }

  // Close cache panel when clicking outside
  document.addEventListener('click', (e) => {
    if (cachePanel && cachePanel.classList.contains('show')) {
      // Check if click is outside both the panel and toggle button
      if (!cachePanel.contains(e.target) && !cacheToggleBtn.contains(e.target)) {
        cachePanel.classList.remove('show');
      }
    }
  });

  // Clear all cache button
  if (clearAllCacheBtn) {
    clearAllCacheBtn.addEventListener('click', async () => {
      const confirmed = confirm('Are you sure you want to clear all cached videos? This cannot be undone.');
      if (confirmed) {
        await clearAllCache();
      }
    });
  }
}

async function handleCacheButtonClick(videoId) {
  const currentState = cacheState[videoId];

  if (currentState === 'caching') {
    logger.log('[Volumetrik] Already caching', videoId);
    return;
  }

  if (currentState === 'cached') {
    // Delete cache
    const confirmed = confirm('Remove this video from cache?');
    if (confirmed) {
      await deleteCachedVideo(videoId);
    }
  } else {
    // Start caching
    await cacheVideo(videoId);
  }
}

async function cacheVideo(videoId) {
  const videoConfig = VIDEO_LIBRARY[videoId];
  if (!videoConfig) {
    logger.error('[Volumetrik] Video config not found for', videoId);
    return;
  }

  // Determine which URL to cache (mobile or desktop)
  const url = IS_MOBILE ? (videoConfig.mobile || videoConfig.desktop) : videoConfig.desktop;

  logger.log('[Volumetrik] Starting cache for', videoId, 'URL:', url);

  // Check storage quota before starting
  const quota = await CacheManager.getStorageQuota();
  if (quota && quota.percentUsed > 90) {
    alert('Warning: Storage is almost full. You may need to clear some cached videos first.');
  }

  // Update UI to show caching state
  cacheState[videoId] = 'caching';
  updateCacheButtonUI(videoId);

  // Show loading overlay with progress
  openLoadingPanel();
  renderLoadingTemplate({
    heading: 'Caching Video',
    description: `Downloading ${videoConfig.name} for offline playback...`,
    detailItems: ['Progress: 0%', 'This may take several minutes depending on your connection.'],
    showSpinner: true,
    showCloseButton: false
  });

  // Start caching with progress callback (throttled to avoid excessive updates)
  let lastUpdateTime = 0;
  let lastPanelUpdate = 0;
  const result = await CacheManager.cacheVideo(videoId, url, (progress) => {
    const now = Date.now();
    // Throttle updates to every 500ms to reduce overhead
    if (now - lastUpdateTime < 500) return;
    lastUpdateTime = now;

    const percent = Math.round(progress.percent);
    const loadedMB = (progress.loaded / 1024 / 1024).toFixed(1);
    const totalMB = (progress.total / 1024 / 1024).toFixed(1);

    logger.log('[Volumetrik] Cache progress:', percent + '%', loadedMB + 'MB /', totalMB + 'MB');

    // Update cache panel every 2 seconds during download
    if (now - lastPanelUpdate > 2000) {
      lastPanelUpdate = now;
      updateCachePanel().catch(err => logger.error('[Volumetrik] Cache panel update failed:', err));
    }

    renderLoadingTemplate({
      heading: 'Caching Video',
      description: `Downloading ${videoConfig.name} for offline playback...`,
      detailItems: [
        `Progress: ${percent}%`,
        `Downloaded: ${loadedMB} MB / ${totalMB} MB`,
        `Estimated size: ${totalMB} MB`
      ],
      showSpinner: true,
      showCloseButton: false
    });
  });

  hideLoadingPanel();

  logger.log('[Volumetrik] Cache result for', videoId, ':', result);

  if (result.success) {
    cacheState[videoId] = 'cached';
    updateCacheButtonUI(videoId);
    await updateCachePanel(); // Update cache panel to show new size

    const sizeMB = result.size ? (result.size / 1024 / 1024).toFixed(1) : 'Unknown';

    // Show success with storage info
    const quota = await CacheManager.getStorageQuota();
    let storageInfo = '';
    if (quota) {
      storageInfo = `\n\nStorage used: ${(quota.usage / 1024 / 1024).toFixed(1)} MB / ${(quota.quota / 1024 / 1024).toFixed(1)} MB (${quota.percentUsed.toFixed(1)}%)`;
    }

    alert(`${videoConfig.name} cached successfully!\n\nSize: ${sizeMB} MB\n\nYou can now play this video offline.${storageInfo}`);
    logger.log('[Volumetrik] Cache successful for', videoId, 'Size:', sizeMB, 'MB');
  } else {
    cacheState[videoId] = 'none';
    updateCacheButtonUI(videoId);

    logger.error('[Volumetrik] Cache failed for', videoId, ':', result);

    if (result.quotaExceeded) {
      alert(`Storage quota exceeded!\n\n${result.error}\n\nTip: Clear some cached videos to free up space.`);
    } else {
      alert(`Cache failed: ${result.error || 'Unknown error'}`);
    }
  }
}

async function deleteCachedVideo(videoId) {
  const videoConfig = VIDEO_LIBRARY[videoId];

  logger.log('[Volumetrik] Deleting cache for', videoId);

  const success = await CacheManager.deleteCachedVideo(videoId);

  if (success) {
    cacheState[videoId] = 'none';
    updateCacheButtonUI(videoId);
    updateCachePanel();
    logger.log('[Volumetrik] Cache deleted for', videoId);
  } else {
    alert('Failed to delete cached video');
  }
}

async function clearAllCache() {
  logger.log('[Volumetrik] Clearing all cache');

  const success = await CacheManager.clearAllCache();

  if (success) {
    // Update all cache states
    for (const videoId of Object.keys(VIDEO_LIBRARY)) {
      cacheState[videoId] = 'none';
      updateCacheButtonUI(videoId);
    }
    updateCachePanel();
    alert('All cached videos have been cleared.');
    logger.log('[Volumetrik] All cache cleared');
  } else {
    alert('Failed to clear cache');
  }
}

function updateCacheButtonUI(videoId) {
  const btn = cacheButtons.find(b => b.dataset.cacheVideo === videoId);
  if (!btn) return;

  const state = cacheState[videoId];

  // Remove all state classes
  btn.classList.remove('cached', 'caching');

  // Update icon and class based on state
  if (state === 'cached') {
    btn.textContent = '✓';
    btn.classList.add('cached');
    btn.title = 'Cached (click to remove)';
  } else if (state === 'caching') {
    btn.textContent = '...';
    btn.classList.add('caching');
    btn.title = 'Caching...';
  } else {
    btn.textContent = '⬇';
    btn.title = 'Cache for offline';
  }
}

async function updateCachePanel() {
  if (!cacheSizeEl || !cacheCountEl) {
    logger.warn('[Volumetrik] Cache panel elements not found');
    return;
  }

  try {
    const allCached = await CacheManager.getAllCachedVideos();
    const totalSize = await CacheManager.getTotalCacheSize();

    const sizeMB = (totalSize / 1024 / 1024).toFixed(1);
    cacheSizeEl.textContent = `${sizeMB} MB`;
    cacheCountEl.textContent = allCached.length;

    logger.log('[Volumetrik] Cache panel updated:', allCached.length, 'videos,', sizeMB, 'MB');
  } catch (error) {
    logger.error('[Volumetrik] Failed to update cache panel:', error);
  }
}

// Register Service Worker for HTTP/3/QUIC optimization
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      logger.log('[Volumetrik] Service Worker registered:', registration.scope);

      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        logger.log('[Volumetrik] Service Worker update found');

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            logger.log('[Volumetrik] Service Worker activated');
          }
        });
      });
    } catch (error) {
      logger.warn('[Volumetrik] Service Worker registration failed:', error);
    }
  } else {
    logger.log('[Volumetrik] Service Worker not supported in this browser');
  }
}

function bootstrap() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      registerServiceWorker();
    }, { once: true });
  } else {
    init();
    registerServiceWorker();
  }
}

bootstrap();


