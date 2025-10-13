// **********************************************************
//
// WEB4DV
// THREE.js plug-in for 4Dviews volumetric video sequences
//
// Version: 3.1.0
// Release date: October 2021
//
// Copyright: 4D View Solutions SAS
// Authors: M.Adam & T.Groubet
//
// Modified: HTTP/3/QUIC optimization with parallel Range requests
//
// **********************************************************

import ParallelRangeManager from './ParallelRangeManager.js'

class ChunkSerialized {
  constructor() {
    this.type = 0
    this.codec = 0
    this.version = 0
    this.size = 0
    this.data = null
  }
}

function worker_function() {
  let ModuleInstance = null
  let codecInstance = null

  importScripts('https://dev.fourdviews.com/js/CODEC.js')
  Module.onRuntimeInitialized = function () {
    codecInstance = new Module.LinearEBD4DVDecoder()
    ModuleInstance = Module
    console.log('Module Instance created')
  }

  onmessage = function (e) {
    const chunk4d = new ModuleInstance.Chunk(e.data[0], e.data[1], e.data[2], e.data[3], e.data[4])
    const mesh = codecInstance.AddChunk(chunk4d)
    chunk4d.delete()

    if (mesh) {
      const vview = new Float32Array(mesh.GetVertices())
      const fview = new Int32Array(mesh.GetFaces())
      const uvview = new Float32Array(mesh.GetUVs())
      const nview = new Float32Array(mesh.GetNormals())
      const tview = new Int8Array(mesh.GetTexture())

      postMessage({
        frame: mesh.frame,
        nbVertices: mesh.nbVertices,
        nbFaces: mesh.nbFaces,
        textureBufferSize: mesh.textureBufferSize,
        textureEncoding: mesh.textureEncoding,
        vertices: vview,
        faces: fview,
        uvs: uvview,
        normals: nview,
        texture: tview,
      }, [vview.buffer, fview.buffer, uvview.buffer, nview.buffer, tview.buffer])

      mesh.delete()
    }
  }
}
if (window != self) worker_function()

class Decoder {
  constructor() {
    // this._codecInstance = null
    this._chunks4D = []
    this._meshesCache = []
    this._curChunkIndex = 0
    this._keepChunksInCache = false
    this._maxCacheSize = 20
    this._decodeWorker = new Worker(URL.createObjectURL(new Blob([`(${worker_function.toString()})()`], {type: 'text/javascript'})))

    const parent = this
    this._decodeWorker.onmessage = function (e) {
      parent._meshesCache.push(e.data)
    }

    this._decodeWorker.onerror = function (e) {
      console.log(`decode worker error : ${e.message}`)
    }
  }

  Destroy() {
    this._decodeWorker.delete()
  }

  SetInputTextureEncoding(encoding) {
  }

  DecodeChunk() {
    if (this._meshesCache.length >= this._maxCacheSize) return

    let chunk4D = null

    if (this._keepChunksInCache) {
      chunk4D = this._chunks4D[this._curChunkIndex]
      if (this._curChunkIndex < this._chunks4D.length) {
        this._curChunkIndex++
      } else {
        this._curChunkIndex = 0
      }
    } else {
      chunk4D = this._chunks4D.shift()
    }

    if (chunk4D) {
      this._decodeWorker.postMessage([chunk4D.type, chunk4D.codec, chunk4D.version, chunk4D.size, chunk4D.data])

      if (this._keepChunksInCache && this._curChunkIndex >= this._chunks4D.length) {
        this._curChunkIndex = 0
      }
    }
  }
}

export const Decoder4D = new Decoder()

class BlocInfo {
  constructor(keyFrameId, nbInterFrames, blocChunkPos) {
    this.KeyFrameId = keyFrameId
    this.NbInterFrames = nbInterFrames
    this.BlocChunkPos = blocChunkPos
  }
}

export default class ResourceManagerXHR {
  constructor() {
    this._internalCacheSize = 2000000  // 2MB - reduced for smaller parallel chunks (HTTP/3 optimization)

    this._sequenceInfo = {
      NbFrames: 0,
      NbBlocs: 0,
      FrameRate: 0,
      MaxVertices: 0,
      MaxTriangles: 0,
      TextureEncoding: 0,
      TextureSizeX: 0,
      TextureSizeY: 0,
      NbAdditionalTracks: 0,
    }

    this._pointerToSequenceInfo = 0
    this._pointerToBlocIndex = 0
    this._pointerToTrackIndex = 0

    this._blocInfos = []
    this._KFPositions = []
    this._currentBlocIndex = 0
    this._firstBlocIndex = 0
    this._lastBlocIndex = 0

    this._tracksPositions = []
    this._audioTrack = []

    this._isInitialized = false
    this._isDownloading = false

    this._file4ds = ''

    // HTTP/3/QUIC optimization: Parallel Range request manager
    this._parallelManager = null
    this._useParallelDownloads = true
    this._maxParallelRequests = 3
  }

  Open(callbackFunction) {
    this._callback = callbackFunction

    this.getFileHeader()
  }

  SetXHR(firstByte, lastByte) {
    const xhr = new XMLHttpRequest()

    if (!this._file4ds) {
      console.error('[ResourceManager] No 4DS file set! Cannot create XHR request.')
      return null
    }

    xhr.open('GET', this._file4ds)
    // xhr.onreadystatechange = handler;
    xhr.responseType = 'arraybuffer'
    xhr.overrideMimeType('arrayBuffer; charset=x-user-defined')

    xhr.setRequestHeader('Range', `bytes=${firstByte}-${lastByte}`)

    //xhr.send()  // for POST, can send a string or FormData

    return xhr
  }

  getOneChunk(position) {
    // console.log(`request range ${position} - ${position + 9}`)
    const xhr = this.SetXHR(position, position + 9)

    if (!xhr) {
      console.error('[ResourceManager] Failed to create XHR for getOneChunk')
      return
    }

    const parent = this

    xhr.onload = function () {
      if (xhr.status === 206) {
        const headerChunk = xhr.response

        const dv = new DataView(headerChunk)
        const type = dv.getUint8(0, true)
        const codec = dv.getUint16(1, true)
        const version = dv.getUint16(3, true)
        const chunkSize = dv.getUint32(5, true)

        const chunkHeader = {Type: type, Codec: codec, Version: version, Size: chunkSize}

        if (chunkHeader.Type === 1) {
          parent.getSequenceInfo(position + 9, chunkHeader.Size)
        } else if (chunkHeader.Type === 2) {
          parent.getTracksIndexes(position + 9, chunkHeader.Size)
        } else if (chunkHeader.Type === 3) {
          parent.getBlocsInfos(position + 9, chunkHeader.Size)
        } else if (chunkHeader.Type === 21) {
          parent.getAudioTrack(position + 9, chunkHeader.Size)
        } else {
          parent.getChunkData(position + 9, chunkHeader.Size)
        }
      } else if (xhr.status !== 200) {
        // handle error
        console.error(`Error: ${xhr.status}`)
      }
    }
    xhr.send()
  }

  getBunchOfChunks(onLoadCallback) {
    if (!this._isInitialized) {
      console.log('reading 4ds error: XHR not initalized')
      return
    }

    if (this._isDownloading) {
      return
    }
    this._isDownloading = true

    const pos0 = this._KFPositions[this._currentBlocIndex]
    let pos1 = pos0

    while ((pos1 - pos0) < this._internalCacheSize && ++this._currentBlocIndex <= this._lastBlocIndex) {
      pos1 = this._KFPositions[this._currentBlocIndex]
    }

    // reset if end of file
    if (this._currentBlocIndex > this._lastBlocIndex) {
      if (this._lastBlocIndex === this._sequenceInfo.NbBlocs - 1) {
        pos1 = this._pointerToBlocIndex
      } else {
        pos1 = this._KFPositions[this._currentBlocIndex]
      }
      this._currentBlocIndex = this._firstBlocIndex
    }

    const totalSize = pos1 - pos0
    const parent = this

    // HTTP/3 Optimization: Use parallel downloads for better bandwidth utilization
    if (this._useParallelDownloads && totalSize > 1024 * 1024) {
      this._downloadInParallel(pos0, pos1, totalSize)
    } else {
      // Fallback to single request for small chunks
      this._downloadSingleChunk(pos0, pos1, totalSize)
    }
  }

  _downloadInParallel(pos0, pos1, totalSize) {
    const parent = this
    const chunkSize = Math.min(1024 * 1024, Math.ceil(totalSize / this._maxParallelRequests)) // ~1MB chunks
    const chunks = []
    let currentPos = pos0

    // Split into parallel chunks
    let chunkId = 0
    while (currentPos < pos1) {
      const endPos = Math.min(currentPos + chunkSize, pos1)
      chunks.push({
        id: chunkId++,
        start: currentPos,
        end: endPos - 1 // Range header is inclusive
      })
      currentPos = endPos
    }

    console.log('[ResourceManager] Downloading', chunks.length, 'chunks in parallel',
                'Total:', (totalSize / 1024).toFixed(1), 'KB')

    // Initialize parallel manager
    if (this._parallelManager) {
      this._parallelManager.abort()
    }

    this._parallelManager = new ParallelRangeManager({
      url: this._file4ds,
      maxConcurrentRequests: this._maxParallelRequests,
      onChunkReceived: (chunkId, data) => {
        // Store chunk for reassembly
        chunks[chunkId].data = data
      },
      onComplete: () => {
        // Reassemble all chunks in order
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.data.byteLength, 0)
        const combinedBuffer = new ArrayBuffer(totalLength)
        const combinedView = new Uint8Array(combinedBuffer)

        let offset = 0
        chunks.forEach(chunk => {
          combinedView.set(new Uint8Array(chunk.data), offset)
          offset += chunk.data.byteLength
        })

        console.log('[ResourceManager] Reassembled', chunks.length, 'chunks,',
                    'Total:', (totalLength / 1024).toFixed(1), 'KB')

        // Process combined buffer
        parent._processChunkData(combinedBuffer, totalLength)
        parent._isDownloading = false
      },
      onError: (chunkId, error) => {
        console.error('[ResourceManager] Chunk', chunkId, 'failed:', error)
        // Continue despite error - other chunks may succeed
      }
    })

    // Enqueue all chunks
    chunks.forEach(chunk => {
      this._parallelManager.enqueueRangeRequest(chunk.start, chunk.end, chunk.id)
    })
  }

  _downloadSingleChunk(pos0, pos1, totalSize) {
    const parent = this
    const xhr = this.SetXHR(pos0, pos1)

    if (!xhr) {
      console.error('[ResourceManager] Failed to create XHR for getBunchOfChunks')
      this._isDownloading = false
      return
    }

    xhr.onload = function () {
      if (xhr.status === 206 || xhr.status === 200) {
        parent._processChunkData(xhr.response, totalSize)
        parent._isDownloading = false
      } else {
        console.log(`xhr status == ${xhr.status}`)
        parent._isDownloading = false
      }
    }

    xhr.onerror = function() {
      console.error('[ResourceManager] XHR error in single chunk download')
      parent._isDownloading = false
    }

    xhr.send()
  }

  _processChunkData(buffer, memorySize) {
    const dv = new DataView(buffer)
    let dataPtr = 0
    const parent = this

    while (memorySize > 0) {
      // extract a chunk
      const chunkSize = dv.getUint32(dataPtr + 5, true)

      const cdataArray = new Uint8Array(buffer.slice(dataPtr + 9, dataPtr + 9 + chunkSize), 0, chunkSize)

      const chunk4D = new ChunkSerialized()
      chunk4D.type = dv.getUint8(dataPtr, true)
      chunk4D.codec = dv.getUint16(dataPtr + 1, true)
      chunk4D.version = dv.getUint16(dataPtr + 3, true)
      chunk4D.size = chunkSize
      chunk4D.data = cdataArray

      dataPtr += 9 + chunkSize
      memorySize -= (9 + chunkSize)

      if (chunk4D.type === 10 || chunk4D.type === 11 || chunk4D.type === 12 || chunk4D.type === 14) {
        if (!Decoder4D._keepChunksInCache || Decoder4D._chunks4D.length < parent._sequenceInfo.NbFrames * 2) {
          Decoder4D._chunks4D.push(chunk4D)
        }
      }
    }
  }

  reinitResources() {
    this._sequenceInfo = {
      NbFrames: 0,
      NbBlocs: 0,
      FrameRate: 0,
      MaxVertices: 0,
      MaxTriangles: 0,
      TextureEncoding: 0,
      TextureSizeX: 0,
      TextureSizeY: 0,
      NbAdditionalTracks: 0,
    }

    this._blocInfos = []
    this._KFPositions = []
    this._currentBlocIndex = 0
    this._firstBlocIndex = 0
    this._lastBlocIndex = 0

    this._tracksPositions = []

    this._audioTrack = []

    this._isInitialized = false
    this._isDownloading = false
  }

  seek(frame) {
    // search for correct frame bloc
    let sf = 0
    let i = 0
    while (sf < frame) {
      sf += this._blocInfos[i].NbInterFrames + 1
      i++
    }

    // jump to bloc
    if (i > 0) {
      this._currentBlocIndex = i - 1
    } else {
      this._currentBlocIndex = 0
    }

    // HTTP/3 Optimization: Prefetch next chunk for smoother seeking
    this._prefetchNextChunk()
  }

  _prefetchNextChunk() {
    // Prefetch the next chunk to improve seeking performance
    if (!this._isInitialized || this._isDownloading) {
      return
    }

    const nextBlocIndex = this._currentBlocIndex + 1
    if (nextBlocIndex > this._lastBlocIndex) {
      return // No next chunk to prefetch
    }

    const pos0 = this._KFPositions[nextBlocIndex]
    let pos1 = pos0

    // Calculate next chunk size (smaller prefetch)
    const prefetchSize = Math.min(this._internalCacheSize / 2, 1024 * 1024) // Max 1MB prefetch
    while ((pos1 - pos0) < prefetchSize && nextBlocIndex < this._lastBlocIndex) {
      pos1 = this._KFPositions[nextBlocIndex + 1]
      break
    }

    console.log('[ResourceManager] Prefetching next chunk:', nextBlocIndex,
                'Range:', pos0, '-', pos1, 'Size:', ((pos1 - pos0) / 1024).toFixed(1), 'KB')

    // Send prefetch message to Service Worker
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'PREFETCH_CHUNK',
        url: this._file4ds,
        range: {
          start: pos0,
          end: pos1
        }
      })
    }
  }

  getChunkData(position, size) {
    const xhr = this.SetXHR(position, position + size)

    xhr.onload = function () {
      if (xhr.status === 206) {
        console.log('chunk Data Downloaded')

        return xhr.response
      } else if (xhr.status !== 200) {
        // handle error
        alert(`Error: ${xhr.status}`)
        return null
      } else return null
    }
    xhr.send()
  }

  getFileHeader() {
    const xhr = this.SetXHR(0, 30)
    console.log(`file : ${this._file4ds}`)
    const parent = this

    xhr.onload = function () {
      if (xhr.status === 206 && xhr.readyState === 4) {
        console.log('Header Downloaded')

        const headerChunk = xhr.response

        const dv = new DataView(headerChunk)
        const version = dv.getInt16(4, true)
        parent._pointerToSequenceInfo = dv.getInt32(6, true)
        const pointerToSequenceInfoPart2 = dv.getInt32(10, true)
        parent._pointerToBlocIndex = dv.getInt32(14, true)
        const pointerToBlocIndexPart2 = dv.getInt32(18, true)
        parent._pointerToTrackIndex = dv.getInt32(22, true)
        const pointerToTrackIndexPart2 = dv.getInt32(26, true)

        // sequence info
        parent.getOneChunk(parent._pointerToSequenceInfo)
      } else if (xhr.status !== 200) {
        // handle error
        alert(`Error: ${xhr.status}`)
      }
    }
    xhr.send()
  }

  getSequenceInfo(position, size) {
    const xhr = this.SetXHR(position, position + size)

    const parent = this

    xhr.onload = function () {
      if (xhr.status === 206) {
        const dv = new DataView(xhr.response)
        parent._sequenceInfo.NbFrames = dv.getUint32(0, true)
        parent._sequenceInfo.NbBlocs = dv.getUint32(4, true)
        parent._sequenceInfo.FrameRate = dv.getFloat32(8, true)
        parent._sequenceInfo.MaxVertices = dv.getUint32(12, true)
        parent._sequenceInfo.MaxTriangles = dv.getUint32(16, true)
        parent._sequenceInfo.TextureEncoding = dv.getUint32(20, true)
        parent._sequenceInfo.TextureSizeX = dv.getUint32(24, true)
        parent._sequenceInfo.TextureSizeY = dv.getUint32(28, true)
        parent._sequenceInfo.NbAdditionalTracks = dv.getUint32(32, true)

        console.log(parent._sequenceInfo)

        // bloc index
        parent.getOneChunk(parent._pointerToBlocIndex)

        // track index
        if (parent._sequenceInfo.NbAdditionalTracks > 0) {
          parent.getOneChunk(parent._pointerToTrackIndex)
        }
      } else if (xhr.status !== 200) {
        // handle error
        alert(`Error: ${xhr.status}`)
      }
    }
    xhr.send()
  }

  getBlocsInfos(position, size) {
    const xhr = this.SetXHR(position, position + size)

    const parent = this

    xhr.onload = function () {
      if (xhr.status === 206) {
        const dv = new DataView(xhr.response)

        parent._KFPositions.push(79)

        for (let i = 0; i < parent._sequenceInfo.NbBlocs; i++) {
          const bi = new BlocInfo(dv.getInt32(i * 16, true), dv.getInt32(i * 16 + 4, true), dv.getInt32(i * 16 + 8, true))
          parent._blocInfos.push(bi)
          parent._KFPositions.push(bi.BlocChunkPos + 9 + (bi.NbInterFrames + 1) * 16)
        }

        parent._firstBlocIndex = 0
        parent._lastBlocIndex = parent._sequenceInfo.NbBlocs - 1

        // console.log(parent._blocInfos);

        parent._isInitialized = true
        parent._callback()
        // parent.Read();
      } else if (xhr.status !== 200) {
        // handle error
        alert(`Error: ${xhr.status}`)
      }
    }
    xhr.send()
  }

  getTracksIndexes(position, size) {
    const xhr = this.SetXHR(position, position + size)

    const parent = this

    xhr.onload = function () {
      if (xhr.status === 206) {
        const dv = new DataView(xhr.response)

        for (let i = 0; i < parent._sequenceInfo.NbAdditionalTracks; i++) {
          parent._tracksPositions.push(dv.getInt32(i * 8, true))

          parent.getOneChunk(parent._tracksPositions[i])
        }
      } else if (xhr.status !== 200) {
        // handle error
        alert(`Error: ${xhr.status}`)
      }
    }
    xhr.send()
  }

  getAudioTrack(position, size) {
    const xhr = this.SetXHR(position, position + size)

    const parent = this

    xhr.onload = function () {
      if (xhr.status === 206) {
        // var dv = new DataView(xhr.response);

        parent._audioTrack = xhr.response
      } else if (xhr.status !== 200) {
        // handle error
        alert(`Error: ${xhr.status}`)
      }
    }
    xhr.send()
  }

  set4DSFile(file) {
    this._file4ds = file
  }

  reset() {
    // Reset the resource manager for a new video load
    this._isInitialized = false
    this._isDownloading = false
    this._currentBlocIndex = 0
    this._firstBlocIndex = 0
    this._lastBlocIndex = 0
    this._blocInfos = []
    this._KFPositions = []
    this._pointerToSequenceInfo = 0
    this._pointerToBlocIndex = 0
    this._pointerToTrackIndex = 0

    // Clean up parallel manager
    if (this._parallelManager) {
      this._parallelManager.abort()
      this._parallelManager = null
    }

    console.log('[ResourceManager] Reset complete')
  }
}