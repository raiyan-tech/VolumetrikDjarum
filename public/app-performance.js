/**
 * Performance Integration Module
 * Integrates all 2025 performance optimizations
 *
 * Features:
 * - Service Worker registration
 * - IndexedDB caching for videos
 * - Performance monitoring
 * - Adaptive quality based on network
 * - Preloading strategies
 * - Resource prioritization
 */

import { idbCache } from './indexeddb-cache.js';
import { perfMonitor } from './performance-monitor.js';

export class AppPerformance {
  constructor() {
    this.initialized = false;
    this.networkQuality = 'unknown';
    this.connection = null;
  }

  /**
   * Initialize all performance features
   */
  async init() {
    if (this.initialized) return;
    this.initialized = true;

    console.log('[AppPerf] Initializing performance optimizations...');

    // Register Service Worker
    await this.registerServiceWorker();

    // Initialize IndexedDB cache
    await this.initIndexedDB();

    // Initialize performance monitoring
    await this.initPerformanceMonitoring();

    // Detect network quality
    this.detectNetworkQuality();

    // Setup adaptive streaming
    this.setupAdaptiveStreaming();

    // Preload critical resources
    this.preloadCriticalResources();

    // Monitor performance
    this.monitorPerformance();

    console.log('[AppPerf] All optimizations initialized ✅');
  }

  /**
   * Register Service Worker
   */
  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[AppPerf] Service Worker not supported');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none' // Always check for updates
      });

      console.log('[AppPerf] Service Worker registered:', registration.scope);

      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('[AppPerf] Service Worker update found');

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker available
            this.handleServiceWorkerUpdate();
          }
        });
      });

      // Check for updates every hour
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);

      return true;
    } catch (error) {
      console.error('[AppPerf] Service Worker registration failed:', error);
      return false;
    }
  }

  /**
   * Handle Service Worker update
   */
  handleServiceWorkerUpdate() {
    console.log('[AppPerf] New version available!');

    // Show update notification to user
    if (confirm('A new version is available. Reload to update?')) {
      window.location.reload();
    }
  }

  /**
   * Initialize IndexedDB cache
   */
  async initIndexedDB() {
    try {
      await idbCache.init();
      console.log('[AppPerf] IndexedDB cache initialized');

      // Check quota
      const quota = await idbCache.getQuotaInfo();
      if (quota) {
        console.log('[AppPerf] Storage quota:', {
          used: `${(quota.usage / 1024 / 1024).toFixed(2)}MB`,
          total: `${(quota.quota / 1024 / 1024).toFixed(2)}MB`,
          percent: `${quota.percentUsed.toFixed(1)}%`
        });

        // Warn if quota is high
        if (quota.percentUsed > 80) {
          console.warn('[AppPerf] Storage quota is high, consider clearing old cache');
        }
      }
    } catch (error) {
      console.error('[AppPerf] IndexedDB initialization failed:', error);
    }
  }

  /**
   * Initialize performance monitoring
   */
  async initPerformanceMonitoring() {
    try {
      await perfMonitor.init();
      console.log('[AppPerf] Performance monitoring initialized');

      // Log performance report after 10 seconds
      setTimeout(() => {
        perfMonitor.generateReport();
      }, 10000);
    } catch (error) {
      console.error('[AppPerf] Performance monitoring failed:', error);
    }
  }

  /**
   * Detect network quality
   */
  detectNetworkQuality() {
    if (!('connection' in navigator)) {
      console.log('[AppPerf] Network Information API not available');
      this.networkQuality = 'unknown';
      return;
    }

    this.connection = navigator.connection;

    const updateNetworkQuality = () => {
      const effectiveType = this.connection.effectiveType;
      const downlink = this.connection.downlink; // Mbps
      const rtt = this.connection.rtt; // ms

      // Determine quality
      if (effectiveType === '4g' && downlink > 10) {
        this.networkQuality = 'excellent';
      } else if (effectiveType === '4g' || (effectiveType === '3g' && downlink > 5)) {
        this.networkQuality = 'good';
      } else if (effectiveType === '3g' || effectiveType === '2g') {
        this.networkQuality = 'poor';
      } else {
        this.networkQuality = 'unknown';
      }

      console.log('[AppPerf] Network quality:', this.networkQuality, {
        effectiveType,
        downlink: `${downlink}Mbps`,
        rtt: `${rtt}ms`,
        saveData: this.connection.saveData
      });

      // Dispatch event for app to react
      window.dispatchEvent(new CustomEvent('networkqualitychange', {
        detail: {
          quality: this.networkQuality,
          effectiveType,
          downlink,
          rtt,
          saveData: this.connection.saveData
        }
      }));
    };

    updateNetworkQuality();

    this.connection.addEventListener('change', updateNetworkQuality);
  }

  /**
   * Setup adaptive streaming based on network
   */
  setupAdaptiveStreaming() {
    // Listen for network quality changes
    window.addEventListener('networkqualitychange', (event) => {
      const { quality, saveData } = event.detail;

      console.log('[AppPerf] Adapting to network quality:', quality);

      // Adjust quality settings
      const settings = this.getAdaptiveSettings(quality, saveData);

      // Dispatch settings change
      window.dispatchEvent(new CustomEvent('qualitysettingschange', {
        detail: settings
      }));
    });
  }

  /**
   * Get adaptive quality settings
   */
  getAdaptiveSettings(networkQuality, saveData) {
    if (saveData) {
      return {
        useMobile: true,
        chunkSize: 2 * 1024 * 1024, // 2MB
        cacheSize: 10,
        quality: 'low'
      };
    }

    switch (networkQuality) {
      case 'excellent':
        return {
          useMobile: false,
          chunkSize: 12 * 1024 * 1024, // 12MB
          cacheSize: 50,
          quality: 'high'
        };
      case 'good':
        return {
          useMobile: false,
          chunkSize: 8 * 1024 * 1024, // 8MB
          cacheSize: 30,
          quality: 'medium'
        };
      case 'poor':
        return {
          useMobile: true,
          chunkSize: 4 * 1024 * 1024, // 4MB
          cacheSize: 15,
          quality: 'low'
        };
      default:
        return {
          useMobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
          chunkSize: 6 * 1024 * 1024, // 6MB
          cacheSize: 25,
          quality: 'auto'
        };
    }
  }

  /**
   * Preload critical resources
   */
  preloadCriticalResources() {
    // Preload WebAssembly module
    this.preloadResource('/web4dv/CODEC.wasm', 'fetch');

    // Preload Three.js (if not already loaded)
    if (!window.THREE) {
      this.preloadResource('/lib/three.min.js', 'script');
    }

    // Prefetch likely next navigation
    this.prefetchResource('/player.html');

    console.log('[AppPerf] Critical resources preloaded');
  }

  /**
   * Preload a resource with high priority
   */
  preloadResource(url, as = 'fetch') {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = url;
    link.as = as;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }

  /**
   * Prefetch a resource for likely next navigation
   */
  prefetchResource(url) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    document.head.appendChild(link);
  }

  /**
   * Monitor performance continuously
   */
  monitorPerformance() {
    // Monitor long tasks
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              console.warn('[AppPerf] Long task detected:', entry.duration.toFixed(2), 'ms');
              perfMonitor.recordMetric('LongTask', entry.duration, {
                name: entry.name,
                startTime: entry.startTime
              });
            }
          }
        });

        observer.observe({ entryTypes: ['longtask'] });
      } catch (error) {
        // Long tasks API not available
      }
    }

    // Monitor memory pressure
    if (performance.memory) {
      setInterval(() => {
        const percentUsed = (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100;

        if (percentUsed > 90) {
          console.warn('[AppPerf] High memory pressure:', percentUsed.toFixed(1), '%');
        }
      }, 30000); // Check every 30 seconds
    }
  }

  /**
   * Cache video in IndexedDB
   */
  async cacheVideo(videoId, url) {
    try {
      console.log('[AppPerf] Caching video:', videoId);

      // Check if already cached
      if (await idbCache.hasVideo(videoId)) {
        console.log('[AppPerf] Video already cached:', videoId);
        return true;
      }

      // Fetch and cache
      const response = await fetch(url);
      const data = await response.arrayBuffer();

      await idbCache.storeVideo(videoId, data, {
        url,
        contentType: response.headers.get('content-type'),
        contentLength: data.byteLength
      });

      console.log('[AppPerf] Video cached successfully:', videoId);
      return true;
    } catch (error) {
      console.error('[AppPerf] Failed to cache video:', error);
      return false;
    }
  }

  /**
   * Get cached video
   */
  async getCachedVideo(videoId) {
    try {
      const data = await idbCache.getVideo(videoId);
      if (data) {
        console.log('[AppPerf] Serving video from cache:', videoId);
        return URL.createObjectURL(new Blob([data]));
      }
      return null;
    } catch (error) {
      console.error('[AppPerf] Failed to get cached video:', error);
      return null;
    }
  }

  /**
   * Clear old cache
   */
  async clearOldCache() {
    try {
      const cacheSize = await idbCache.getCacheSize();
      const maxSize = 2 * 1024 * 1024 * 1024; // 2GB

      if (cacheSize > maxSize) {
        const targetSize = maxSize * 0.3; // Free 30%
        await idbCache.evictOldEntries(targetSize);
        console.log('[AppPerf] Cleared old cache entries');
      }
    } catch (error) {
      console.error('[AppPerf] Failed to clear cache:', error);
    }
  }

  /**
   * Get network quality
   */
  getNetworkQuality() {
    return this.networkQuality;
  }

  /**
   * Get performance report
   */
  getPerformanceReport() {
    return perfMonitor.generateReport();
  }

  /**
   * Export performance metrics
   */
  exportMetrics() {
    perfMonitor.exportMetrics();
  }
}

// Export singleton instance
export const appPerf = new AppPerformance();

// Auto-initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => appPerf.init());
} else {
  appPerf.init();
}
