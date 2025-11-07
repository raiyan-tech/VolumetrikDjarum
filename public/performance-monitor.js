/**
 * Performance Monitoring Module
 * 2025 Best Practices: Web Vitals + Firebase Performance + Custom Metrics
 *
 * Metrics Tracked:
 * - Core Web Vitals (LCP, FID, CLS, INP, TTFB)
 * - Custom volumetric video metrics
 * - Network performance
 * - Memory usage
 * - Frame rate
 */

export class PerformanceMonitor {
  constructor() {
    this.metrics = {};
    this.marks = new Map();
    this.initialized = false;
  }

  /**
   * Initialize performance monitoring
   */
  async init() {
    if (this.initialized) return;
    this.initialized = true;

    console.log('[Perf] Initializing performance monitoring...');

    // Track Core Web Vitals
    this.trackWebVitals();

    // Track custom metrics
    this.trackCustomMetrics();

    // Track network performance
    this.trackNetworkPerformance();

    // Track memory if available
    if (performance.memory) {
      this.trackMemoryUsage();
    }

    // Track frame rate
    this.trackFrameRate();

    // Log performance entry types available
    if (PerformanceObserver.supportedEntryTypes) {
      console.log('[Perf] Supported entry types:', PerformanceObserver.supportedEntryTypes);
    }
  }

  /**
   * Track Core Web Vitals (2025 Standards)
   */
  trackWebVitals() {
    // Largest Contentful Paint (LCP) - Target: < 2.5s
    this.observeMetric('largest-contentful-paint', (entry) => {
      const lcp = entry.renderTime || entry.loadTime;
      this.recordMetric('LCP', lcp, {
        element: entry.element?.tagName,
        url: entry.url,
        rating: lcp < 2500 ? 'good' : lcp < 4000 ? 'needs-improvement' : 'poor'
      });
    });

    // First Input Delay (FID) - Target: < 100ms
    this.observeMetric('first-input', (entry) => {
      const fid = entry.processingStart - entry.startTime;
      this.recordMetric('FID', fid, {
        eventType: entry.name,
        rating: fid < 100 ? 'good' : fid < 300 ? 'needs-improvement' : 'poor'
      });
    });

    // Interaction to Next Paint (INP) - New 2025 metric replacing FID
    // INP measures responsiveness throughout page lifetime
    let worstInp = 0;
    this.observeMetric('event', (entry) => {
      if (entry.duration > worstInp) {
        worstInp = entry.duration;
        this.recordMetric('INP', worstInp, {
          eventType: entry.name,
          rating: worstInp < 200 ? 'good' : worstInp < 500 ? 'needs-improvement' : 'poor'
        });
      }
    }, { durationThreshold: 40 });

    // Cumulative Layout Shift (CLS) - Target: < 0.1
    let clsScore = 0;
    this.observeMetric('layout-shift', (entry) => {
      if (!entry.hadRecentInput) {
        clsScore += entry.value;
        this.recordMetric('CLS', clsScore, {
          rating: clsScore < 0.1 ? 'good' : clsScore < 0.25 ? 'needs-improvement' : 'poor'
        });
      }
    });

    // Time to First Byte (TTFB) - Target: < 800ms
    this.observeMetric('navigation', (entry) => {
      const ttfb = entry.responseStart - entry.requestStart;
      this.recordMetric('TTFB', ttfb, {
        rating: ttfb < 800 ? 'good' : ttfb < 1800 ? 'needs-improvement' : 'poor'
      });
    });

    // First Contentful Paint (FCP) - Target: < 1.8s
    this.observeMetric('paint', (entry) => {
      if (entry.name === 'first-contentful-paint') {
        this.recordMetric('FCP', entry.startTime, {
          rating: entry.startTime < 1800 ? 'good' : entry.startTime < 3000 ? 'needs-improvement' : 'poor'
        });
      }
    });
  }

  /**
   * Observe performance metric
   */
  observeMetric(type, callback, options = {}) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          callback(entry);
        }
      });

      observer.observe({ type, buffered: true, ...options });
    } catch (error) {
      console.warn(`[Perf] Unable to observe ${type}:`, error.message);
    }
  }

  /**
   * Track custom volumetric video metrics
   */
  trackCustomMetrics() {
    // Video load time
    this.mark('video-load-start');

    // Decode performance
    this.mark('decode-start');

    // AR session metrics
    this.mark('ar-session-start');
  }

  /**
   * Track network performance
   */
  trackNetworkPerformance() {
    if (!('connection' in navigator)) {
      console.log('[Perf] Network Information API not available');
      return;
    }

    const connection = navigator.connection;

    this.recordMetric('Network', 0, {
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
      saveData: connection.saveData
    });

    // Monitor connection changes
    connection.addEventListener('change', () => {
      this.recordMetric('NetworkChange', Date.now(), {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt
      });
    });
  }

  /**
   * Track memory usage
   */
  trackMemoryUsage() {
    const logMemory = () => {
      if (!performance.memory) return;

      const memory = {
        usedMB: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        totalMB: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        limitMB: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
        percentUsed: Math.round((performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100)
      };

      this.recordMetric('Memory', memory.usedMB, memory);
    };

    // Log every 10 seconds
    setInterval(logMemory, 10000);
    logMemory(); // Initial log
  }

  /**
   * Track frame rate
   */
  trackFrameRate() {
    let lastTime = performance.now();
    let frames = 0;
    let fps = 0;

    const measureFPS = () => {
      frames++;
      const now = performance.now();
      const delta = now - lastTime;

      if (delta >= 1000) {
        fps = Math.round((frames * 1000) / delta);
        frames = 0;
        lastTime = now;

        this.recordMetric('FPS', fps, {
          rating: fps >= 55 ? 'good' : fps >= 30 ? 'needs-improvement' : 'poor'
        });
      }

      requestAnimationFrame(measureFPS);
    };

    requestAnimationFrame(measureFPS);
  }

  /**
   * Create performance mark
   */
  mark(name) {
    try {
      performance.mark(name);
      this.marks.set(name, performance.now());
      console.log(`[Perf] Mark: ${name}`);
    } catch (error) {
      console.warn(`[Perf] Failed to create mark ${name}:`, error);
    }
  }

  /**
   * Measure time between marks
   */
  measure(name, startMark, endMark = null) {
    try {
      if (!endMark) {
        endMark = `${startMark}-end`;
        this.mark(endMark);
      }

      performance.measure(name, startMark, endMark);

      const measure = performance.getEntriesByName(name, 'measure')[0];
      if (measure) {
        const duration = measure.duration;
        this.recordMetric(name, duration, {
          startMark,
          endMark
        });

        console.log(`[Perf] ${name}: ${duration.toFixed(2)}ms`);
        return duration;
      }
    } catch (error) {
      console.warn(`[Perf] Failed to measure ${name}:`, error);
    }
    return 0;
  }

  /**
   * Record custom metric
   */
  recordMetric(name, value, metadata = {}) {
    const timestamp = Date.now();

    this.metrics[name] = {
      value,
      metadata,
      timestamp
    };

    // Send to Firebase Performance if available
    this.sendToFirebase(name, value, metadata);

    // Log to console (can be disabled in production)
    if (metadata.rating) {
      const emoji = metadata.rating === 'good' ? '✅' : metadata.rating === 'needs-improvement' ? '⚠️' : '❌';
      console.log(`[Perf] ${emoji} ${name}: ${value.toFixed ? value.toFixed(2) : value}${typeof value === 'number' ? 'ms' : ''}`, metadata);
    }
  }

  /**
   * Send metrics to Firebase Performance Monitoring
   */
  async sendToFirebase(name, value, metadata) {
    // This will be integrated with Firebase Performance SDK
    // For now, we'll use custom events through analytics
    try {
      if (typeof gtag !== 'undefined') {
        gtag('event', name, {
          event_category: 'Performance',
          value: Math.round(value),
          ...metadata
        });
      }
    } catch (error) {
      // Firebase not available, skip
    }
  }

  /**
   * Get all metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Get metric by name
   */
  getMetric(name) {
    return this.metrics[name] || null;
  }

  /**
   * Track volumetric video load
   */
  trackVideoLoad(videoId, startTime) {
    const loadTime = performance.now() - startTime;

    this.recordMetric('VideoLoadTime', loadTime, {
      videoId,
      rating: loadTime < 3000 ? 'good' : loadTime < 5000 ? 'needs-improvement' : 'poor'
    });

    return loadTime;
  }

  /**
   * Track decode performance
   */
  trackDecodePerformance(framesDecoded, timeElapsed) {
    const framesPerSecond = (framesDecoded / timeElapsed) * 1000;

    this.recordMetric('DecodePerformance', framesPerSecond, {
      framesDecoded,
      timeElapsed,
      rating: framesPerSecond >= 25 ? 'good' : framesPerSecond >= 15 ? 'needs-improvement' : 'poor'
    });

    return framesPerSecond;
  }

  /**
   * Track AR session
   */
  trackARSession(duration, interactions) {
    this.recordMetric('ARSessionDuration', duration, {
      interactions,
      rating: duration > 30000 ? 'good' : 'short'
    });
  }

  /**
   * Track network request
   */
  trackNetworkRequest(url, startTime, size) {
    const duration = performance.now() - startTime;
    const throughput = (size / duration) * 1000; // bytes per second

    this.recordMetric('NetworkRequest', duration, {
      url: new URL(url).pathname,
      size,
      throughput: Math.round(throughput / 1024), // KB/s
      rating: duration < 1000 ? 'good' : duration < 3000 ? 'needs-improvement' : 'poor'
    });
  }

  /**
   * Generate performance report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      metrics: this.getMetrics(),
      summary: {
        webVitals: {
          LCP: this.metrics.LCP,
          FID: this.metrics.FID,
          INP: this.metrics.INP,
          CLS: this.metrics.CLS,
          TTFB: this.metrics.TTFB,
          FCP: this.metrics.FCP
        },
        custom: {
          VideoLoadTime: this.metrics.VideoLoadTime,
          DecodePerformance: this.metrics.DecodePerformance,
          FPS: this.metrics.FPS,
          Memory: this.metrics.Memory
        },
        network: this.metrics.Network
      }
    };

    console.log('[Perf] Performance Report:', report);
    return report;
  }

  /**
   * Export metrics as JSON
   */
  exportMetrics() {
    const data = JSON.stringify(this.generateReport(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('[Perf] Metrics exported');
  }
}

// Export singleton instance
export const perfMonitor = new PerformanceMonitor();

// Auto-initialize on import
perfMonitor.init();
