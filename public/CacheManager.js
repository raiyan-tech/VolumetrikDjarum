// CacheManager.js
// IndexedDB-based caching system for 4DS volumetric video files
// Optimized for mobile devices to enable offline playback

const DB_NAME = 'Volumetrik4DSCache';
const DB_VERSION = 1;
const STORE_NAME = 'videos';

class CacheManager {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  // Initialize IndexedDB
  async init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[CacheManager] Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[CacheManager] IndexedDB initialized');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'videoId' });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          objectStore.createIndex('size', 'size', { unique: false });
          console.log('[CacheManager] Created object store:', STORE_NAME);
        }
      };
    });

    return this.initPromise;
  }

  // Cache a video by downloading and storing in IndexedDB
  async cacheVideo(videoId, url, onProgress = null) {
    try {
      await this.init();

      console.log('[CacheManager] Starting cache download for', videoId, 'from', url);

      // Check if already cached
      const existing = await this.getCachedVideo(videoId);
      if (existing) {
        console.log('[CacheManager] Video already cached:', videoId);
        return { success: true, fromCache: true };
      }

      // Download the file with progress tracking
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      console.log('[CacheManager] Downloading', videoId, 'Size:', (total / 1024 / 1024).toFixed(1), 'MB');

      // Read the response body as a stream for progress tracking
      const reader = response.body.getReader();
      const chunks = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        // Call progress callback
        if (onProgress && total > 0) {
          const percent = (receivedLength / total) * 100;
          onProgress({
            loaded: receivedLength,
            total: total,
            percent: percent
          });
        }
      }

      // Combine chunks into a single Uint8Array
      const allChunks = new Uint8Array(receivedLength);
      let position = 0;
      for (const chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
      }

      // Create blob from the combined data
      const blob = new Blob([allChunks], { type: 'application/octet-stream' });

      console.log('[CacheManager] Downloaded', videoId, 'Size:', (blob.size / 1024 / 1024).toFixed(1), 'MB');

      // Store in IndexedDB
      const cacheEntry = {
        videoId: videoId,
        url: url,
        blob: blob,
        size: blob.size,
        timestamp: Date.now()
      };

      await this._putEntry(cacheEntry);

      console.log('[CacheManager] Cached successfully:', videoId);

      return { success: true, size: blob.size };

    } catch (error) {
      console.error('[CacheManager] Cache failed for', videoId, ':', error);

      // Check if it's a quota exceeded error
      if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
        return {
          success: false,
          error: 'Storage quota exceeded. Please clear some cached videos first.',
          quotaExceeded: true
        };
      }

      return { success: false, error: error.message };
    }
  }

  // Get a cached video blob
  async getCachedVideo(videoId) {
    try {
      await this.init();

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.get(videoId);

        request.onsuccess = () => {
          const entry = request.result;
          if (entry) {
            console.log('[CacheManager] Found cached video:', videoId, 'Size:', (entry.size / 1024 / 1024).toFixed(1), 'MB');
            resolve(entry);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error('[CacheManager] Failed to get cached video:', request.error);
          reject(request.error);
        };
      });

    } catch (error) {
      console.error('[CacheManager] Get cache failed:', error);
      return null;
    }
  }

  // Check if a video is cached
  async isCached(videoId) {
    const entry = await this.getCachedVideo(videoId);
    return entry !== null;
  }

  // Delete a cached video
  async deleteCachedVideo(videoId) {
    try {
      await this.init();

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.delete(videoId);

        request.onsuccess = () => {
          console.log('[CacheManager] Deleted cached video:', videoId);
          resolve(true);
        };

        request.onerror = () => {
          console.error('[CacheManager] Failed to delete cached video:', request.error);
          reject(request.error);
        };
      });

    } catch (error) {
      console.error('[CacheManager] Delete cache failed:', error);
      return false;
    }
  }

  // Get all cached video IDs and their metadata
  async getAllCachedVideos() {
    try {
      await this.init();

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.getAll();

        request.onsuccess = () => {
          const entries = request.result || [];
          // Return metadata without the heavy blob data
          const metadata = entries.map(entry => ({
            videoId: entry.videoId,
            url: entry.url,
            size: entry.size,
            timestamp: entry.timestamp
          }));
          resolve(metadata);
        };

        request.onerror = () => {
          console.error('[CacheManager] Failed to get all cached videos:', request.error);
          reject(request.error);
        };
      });

    } catch (error) {
      console.error('[CacheManager] Get all cache failed:', error);
      return [];
    }
  }

  // Get total cache size
  async getTotalCacheSize() {
    try {
      const allVideos = await this.getAllCachedVideos();
      const totalSize = allVideos.reduce((sum, video) => sum + (video.size || 0), 0);
      return totalSize;
    } catch (error) {
      console.error('[CacheManager] Get total cache size failed:', error);
      return 0;
    }
  }

  // Clear all cached videos
  async clearAllCache() {
    try {
      await this.init();

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.clear();

        request.onsuccess = () => {
          console.log('[CacheManager] Cleared all cached videos');
          resolve(true);
        };

        request.onerror = () => {
          console.error('[CacheManager] Failed to clear cache:', request.error);
          reject(request.error);
        };
      });

    } catch (error) {
      console.error('[CacheManager] Clear all cache failed:', error);
      return false;
    }
  }

  // Get storage quota information
  async getStorageQuota() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
          percentUsed: estimate.quota > 0 ? (estimate.usage / estimate.quota) * 100 : 0
        };
      }
      return null;
    } catch (error) {
      console.error('[CacheManager] Get storage quota failed:', error);
      return null;
    }
  }

  // Helper method to put an entry in the database
  _putEntry(entry) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.put(entry);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

// Export a singleton instance
export default new CacheManager();
