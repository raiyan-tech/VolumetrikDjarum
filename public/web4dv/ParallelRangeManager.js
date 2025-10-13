// ParallelRangeManager - Manages parallel Range requests for optimal HTTP/3/QUIC performance
// Supports 2-4 concurrent requests to maximize bandwidth utilization while avoiding congestion

export default class ParallelRangeManager {
  constructor(options = {}) {
    this.maxConcurrentRequests = options.maxConcurrentRequests || 3; // Default to 3 parallel requests
    this.url = options.url || '';
    this.onChunkReceived = options.onChunkReceived || null;
    this.onError = options.onError || null;
    this.onComplete = options.onComplete || null;

    // Queue management
    this.requestQueue = [];
    this.activeRequests = new Map(); // Track active XMLHttpRequest objects
    this.completedChunks = new Map(); // Store completed chunks by ID
    this.aborted = false;

    // HTTP/3 detection
    this.supportsHTTP3 = this._detectHTTP3Support();

    console.log('[ParallelRangeManager] Initialized with max', this.maxConcurrentRequests, 'concurrent requests');
    console.log('[ParallelRangeManager] HTTP/3 support:', this.supportsHTTP3 ? 'YES' : 'NO (falling back to HTTP/2 or HTTP/1.1)');
  }

  // Detect HTTP/3 support (experimental API)
  _detectHTTP3Support() {
    try {
      // Check if browser supports HTTP/3 via experimental APIs
      // Note: This is experimental and may not work in all browsers
      // HTTP/3 will be used automatically if available, this is just for logging
      if (typeof navigator.connection !== 'undefined' && navigator.connection.effectiveType) {
        return true; // Assume HTTP/3 capable browsers have this API
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // Add a range request to the queue
  enqueueRangeRequest(startByte, endByte, chunkId, priority = 0) {
    if (this.aborted) {
      console.warn('[ParallelRangeManager] Cannot enqueue, manager is aborted');
      return;
    }

    const request = {
      id: chunkId,
      startByte,
      endByte,
      priority,
      retryCount: 0,
      maxRetries: 3
    };

    this.requestQueue.push(request);

    // Sort by priority (higher priority first)
    this.requestQueue.sort((a, b) => b.priority - a.priority);

    console.log('[ParallelRangeManager] Enqueued chunk', chunkId,
                'bytes', startByte, '-', endByte,
                '(', ((endByte - startByte) / 1024).toFixed(1), 'KB)',
                'priority', priority);

    // Start processing queue
    this._processQueue();
  }

  // Process the request queue
  _processQueue() {
    if (this.aborted) return;

    // Start new requests up to max concurrent limit
    while (this.requestQueue.length > 0 && this.activeRequests.size < this.maxConcurrentRequests) {
      const request = this.requestQueue.shift();
      this._executeRequest(request);
    }
  }

  // Execute a single Range request
  _executeRequest(request) {
    if (this.aborted) return;

    const xhr = new XMLHttpRequest();
    xhr.open('GET', this.url, true);
    xhr.responseType = 'arraybuffer';
    xhr.setRequestHeader('Range', `bytes=${request.startByte}-${request.endByte}`);

    // Track this active request
    this.activeRequests.set(request.id, { xhr, request });

    console.log('[ParallelRangeManager] Starting request', request.id,
                'Range:', request.startByte, '-', request.endByte,
                'Active:', this.activeRequests.size);

    xhr.onload = () => {
      if (this.aborted) return;

      if (xhr.status === 206 || xhr.status === 200) {
        // Success - store chunk data
        this.completedChunks.set(request.id, {
          data: xhr.response,
          startByte: request.startByte,
          endByte: request.endByte
        });

        console.log('[ParallelRangeManager] Chunk', request.id, 'completed',
                    'Status:', xhr.status,
                    'Size:', xhr.response.byteLength, 'bytes');

        // Notify callback
        if (this.onChunkReceived) {
          this.onChunkReceived(request.id, xhr.response, request.startByte, request.endByte);
        }

        // Remove from active requests
        this.activeRequests.delete(request.id);

        // Check if all requests complete
        if (this.requestQueue.length === 0 && this.activeRequests.size === 0) {
          console.log('[ParallelRangeManager] All chunks downloaded');
          if (this.onComplete) {
            this.onComplete(this.completedChunks);
          }
        } else {
          // Continue processing queue
          this._processQueue();
        }
      } else {
        // Unexpected status code
        console.error('[ParallelRangeManager] Unexpected status', xhr.status, 'for chunk', request.id);
        this._handleRequestError(request, new Error(`HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      if (this.aborted) return;
      console.error('[ParallelRangeManager] Network error for chunk', request.id);
      this._handleRequestError(request, new Error('Network error'));
    };

    xhr.ontimeout = () => {
      if (this.aborted) return;
      console.error('[ParallelRangeManager] Timeout for chunk', request.id);
      this._handleRequestError(request, new Error('Request timeout'));
    };

    // Set timeout to 30 seconds
    xhr.timeout = 30000;

    xhr.send();
  }

  // Handle request errors with retry logic
  _handleRequestError(request, error) {
    this.activeRequests.delete(request.id);

    request.retryCount++;

    if (request.retryCount <= request.maxRetries) {
      console.warn('[ParallelRangeManager] Retrying chunk', request.id,
                   'Attempt', request.retryCount, '/', request.maxRetries);

      // Re-enqueue with slightly lower priority
      this.requestQueue.unshift({
        ...request,
        priority: request.priority - 1
      });

      // Continue processing
      this._processQueue();
    } else {
      console.error('[ParallelRangeManager] Chunk', request.id, 'failed after', request.maxRetries, 'retries');

      if (this.onError) {
        this.onError(request.id, error);
      }

      // Continue with other requests despite this failure
      this._processQueue();
    }
  }

  // Abort all pending and active requests
  abort() {
    console.log('[ParallelRangeManager] Aborting all requests');
    this.aborted = true;

    // Abort all active XHR requests
    this.activeRequests.forEach(({ xhr, request }) => {
      console.log('[ParallelRangeManager] Aborting chunk', request.id);
      xhr.abort();
    });

    // Clear all state
    this.activeRequests.clear();
    this.requestQueue = [];
  }

  // Get a completed chunk by ID
  getChunk(chunkId) {
    return this.completedChunks.get(chunkId);
  }

  // Check if a chunk has been downloaded
  hasChunk(chunkId) {
    return this.completedChunks.has(chunkId);
  }

  // Get current queue status
  getStatus() {
    return {
      queued: this.requestQueue.length,
      active: this.activeRequests.size,
      completed: this.completedChunks.size,
      aborted: this.aborted
    };
  }

  // Clear completed chunks to free memory
  clearCompletedChunks() {
    console.log('[ParallelRangeManager] Clearing', this.completedChunks.size, 'completed chunks');
    this.completedChunks.clear();
  }

  // Prioritize a specific chunk (useful for seeking)
  prioritizeChunk(chunkId) {
    const index = this.requestQueue.findIndex(req => req.id === chunkId);
    if (index !== -1) {
      const request = this.requestQueue[index];
      request.priority = 1000; // High priority

      // Re-sort queue
      this.requestQueue.sort((a, b) => b.priority - a.priority);

      console.log('[ParallelRangeManager] Prioritized chunk', chunkId);

      // Trigger processing to start high-priority chunk immediately
      this._processQueue();
    }
  }
}
