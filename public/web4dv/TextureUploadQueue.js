// TextureUploadQueue - Throttles GPU texture uploads to prevent stalls during seeking
// Spreads texture uploads across multiple frames for smooth playback

export default class TextureUploadQueue {
  constructor(options = {}) {
    this.maxUploadsPerFrame = options.maxUploadsPerFrame || 2; // Limit GPU uploads per frame
    this.uploadIntervalMs = options.uploadIntervalMs || 16; // ~60fps upload rate
    this.renderer = options.renderer || null;

    // Queue management
    this.uploadQueue = [];
    this.processing = false;
    this.uploadTimer = null;
    this.uploadedThisFrame = 0;
    this.lastUploadTime = 0;

    // Statistics
    this.stats = {
      totalUploaded: 0,
      totalQueued: 0,
      uploadsThisSecond: 0,
      lastStatsReset: performance.now()
    };

    console.log('[TextureUploadQueue] Initialized with max',
                this.maxUploadsPerFrame, 'uploads per frame');
  }

  // Enqueue a texture for lazy upload
  enqueueTexture(texture, priority = 0, metadata = {}) {
    if (!texture) {
      console.warn('[TextureUploadQueue] Cannot enqueue null texture');
      return;
    }

    const uploadTask = {
      texture,
      priority,
      metadata,
      timestamp: performance.now()
    };

    this.uploadQueue.push(uploadTask);
    this.stats.totalQueued++;

    // Sort by priority (higher first)
    this.uploadQueue.sort((a, b) => b.priority - a.priority);

    console.log('[TextureUploadQueue] Enqueued texture, priority', priority,
                'Queue size:', this.uploadQueue.length);

    // Start processing if not already running
    if (!this.processing) {
      this._startProcessing();
    }
  }

  // Start processing the upload queue
  _startProcessing() {
    if (this.processing) return;

    this.processing = true;
    console.log('[TextureUploadQueue] Started processing upload queue');

    this._processQueue();
  }

  // Process texture uploads with throttling
  _processQueue() {
    if (!this.processing || this.uploadQueue.length === 0) {
      this.processing = false;
      console.log('[TextureUploadQueue] Stopped processing (queue empty)');
      return;
    }

    const now = performance.now();
    const timeSinceLastUpload = now - this.lastUploadTime;

    // Throttle uploads to prevent GPU stalls
    if (timeSinceLastUpload < this.uploadIntervalMs) {
      // Wait before next upload
      this.uploadTimer = setTimeout(() => {
        this._processQueue();
      }, this.uploadIntervalMs - timeSinceLastUpload);
      return;
    }

    // Upload a batch of textures (up to maxUploadsPerFrame)
    let uploaded = 0;
    while (uploaded < this.maxUploadsPerFrame && this.uploadQueue.length > 0) {
      const task = this.uploadQueue.shift();
      this._uploadTexture(task);
      uploaded++;
    }

    this.lastUploadTime = performance.now();

    // Update stats
    this.stats.uploadsThisSecond += uploaded;
    if (now - this.stats.lastStatsReset > 1000) {
      console.log('[TextureUploadQueue] Upload rate:',
                  this.stats.uploadsThisSecond, 'textures/sec',
                  'Queue:', this.uploadQueue.length);
      this.stats.uploadsThisSecond = 0;
      this.stats.lastStatsReset = now;
    }

    // Continue processing
    this.uploadTimer = setTimeout(() => {
      this._processQueue();
    }, this.uploadIntervalMs);
  }

  // Upload a single texture to GPU
  _uploadTexture(task) {
    try {
      const { texture, metadata } = task;

      // Force texture upload to GPU
      if (this.renderer && this.renderer.initTexture) {
        this.renderer.initTexture(texture);
        console.log('[TextureUploadQueue] Uploaded texture to GPU',
                    metadata.name || 'unnamed',
                    metadata.width, 'x', metadata.height);
      } else {
        // Fallback: trigger upload by marking needsUpdate
        texture.needsUpdate = true;
        console.log('[TextureUploadQueue] Marked texture for upload',
                    metadata.name || 'unnamed');
      }

      this.stats.totalUploaded++;
    } catch (error) {
      console.error('[TextureUploadQueue] Failed to upload texture:', error);
    }
  }

  // Prioritize textures for a specific frame (useful during seeking)
  prioritizeFrame(frameNumber, highPriority = 1000) {
    let prioritized = 0;

    this.uploadQueue.forEach(task => {
      if (task.metadata.frameNumber === frameNumber) {
        task.priority = highPriority;
        prioritized++;
      }
    });

    if (prioritized > 0) {
      // Re-sort queue
      this.uploadQueue.sort((a, b) => b.priority - a.priority);
      console.log('[TextureUploadQueue] Prioritized', prioritized,
                  'textures for frame', frameNumber);
    }

    return prioritized;
  }

  // Clear the upload queue
  clear() {
    console.log('[TextureUploadQueue] Clearing queue, discarding',
                this.uploadQueue.length, 'pending uploads');

    this.uploadQueue = [];
    this.processing = false;

    if (this.uploadTimer) {
      clearTimeout(this.uploadTimer);
      this.uploadTimer = null;
    }
  }

  // Pause processing
  pause() {
    console.log('[TextureUploadQueue] Paused');
    this.processing = false;

    if (this.uploadTimer) {
      clearTimeout(this.uploadTimer);
      this.uploadTimer = null;
    }
  }

  // Resume processing
  resume() {
    console.log('[TextureUploadQueue] Resumed');
    if (!this.processing && this.uploadQueue.length > 0) {
      this._startProcessing();
    }
  }

  // Get current queue status
  getStatus() {
    return {
      queueSize: this.uploadQueue.length,
      processing: this.processing,
      totalUploaded: this.stats.totalUploaded,
      totalQueued: this.stats.totalQueued,
      uploadRate: this.stats.uploadsThisSecond
    };
  }

  // Adjust throttling parameters dynamically
  setThrottling(maxUploadsPerFrame, uploadIntervalMs) {
    this.maxUploadsPerFrame = maxUploadsPerFrame;
    this.uploadIntervalMs = uploadIntervalMs;

    console.log('[TextureUploadQueue] Updated throttling:',
                maxUploadsPerFrame, 'uploads per frame,',
                uploadIntervalMs, 'ms interval');
  }

  // Destroy the queue
  destroy() {
    console.log('[TextureUploadQueue] Destroying queue');

    this.clear();
    this.renderer = null;
    this.stats = {
      totalUploaded: 0,
      totalQueued: 0,
      uploadsThisSecond: 0,
      lastStatsReset: performance.now()
    };
  }
}
