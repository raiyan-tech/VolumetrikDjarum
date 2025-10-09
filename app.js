/**
 * Volumetrik 4DS Player
 * Mobile-optimized webapp with AR support
 */

import WEB4DS from './web4dv/web4dvImporter.js';
import { ARButton } from './lib/ARButton.js';

// Configuration for 4DS files
// Update these URLs when you deploy to Google Cloud Storage
const VIDEO_LIBRARY = {
    'dance-nani': {
        name: 'Nani Dance',
        desktop: './4DS/DANCE/Nani_Take_02_30_00fps_FILTERED_MOBILE_720.4ds',
        mobile: './4DS/DANCE/Nani_Take_02_30_00fps_FILTERED_MOBILE_720.4ds',
        position: [0, 0, 0]
    },
    'dance-didik': {
        name: 'Didik Dance',
        desktop: './4DS/DANCE/Didik_Take_01_30_00fps_FILTERED_MOBILE_720-002.4ds',
        mobile: './4DS/DANCE/Didik_Take_01_30_00fps_FILTERED_MOBILE_720-002.4ds',
        position: [0, 0, 0]
    },
    'martial-asep': {
        name: 'Asep Martial Art',
        desktop: './4DS/MARTIAL_ART/Asep_Take_02_30_00fps_FILTERED_MOBILE_720.4ds',
        mobile: './4DS/MARTIAL_ART/Asep_Take_02_30_00fps_FILTERED_MOBILE_720.4ds',
        position: [0, 0, 0]
    },
    'martial-dian': {
        name: 'Dian Martial Art',
        desktop: './4DS/MARTIAL_ART/Dian_Take_02_30_00fps_FILTERED_MOBILE_720.4ds',
        mobile: './4DS/MARTIAL_ART/Dian_Take_02_30_00fps_FILTERED_MOBILE_720.4ds',
        position: [0, 0, 0]
    },
    'martial-duel': {
        name: 'Martial Art Duel',
        desktop: './4DS/MARTIAL_ART/Duel_Take_02_30_00fps_FILTERED_MOBILE_720.4ds',
        mobile: './4DS/MARTIAL_ART/Duel_Take_02_30_00fps_FILTERED_MOBILE_720.4ds',
        position: [0, 0, 0]
    }
};

// Global variables
let canvas, container, renderer, scene, camera, controls;
let currentSequence = null;
let isPlaying = false;
let isMuted = false;
let isARMode = false;
let reticle = null;
let hitTestSource = null;
let hitTestSourceRequested = false;

// UI Elements
const loadingEl = document.getElementById('loading');
const progressFillEl = document.getElementById('progress-fill');
const frameCurrentEl = document.getElementById('frame-current');
const frameTotalEl = document.getElementById('frame-total');
const frameBufferedEl = document.getElementById('frame-buffered');
const instructionsEl = document.getElementById('instructions');

// Initialize the app
function init() {
    console.log('🚀 Initializing Volumetrik 4DS Player...');

    // Setup canvas and container
    canvas = document.getElementById('canvas4D');
    container = canvas.parentNode;

    // Check WebGL compatibility
    let context;
    if (WEBGL.isWebGL2Available()) {
        context = canvas.getContext('webgl2');
        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            context: context,
            antialias: true,
            alpha: true
        });
        console.log('✅ WebGL2 available');
    } else if (WEBGL.isWebGLAvailable()) {
        context = canvas.getContext('webgl');
        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            alpha: true
        });
        console.log('⚠️ Using WebGL1');
    } else {
        const warning = WEBGL.getWebGLErrorMessage();
        container.appendChild(warning);
        return;
    }

    // Setup Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // Setup Camera
    camera = new THREE.PerspectiveCamera(
        60,
        container.offsetWidth / container.offsetHeight,
        0.1,
        100
    );
    camera.position.set(0, 1.5, 3);
    scene.add(camera);

    // Setup Orbit Controls
    controls = new THREE.OrbitControls(camera, container);
    controls.target.set(0, 1, 0);
    controls.minDistance = 1.5;
    controls.maxDistance = 8;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Setup Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-5, 5, -5);
    scene.add(directionalLight2);

    // Setup Grid (hidden in AR)
    const gridHelper = new THREE.GridHelper(10, 10, 0x667eea, 0x444444);
    gridHelper.name = 'grid';
    scene.add(gridHelper);

    // Setup Renderer
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.xr.enabled = true;

    // Setup AR Button
    setupARButton();

    // Setup Event Listeners
    setupEventListeners();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Show instructions on first load
    setTimeout(() => {
        instructionsEl.classList.add('show');
    }, 500);

    // Start render loop
    animate();

    // Auto-load first video
    loadVideo('dance-nani');

    console.log('✅ Initialization complete');
}

// Setup AR Button
function setupARButton() {
    const arContainer = document.getElementById('ar-button-container');

    if ('xr' in navigator) {
        navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
            if (supported) {
                const arButton = ARButton.createButton(renderer, {
                    requiredFeatures: ['hit-test'],
                    optionalFeatures: ['dom-overlay'],
                    domOverlay: { root: document.body }
                });
                arButton.id = 'ar-button';
                arButton.textContent = 'View in AR';
                arContainer.appendChild(arButton);

                // AR Session Event Handlers
                renderer.xr.addEventListener('sessionstart', onARSessionStart);
                renderer.xr.addEventListener('sessionend', onARSessionEnd);

                console.log('✅ AR support enabled');
            } else {
                console.log('ℹ️ AR not supported on this device');
            }
        });
    } else {
        console.log('ℹ️ WebXR not available');
    }
}

// AR Session Start
function onARSessionStart() {
    console.log('📱 AR Session started');
    isARMode = true;

    // Create reticle for AR placement
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Hide grid in AR
    const grid = scene.getObjectByName('grid');
    if (grid) grid.visible = false;

    // Setup AR controller for tap to place
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', onARSelect);
    scene.add(controller);
}

// AR Session End
function onARSessionEnd() {
    console.log('📱 AR Session ended');
    isARMode = false;
    hitTestSourceRequested = false;
    hitTestSource = null;

    // Remove reticle
    if (reticle) {
        scene.remove(reticle);
        reticle = null;
    }

    // Show grid again
    const grid = scene.getObjectByName('grid');
    if (grid) grid.visible = true;

    // Reset model position if it exists
    if (currentSequence && currentSequence.model4D) {
        currentSequence.model4D.mesh.position.set(0, 0, 0);
        currentSequence.model4D.mesh.scale.set(1, 1, 1);
    }
}

// AR Select (tap to place)
function onARSelect() {
    if (reticle && reticle.visible && currentSequence && currentSequence.model4D) {
        const mesh = currentSequence.model4D.mesh;
        mesh.position.setFromMatrixPosition(reticle.matrix);
        mesh.scale.set(0.5, 0.5, 0.5); // Scale down for AR
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Video selection buttons
    const videoButtons = document.querySelectorAll('.video-btn');
    videoButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const videoId = e.target.dataset.video;
            videoButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            loadVideo(videoId);
        });
    });

    // Control buttons
    document.getElementById('btn-play').addEventListener('click', () => {
        if (currentSequence) {
            currentSequence.play(true);
            isPlaying = true;
        }
    });

    document.getElementById('btn-pause').addEventListener('click', () => {
        if (currentSequence) {
            currentSequence.pause();
            isPlaying = false;
        }
    });

    document.getElementById('btn-restart').addEventListener('click', () => {
        if (currentSequence) {
            currentSequence.destroy(() => {
                loadVideo(getCurrentVideoId());
            });
        }
    });

    document.getElementById('btn-mute').addEventListener('click', (e) => {
        if (currentSequence) {
            if (isMuted) {
                currentSequence.unmute();
                e.target.textContent = '🔊';
                isMuted = false;
            } else {
                currentSequence.mute();
                e.target.textContent = '🔇';
                isMuted = true;
            }
        }
    });
}

// Load Video
function loadVideo(videoId) {
    console.log(`📹 Loading video: ${videoId}`);

    const videoConfig = VIDEO_LIBRARY[videoId];
    if (!videoConfig) {
        console.error('Video not found:', videoId);
        return;
    }

    // Show loading
    loadingEl.classList.add('show');

    // Destroy current sequence if exists
    if (currentSequence) {
        currentSequence.destroy(() => {
            createNewSequence(videoId, videoConfig);
        });
    } else {
        createNewSequence(videoId, videoConfig);
    }
}

// Create New Sequence
function createNewSequence(videoId, videoConfig) {
    console.log(`🎬 Creating sequence for ${videoConfig.name}`);

    currentSequence = new WEB4DS(
        videoId,
        videoConfig.desktop,
        videoConfig.mobile,
        '', // No audio file
        videoConfig.position,
        renderer,
        scene,
        camera
    );

    // Load with live decoding (better for mobile)
    currentSequence.keepsChunksInCache(false);

    // Load and play
    currentSequence.load(true, false);
    isPlaying = true;

    // Hide loading after a delay
    setTimeout(() => {
        loadingEl.classList.remove('show');
    }, 2000);

    console.log(`✅ Sequence loaded: ${videoConfig.name}`);
}

// Get Current Video ID
function getCurrentVideoId() {
    const activeBtn = document.querySelector('.video-btn.active');
    return activeBtn ? activeBtn.dataset.video : 'dance-nani';
}

// Update UI
function updateUI() {
    if (currentSequence && currentSequence.isLoaded) {
        // Update frame info
        frameCurrentEl.textContent = currentSequence.currentFrame || 0;
        frameTotalEl.textContent = currentSequence.sequenceTotalLength || 0;
        frameBufferedEl.textContent = currentSequence.sequenceDecodedFrames || 0;

        // Update progress bar
        const progress = (currentSequence.currentFrame / currentSequence.sequenceTotalLength) * 100;
        progressFillEl.style.width = `${progress}%`;
    }
}

// Window Resize
function onWindowResize() {
    camera.aspect = container.offsetWidth / container.offsetHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.offsetWidth, container.offsetHeight);
}

// Animation Loop
function animate() {
    renderer.setAnimationLoop((timestamp, frame) => {

        // AR Mode - Handle hit testing for placement
        if (isARMode && frame) {
            const referenceSpace = renderer.xr.getReferenceSpace();
            const session = renderer.xr.getSession();

            if (hitTestSourceRequested === false) {
                session.requestReferenceSpace('viewer').then((refSpace) => {
                    session.requestHitTestSource({ space: refSpace }).then((source) => {
                        hitTestSource = source;
                    });
                });

                session.addEventListener('end', () => {
                    hitTestSourceRequested = false;
                    hitTestSource = null;
                });

                hitTestSourceRequested = true;
            }

            if (hitTestSource) {
                const hitTestResults = frame.getHitTestResults(hitTestSource);
                if (hitTestResults.length && reticle) {
                    const hit = hitTestResults[0];
                    reticle.visible = true;
                    reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
                } else if (reticle) {
                    reticle.visible = false;
                }
            }
        }
        // Normal Mode - Update UI
        else {
            if (currentSequence && currentSequence.isLoaded) {
                updateUI();
            }
            controls.update();
        }

        renderer.render(scene, camera);
    });
}

// Start the application
init();
