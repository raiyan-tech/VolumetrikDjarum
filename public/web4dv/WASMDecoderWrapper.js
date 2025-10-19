// **********************************************************
//
// WASM Decoder Wrapper for WEB4DS
// Provides a high-level interface for WASM-based decoding
//
// Features:
// - Async WASM module loading
// - Memory-efficient frame decoding
// - Worker thread management
// - Performance monitoring
//
// **********************************************************

export class WASMDecoderWrapper {
  constructor() {
    this.wasmModule = null;
    this.wasmInstance = null;
    this.codecInstance = null;
    this.isInitialized = false;
    this.isLoading = false;
    this.workers = [];
    this.maxWorkers = navigator.hardwareConcurrency || 4;
    this.workerPool = [];
    this.decodingQueue = [];
    this.performanceMetrics = {
      totalFramesDecoded: 0,
      averageDecodeTime: 0,
      peakDecodeTime: 0
    };
  }

  /**
   * Initialize WASM decoder module
   * @param {string} wasmPath - Path to WASM file
   * @returns {Promise<boolean>} - Success status
   */
  async initialize(wasmPath = './web4dv/CODEC.wasm') {
    if (this.isInitialized) {
      console.log('[WASMDecoder] Already initialized');
      return true;
    }

    if (this.isLoading) {
      console.log('[WASMDecoder] Initialization in progress, waiting...');
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.isInitialized) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 100);
      });
    }

    this.isLoading = true;
    console.log('[WASMDecoder] Initializing WASM decoder...');

    try {
      // Load WASM module
      const wasmBuffer = await this._loadWASM(wasmPath);

      // Instantiate WASM module
      const wasmResult = await WebAssembly.instantiate(wasmBuffer, {
        env: {
          // Provide minimal environment for WASM
          memory: new WebAssembly.Memory({ initial: 256, maximum: 512 }),
          abort: () => console.error('[WASMDecoder] WASM abort called')
        }
      });

      this.wasmInstance = wasmResult.instance;
      this.wasmModule = wasmResult.module;

      // Initialize decoder instance (stub - actual implementation depends on WASM exports)
      if (this.wasmInstance.exports.createDecoder) {
        this.codecInstance = this.wasmInstance.exports.createDecoder();
        console.log('[WASMDecoder] Codec instance created');
      }

      this.isInitialized = true;
      this.isLoading = false;
      console.log('[WASMDecoder] Initialization complete');

      // Initialize worker pool for parallel decoding
      await this._initializeWorkerPool();

      return true;
    } catch (error) {
      console.error('[WASMDecoder] Initialization failed:', error);
      this.isLoading = false;
      return false;
    }
  }

  /**
   * Load WASM file
   * @private
   */
  async _loadWASM(wasmPath) {
    try {
      if (typeof fetch !== 'undefined') {
        const response = await fetch(wasmPath);
        if (!response.ok) {
          throw new Error(`Failed to fetch WASM: ${response.status}`);
        }
        return await response.arrayBuffer();
      } else {
        // Fallback for environments without fetch
        throw new Error('Fetch API not available');
      }
    } catch (error) {
      console.error('[WASMDecoder] WASM load failed:', error);
      throw error;
    }
  }

  /**
   * Initialize worker pool for parallel decoding
   * @private
   */
  async _initializeWorkerPool() {
    console.log('[WASMDecoder] Creating worker pool with', this.maxWorkers, 'workers');

    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = this._createWorker(i);
      this.workerPool.push({
        id: i,
        worker: worker,
        busy: false
      });
    }

    console.log('[WASMDecoder] Worker pool initialized');
  }

  /**
   * Create a decoder worker
   * @private
   */
  _createWorker(workerId) {
    const workerCode = `
      let wasmModule = null;
      let codecInstance = null;

      self.onmessage = async function(e) {
        const { type, data, taskId } = e.data;

        switch (type) {
          case 'INIT_WASM':
            try {
              // Initialize WASM in worker
              const wasmBuffer = data.wasmBuffer;
              const wasmResult = await WebAssembly.instantiate(wasmBuffer, {
                env: {
                  memory: new WebAssembly.Memory({ initial: 256, maximum: 512 }),
                  abort: () => console.error('[Worker ${workerId}] WASM abort')
                }
              });
              wasmModule = wasmResult.instance;
              self.postMessage({ type: 'INIT_SUCCESS', workerId: ${workerId} });
            } catch (error) {
              self.postMessage({ type: 'INIT_ERROR', error: error.message });
            }
            break;

          case 'DECODE_CHUNK':
            try {
              const startTime = performance.now();

              // Decode chunk (stub - actual implementation depends on WASM exports)
              // In real implementation, this would call WASM decoder functions
              const result = {
                frame: data.frame,
                vertices: data.vertices,
                faces: data.faces,
                uvs: data.uvs,
                normals: data.normals,
                texture: data.texture
              };

              const decodeTime = performance.now() - startTime;

              self.postMessage({
                type: 'DECODE_SUCCESS',
                taskId: taskId,
                result: result,
                decodeTime: decodeTime
              }, [
                result.vertices?.buffer,
                result.faces?.buffer,
                result.uvs?.buffer,
                result.normals?.buffer,
                result.texture?.buffer
              ].filter(Boolean));
            } catch (error) {
              self.postMessage({
                type: 'DECODE_ERROR',
                taskId: taskId,
                error: error.message
              });
            }
            break;
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));

    // Initialize worker with WASM module
    if (this.wasmModule) {
      worker.postMessage({
        type: 'INIT_WASM',
        data: { wasmBuffer: this.wasmModule }
      });
    }

    return worker;
  }

  /**
   * Decode a chunk asynchronously
   * @param {object} chunkData - Chunk data to decode
   * @returns {Promise<object>} - Decoded mesh data
   */
  async decodeChunkAsync(chunkData) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      // Find available worker
      const availableWorker = this.workerPool.find(w => !w.busy);

      if (!availableWorker) {
        // Queue task if no workers available
        this.decodingQueue.push({ chunkData, resolve, reject });
        return;
      }

      // Mark worker as busy
      availableWorker.busy = true;
      const taskId = Date.now() + Math.random();

      // Set up response handler
      const handleMessage = (e) => {
        if (e.data.taskId === taskId) {
          availableWorker.worker.removeEventListener('message', handleMessage);
          availableWorker.busy = false;

          if (e.data.type === 'DECODE_SUCCESS') {
            // Update performance metrics
            this.performanceMetrics.totalFramesDecoded++;
            this.performanceMetrics.averageDecodeTime =
              (this.performanceMetrics.averageDecodeTime * (this.performanceMetrics.totalFramesDecoded - 1) + e.data.decodeTime)
              / this.performanceMetrics.totalFramesDecoded;
            this.performanceMetrics.peakDecodeTime = Math.max(
              this.performanceMetrics.peakDecodeTime,
              e.data.decodeTime
            );

            resolve(e.data.result);

            // Process queue if tasks waiting
            this._processQueue();
          } else if (e.data.type === 'DECODE_ERROR') {
            reject(new Error(e.data.error));
          }
        }
      };

      availableWorker.worker.addEventListener('message', handleMessage);

      // Send decode task to worker
      availableWorker.worker.postMessage({
        type: 'DECODE_CHUNK',
        taskId: taskId,
        data: chunkData
      });
    });
  }

  /**
   * Process queued decoding tasks
   * @private
   */
  _processQueue() {
    if (this.decodingQueue.length === 0) return;

    const availableWorker = this.workerPool.find(w => !w.busy);
    if (!availableWorker) return;

    const task = this.decodingQueue.shift();
    this.decodeChunkAsync(task.chunkData)
      .then(task.resolve)
      .catch(task.reject);
  }

  /**
   * Get performance metrics
   * @returns {object} - Performance statistics
   */
  getMetrics() {
    return {
      ...this.performanceMetrics,
      queueLength: this.decodingQueue.length,
      activeWorkers: this.workerPool.filter(w => w.busy).length,
      totalWorkers: this.workerPool.length
    };
  }

  /**
   * Clean up decoder resources
   */
  destroy() {
    console.log('[WASMDecoder] Destroying decoder...');

    // Terminate all workers
    this.workerPool.forEach(w => {
      w.worker.terminate();
    });
    this.workerPool = [];
    this.decodingQueue = [];

    // Clean up WASM instance
    if (this.codecInstance) {
      // Call WASM cleanup if available
      if (this.wasmInstance?.exports?.destroyDecoder) {
        this.wasmInstance.exports.destroyDecoder(this.codecInstance);
      }
      this.codecInstance = null;
    }

    this.wasmInstance = null;
    this.wasmModule = null;
    this.isInitialized = false;

    console.log('[WASMDecoder] Decoder destroyed');
  }
}

export default WASMDecoderWrapper;
