// Volumetrik Viewer: Web Component integration
// Update the BUCKET_BASE or individual URLs below with your latest GCS bucket paths

const BUCKET_BASE = 'https://storage.googleapis.com/spectralysium-volumetrik-4ds-files';

export const VIDEO_LIBRARY = {
  'dance-nani': {
    name: 'Nani Dance',
    desktop: `${BUCKET_BASE}/DANCE/Nani_Take_02_30_00fps_FILTERED_MOBILE_720.4ds`,
    mobile: `${BUCKET_BASE}/DANCE/Nani_Take_02_30_00fps_FILTERED_MOBILE_720.4ds`,
  },
  'dance-didik': {
    name: 'Didik Dance',
    desktop: `${BUCKET_BASE}/DANCE/Didik_Take_01_30_00fps_FILTERED_MOBILE_720-002.4ds`,
    mobile: `${BUCKET_BASE}/DANCE/Didik_Take_01_30_00fps_FILTERED_MOBILE_720-002.4ds`,
  },
  'martial-asep': {
    name: 'Asep Martial Art',
    desktop: `${BUCKET_BASE}/MARTIAL_ART/Asep_Take_02_30_00fps_FILTERED_MOBILE_720.4ds`,
    mobile: `${BUCKET_BASE}/MARTIAL_ART/Asep_Take_02_30_00fps_FILTERED_MOBILE_720.4ds`,
  },
  'martial-dian': {
    name: 'Dian Martial Art',
    desktop: `${BUCKET_BASE}/MARTIAL_ART/Dian_Take_02_30_00fps_FILTERED_MOBILE_720.4ds`,
    mobile: `${BUCKET_BASE}/MARTIAL_ART/Dian_Take_02_30_00fps_FILTERED_MOBILE_720.4ds`,
  },
  'martial-duel': {
    name: 'Martial Art Duel',
    desktop: `${BUCKET_BASE}/MARTIAL_ART/Duel_Take_02_30_00fps_FILTERED_MOBILE_720.4ds`,
    mobile: `${BUCKET_BASE}/MARTIAL_ART/Duel_Take_02_30_00fps_FILTERED_MOBILE_720.4ds`,
  },
};

function tryDeriveDesktop(url) {
  if (!url) return null;
  // Best-effort: swap MOBILE -> DESKTOP if naming follows that convention
  if (/MOBILE/i.test(url)) return url.replace(/MOBILE/ig, 'DESKTOP');
  return url;
}

function setViewerSource(viewerEl, videoId) {
  const entry = VIDEO_LIBRARY[videoId];
  if (!entry) return;

  // Ensure we provide a proper desktop-friendly file for devices without ASTC
  // If a desktop URL isn't provided or points to a MOBILE asset, attempt a safe derivation.
  const desktopUrl = entry.desktop && !/MOBILE/i.test(entry.desktop)
    ? entry.desktop
    : tryDeriveDesktop(entry.desktop) || tryDeriveDesktop(entry.mobile) || entry.desktop || entry.mobile;

  const mobileUrl = entry.mobile || entry.desktop;

  console.log('[ViewerDebug] setViewerSource', { videoId, desktopUrl, mobileUrl });

  viewerEl.setAttribute('src-desktop', desktopUrl);
  viewerEl.setAttribute('src-mobile', mobileUrl);
}

function initUI() {
  const viewer = document.getElementById('viewer');
  const selector = document.getElementById('video-selector');
  const arLaunch = document.getElementById('ar-launch');
  if (!viewer || !selector) return;

  // default selection
  let current = 'dance-nani';
  setViewerSource(viewer, current);

  customElements.whenDefined('viewer-4dv').then(() => {
    console.log('[ViewerDebug] viewer-4dv defined');
  });

  viewer.addEventListener('sequence-status', (evt) => {
    console.log('[ViewerDebug] sequence-status', evt.detail);
  });

  viewer.addEventListener('sequence-error', (evt) => {
    console.error('[ViewerDebug] sequence-error', evt.detail);
  });

  // Handle selection clicks
  selector.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-video]');
    if (!btn) return;

    const next = btn.dataset.video;
    if (!next || next === current) return;

    // Active state
    selector.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    current = next;
    setViewerSource(viewer, current);
  });

  // Mount AR launcher button action
  if (arLaunch) {
    // Icon-only content
    arLaunch.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2l7 4v6c0 3.87-3.13 7-7 7s-7-3.13-7-7V6l7-4zm0 2.15L7 6.62v5.38c0 2.76 2.24 5 5 5s5-2.24 5-5V6.62L12 4.15zM11 8h2v5h-2V8zm0 6h2v2h-2v-2z"/>
      </svg>
    `;
    arLaunch.addEventListener('click', () => {
      // Preferred: public method on the component
      try {
        if (typeof viewer.enterAR === 'function') { viewer.enterAR(); return; }
        if (typeof viewer.startAR === 'function') { viewer.startAR(); return; }
      } catch (e) { /* ignore and try fallback */ }

      // Fallback: try to click any AR button exposed in light DOM
      const arBtn = [...document.querySelectorAll('button, [role="button"]')]
        .find(b => /\bAR\b|augmented|immersive-ar/i.test(b.textContent || b.getAttribute('aria-label') || ''));
      if (arBtn) {
        arBtn.click();
        return;
      }

      alert('AR is not available on this device/browser or the viewer did not expose an AR trigger.');
    });
  }

  // Lift UI above any stray overlays
  const liftUI = () => {
    selector.style.zIndex = '10000';
    selector.style.position = 'relative';
  };
  liftUI();
  window.addEventListener('resize', liftUI);
}

window.addEventListener('DOMContentLoaded', initUI);

// Defensive: neutralize any stray transparent overlay that captures clicks.
// We only target suspicious, tall-narrow elements near the center that aren't
// part of our UI or the viewer element.
(function overlayGuard(){
  const SAFE_IDS = new Set(['video-selector','ar-launch','viewer']);
  const SAFE_TAGS = new Set(['SCRIPT','STYLE']);

  function isSafe(el){
    if (!el || el.nodeType !== 1) return true;
    if (SAFE_TAGS.has(el.tagName)) return true;
    if (SAFE_IDS.has(el.id)) return true;
    if (el.closest('#video-selector') || el.closest('header') || el.closest('footer')) return true;
    return false;
  }

  function looksLikeBlockingOverlay(el){
    try {
      if (!el.isConnected || !el.offsetParent && getComputedStyle(el).position === 'static') return false;
      const cs = getComputedStyle(el);
      if (cs.pointerEvents === 'none') return false;
      if (!(cs.position === 'fixed' || cs.position === 'absolute')) return false;

      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;

      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const intersectsCenter = rect.left < centerX && rect.right > centerX && rect.top < centerY && rect.bottom > centerY;
      if (!intersectsCenter) return false;

      const tallEnough = rect.height >= window.innerHeight * 0.6;
      const narrow = rect.width <= Math.max(120, window.innerWidth * 0.3);
      if (!(tallEnough && narrow)) return false;

      // Do not touch our known UI
      if (isSafe(el)) return false;

      // Heuristic: very low background/opacity usually indicates invisible hitbox
      const bg = cs.backgroundColor || '';
      const op = parseFloat(cs.opacity || '1');
      const hasNoText = (el.textContent || '').trim().length === 0;
      const looksTransparent = (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent' || op < 0.15);

      return hasNoText || looksTransparent;
    } catch(_) { return false; }
  }

  function neutralize(el){
    try {
      if (!el || el.dataset && el.dataset.overlayNeutralized) return;
      if (looksLikeBlockingOverlay(el)){
        el.style.pointerEvents = 'none';
        el.dataset.overlayNeutralized = 'true';
      }
    } catch(_){}
  }

  function sweep(){
    const nodes = Array.from(document.body.querySelectorAll('*')).slice(0, 1500);
    for (const n of nodes) neutralize(n);
  }

  const mo = new MutationObserver(muts => {
    for (const m of muts){
      m.addedNodes && m.addedNodes.forEach(node => {
        if (node.nodeType === 1){
          neutralize(node);
          node.querySelectorAll && node.querySelectorAll('*').forEach(neutralize);
        }
      });
    }
  });

  window.addEventListener('load', () => {
    sweep();
    setTimeout(sweep, 400);
    setTimeout(sweep, 1200);
  });
  window.addEventListener('resize', sweep);
  mo.observe(document.body, { childList: true, subtree: true });
})();

// Additional hit-test based suppressor for overlays that don't match CSS heuristics.
(function hitTestSuppressor(){
  function isWhitelisted(el){
    if (!el) return true;
    if (el.id === 'viewer' || el.id === 'video-selector' || el.id === 'ar-launch') return true;
    if (el.closest && (el.closest('#video-selector') || el.closest('header') || el.closest('footer'))) return true;
    return false;
  }

  function suppressAt(x){
    const h = window.innerHeight;
    for (let i=0;i<10;i++){
      const y = Math.round((i+1) * h / 11);
      const el = document.elementFromPoint(x, y);
      if (!el || isWhitelisted(el)) continue;

      try {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const narrow = r.width <= Math.max(140, window.innerWidth * 0.35);
        const tall = r.height >= window.innerHeight * 0.5;
        const overlayish = (cs.position === 'fixed' || cs.position === 'absolute' || cs.position === 'sticky');
        if (overlayish && narrow && tall) {
          el.style.pointerEvents = 'none';
        }
      } catch(_){}
    }
  }

  function run(){
    const x = Math.round(window.innerWidth * 0.5);
    suppressAt(x);
    // Also try slightly offset bands
    suppressAt(Math.round(window.innerWidth * 0.45));
    suppressAt(Math.round(window.innerWidth * 0.55));
  }

  window.addEventListener('load', () => {
    setTimeout(run, 50);
    setTimeout(run, 400);
    setTimeout(run, 1200);
  });
  window.addEventListener('resize', run);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(run, 60); });
})();
window.addEventListener('error', (e)=>{
  console.log('[ViewerDebug] window error', e.message);
});
window.addEventListener('unhandledrejection', (e)=>{
  console.log('[ViewerDebug] unhandled rejection', e.reason);
});
