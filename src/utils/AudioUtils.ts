// Audio utilities for processing mulaw 8k audio

// Linear to muLaw conversion function
export const linearToMulaw = (pcmSample: number): number => {
  // Bias to avoid taking log of zero
  // Define mu = 255 for 8-bit mu-law
  const MU = 255;

  // Take absolute value of sample
  let sample = Math.abs(pcmSample);

  // Clip samples larger than 1.0
  if (sample > 1.0) sample = 1.0;

  // Convert to a value between 0 and 1
  sample = sample * 32767;

  // Compute mu-law value
  const sign = (pcmSample < 0) ? 0x80 : 0;

  if (sample < 0.001) return sign;

  sample = Math.log(1.0 + (MU * sample / 32767)) / Math.log(1.0 + MU);

  // Convert to 8-bit mu-law value
  let value = Math.floor(sample * 255 + 0.5);

  if (value > 255) value = 255;

  return sign | (255 - value);
};

// Record audio in 8k mulaw format with streaming support
export const recordAudio = (onChunk?: (base64Chunk: string, chunkNumber: number) => void): Promise<{
  start: () => void,
  stop: () => Promise<string>,
  isStreaming: boolean
}> => {
  return new Promise((resolve, reject) => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const AudioContextClass = (window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
        const audioContext = new AudioContextClass({ sampleRate: 8000 });
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(1024, 1, 1);
        const chunks: Float32Array[] = [];
        let chunkCounter = 0;
        const isStreaming = !!onChunk;

        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const chunk = new Float32Array(inputData.length);
          chunk.set(inputData);
          chunks.push(chunk);

          // If streaming is enabled, process and send each chunk immediately
          if (isStreaming && onChunk) {
            // Convert current chunk to 8k mulaw
            const mulawChunk = new Uint8Array(chunk.length);
            for (let i = 0; i < chunk.length; i++) {
              mulawChunk[i] = linearToMulaw(chunk[i]);
            }

            // Convert to base64
            let binary = '';
            for (let i = 0; i < mulawChunk.length; i++) {
              binary += String.fromCharCode(mulawChunk[i]);
            }

            // Send the chunk to the callback
            onChunk(btoa(binary), ++chunkCounter);
          }
        };

        const start = () => {
          source.connect(processor);
          processor.connect(audioContext.destination);
        };

        const stop = async () => {
          source.disconnect();
          processor.disconnect();
          stream.getTracks().forEach(track => track.stop());

          // If we're streaming, we've already processed the chunks
          // But we still need to return the full audio for non-streaming use

          // Concatenate all chunks
          const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
          const audioData = new Float32Array(totalLength);
          let offset = 0;

          for (const chunk of chunks) {
            audioData.set(chunk, offset);
            offset += chunk.length;
          }

          // Convert to 8k mulaw
          const mulawData = new Uint8Array(audioData.length);
          for (let i = 0; i < audioData.length; i++) {
            mulawData[i] = linearToMulaw(audioData[i]);
          }

          // Convert to base64
          let binary = '';
          for (let i = 0; i < mulawData.length; i++) {
            binary += String.fromCharCode(mulawData[i]);
          }

          return btoa(binary);
        };

        resolve({ start, stop, isStreaming });
      })
      .catch(error => {
        reject(error);
      });
  });
};

// muLaw to linear conversion table
const MULAW_DECODE_TABLE = [
  -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
  -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
  -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
  -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
  -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
  -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
  -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
  -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
  -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
  -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
  -876, -844, -812, -780, -748, -716, -684, -652,
  -620, -588, -556, -524, -492, -460, -428, -396,
  -372, -356, -340, -324, -308, -292, -276, -260,
  -244, -228, -212, -196, -180, -164, -148, -132,
  -120, -112, -104, -96, -88, -80, -72, -64,
  -56, -48, -40, -32, -24, -16, -8, 0,
  32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
  23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
  15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
  11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
  7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
  5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
  3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
  2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
  1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
  1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
  876, 844, 812, 780, 748, 716, 684, 652,
  620, 588, 556, 524, 492, 460, 428, 396,
  372, 356, 340, 324, 308, 292, 276, 260,
  244, 228, 212, 196, 180, 164, 148, 132,
  120, 112, 104, 96, 88, 80, 72, 64,
  56, 48, 40, 32, 24, 16, 8, 0
];

// Define AudioContext type to avoid 'any'


// Convert base64 mulaw to audio buffer
export const convertMuLawToAudio = async (base64Data: string): Promise<AudioBuffer> => {
  // Decode base64 to binary
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Convert mulaw to PCM
  const pcmData = new Float32Array(bytes.length);

  for (let i = 0; i < bytes.length; i++) {
    pcmData[i] = MULAW_DECODE_TABLE[bytes[i]] / 32768.0;
  }

  // Create audio context
  const AudioContextClass = (window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  const audioContext = new AudioContextClass();
  const buffer = audioContext.createBuffer(1, pcmData.length, 8000);
  buffer.getChannelData(0).set(pcmData);

  return buffer;
};

// Play audio buffer
export const playAudioBuffer = (audioBuffer: AudioBuffer): void => {
  const AudioContextClass = (window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  const audioContext = new AudioContextClass();
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
};

// Audio queue for managing chunks
export class AudioQueue {
  private clientChunks: Map<string, string[]> = new Map();
  private vendorChunks: Map<string, string[]> = new Map();
  public audioContext: AudioContext | null = null;
  private currentClientStreamId: string | null = null;
  private isClientPlaying: boolean = false;
  private isVendorPlaying: boolean = false;
  private currentVendorStreamId: string | null = null;
  private pendingChunks: Array<{ streamId: string, payload: string, isVendor: boolean }> = [];
  public isAudioContextReady: boolean = false;

  constructor() {
    // We'll initialize AudioContext on user interaction instead of immediately
    this.setupAudioContextOnUserInteraction();
  }

  // Setup AudioContext on user interaction to comply with browser policies
  private setupAudioContextOnUserInteraction(): void {
    const userInteractionEvents = ['click', 'touchstart', 'keydown'];

    const initAudioContext = () => {
      if (!this.audioContext) {
        const AudioContextClass = (window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
        this.audioContext = new AudioContextClass();

        // Mark as ready
        this.isAudioContextReady = true;
        console.log('AudioContext initialized after user interaction');

        // Play any pending chunks
        this.playPendingChunks();
      } else if (this.audioContext.state === 'suspended') {
        void this.audioContext.resume().then(() => {
          this.isAudioContextReady = true;
          console.log('AudioContext resumed after user interaction');

          // Play any pending chunks
          this.playPendingChunks();
        });
      }

      // Remove event listeners after successful initialization
      if (this.isAudioContextReady && this.audioContext && this.audioContext.state === 'running') {
        userInteractionEvents.forEach(event => {
          document.removeEventListener(event, initAudioContext);
        });
        console.log('Audio context initialized successfully, removed event listeners');
      }
    };

    // Add event listeners for user interaction
    userInteractionEvents.forEach(event => {
      document.addEventListener(event, initAudioContext, { once: false });
    });

    // Create a dummy AudioContext to check if we can start without user interaction
    try {
      const AudioContextClass = (window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      const tempContext = new AudioContextClass();

      if (tempContext.state === 'running') {
        this.audioContext = tempContext;
        this.isAudioContextReady = true;
        console.log('AudioContext initialized without user interaction');
        this.playPendingChunks();
      } else {
        // Close the temporary context if it's not usable
        void tempContext.close();
        console.log('Waiting for user interaction to initialize AudioContext');
      }
    } catch (error) {
      console.log('Waiting for user interaction to initialize AudioContext', error);
    }
  }

  // Play any chunks that were received before AudioContext was ready
  public playPendingChunks(): void {
    if (!this.audioContext) {
      console.log('Cannot play pending chunks: AudioContext not initialized');
      return;
    }

    if (this.audioContext.state !== 'running') {
      console.log('Cannot play pending chunks: AudioContext not running, attempting to resume');
      // Try to resume the context
      try {
        void this.audioContext.resume().then(() => {
          if (this.audioContext?.state === 'running') {
            this.playPendingChunks(); // Try again after resuming
          } else {
            console.log('Failed to resume AudioContext, will try again on user interaction');
          }
        }).catch(err => {
          console.error('Error resuming AudioContext:', err);
        });
      } catch (error) {
        console.error('Exception trying to resume AudioContext:', error);
      }
      return;
    }

    if (!this.isAudioContextReady) {
      console.log('Cannot play pending chunks: AudioContext not marked as ready');
      this.isAudioContextReady = true; // Force it to be ready if the state is running
    }

    const pendingCount = this.pendingChunks.length;
    if (pendingCount > 0) {
      console.log(`Playing ${pendingCount} pending audio chunks`);

      // Create a copy of the pending chunks to avoid issues if new chunks are added during playback
      const chunksToPlay = [...this.pendingChunks];
      this.pendingChunks = [];

      // Play all pending chunks
      for (const chunk of chunksToPlay) {
        try {
          void this.playAudioChunk(chunk.streamId, chunk.payload, chunk.isVendor);
        } catch (error) {
          console.error('Error playing audio chunk:', error);
          // Continue with other chunks even if one fails
        }
      }
    } else {
      console.log('No pending audio chunks to play');
    }
  }

  // Public method to manually trigger audio context initialization and play pending chunks
  public initializeAudio(): boolean {
    if (this.isAudioContextReady && this.audioContext && this.audioContext.state === 'running') {
      console.log('Audio already initialized and running');
      this.playPendingChunks();
      return true;
    }

    try {
      // Create AudioContext - this will require user interaction
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
      }

      // Resume the context (requires user interaction)
      if (this.audioContext.state !== 'running') {
        console.log('Attempting to resume AudioContext after user interaction');
        this.audioContext.resume().then(() => {
          if (this.audioContext?.state === 'running') {
            console.log('Successfully resumed AudioContext');
            this.isAudioContextReady = true;
            this.playPendingChunks();
          } else {
            console.log('Failed to resume AudioContext, still needs user interaction');
          }
        }).catch(err => {
          console.error('Error resuming AudioContext:', err);
        });
      }

      this.isAudioContextReady = true;

      // Play any pending chunks
      this.playPendingChunks();

      return true;
    } catch (err) {
      console.error('Exception trying to initialize AudioContext:', err);
      return false;
    }
  }

  // Add a chunk to the queue and play it immediately if possible
  public addChunk(streamId: string, payload: string, chunk?: number, source?: string): void {
    try {
      const isVendor = source === 'vendor';

      // Store in queue for potential future use
      const chunks = isVendor ? this.vendorChunks : this.clientChunks;

      if (!chunks.has(streamId)) {
        chunks.set(streamId, []);
      }

      const streamChunks = chunks.get(streamId)!;

      // If chunk number is provided, insert at specific position
      if (chunk !== undefined && chunk < streamChunks.length) {
        streamChunks[chunk] = payload;
      } else {
        streamChunks.push(payload);
      }

      // Try to initialize audio if not ready
      if (!this.isAudioContextReady || !this.audioContext || this.audioContext.state !== 'running') {
        // Try to initialize or resume
        this.initializeAudio();
      }

      // If AudioContext is ready, play immediately
      if (this.isAudioContextReady && this.audioContext && this.audioContext.state === 'running') {
        void this.playAudioChunk(streamId, payload, isVendor);
      } else {
        // Otherwise, add to pending chunks to play after user interaction
        console.log(`Adding ${isVendor ? 'vendor' : 'client'} audio to pending queue (waiting for user interaction)`);
        this.pendingChunks.push({ streamId, payload, isVendor });
      }
    } catch (error) {
      console.error('Error in addChunk:', error);
      // Still add to pending queue even if there's an error
      this.pendingChunks.push({ streamId, payload, isVendor: source === 'vendor' });
    }
  }

  // Play an audio chunk immediately
  private async playAudioChunk(streamId: string, payload: string, isVendor: boolean): Promise<void> {
    // Safety check - if AudioContext isn't ready, add to pending queue
    if (!this.audioContext || this.audioContext.state !== 'running') {
      this.pendingChunks.push({ streamId, payload, isVendor });
      return;
    }

    try {
      console.log(`Playing ${isVendor ? 'vendor' : 'client'} audio immediately`);

      // Update state
      if (isVendor) {
        this.isVendorPlaying = true;
        this.currentVendorStreamId = streamId;
      } else {
        this.isClientPlaying = true;
        this.currentClientStreamId = streamId;
      }

      // Convert and play immediately
      const audioBuffer = await convertMuLawToAudio(payload);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      // When finished playing
      source.onended = () => {
        if (isVendor) {
          this.isVendorPlaying = false;
        } else {
          this.isClientPlaying = false;
        }
      };

      source.start();
    } catch (error) {
      console.error(`Error playing ${isVendor ? 'vendor' : 'client'} audio:`, error);

      // Reset state on error
      if (isVendor) {
        this.isVendorPlaying = false;
      } else {
        this.isClientPlaying = false;
      }
    }
  }

  // Play the next client chunk in the queue
  private async playNextClientChunk(): Promise<void> {
    // Find a stream with chunks
    let streamId: string | null = null;
    let payload: string | null = null;

    for (const [id, chunks] of this.clientChunks.entries()) {
      if (chunks.length > 0) {
        streamId = id;
        payload = chunks.shift()!;
        break;
      }
    }

    if (!streamId || !payload) {
      this.isClientPlaying = false;
      this.currentClientStreamId = null;
      return;
    }

    // Check if AudioContext is ready
    if (!this.audioContext || this.audioContext.state !== 'running') {
      this.isClientPlaying = false;
      this.currentClientStreamId = null;
      return;
    }

    this.isClientPlaying = true;
    this.currentClientStreamId = streamId;

    try {
      const audioBuffer = await convertMuLawToAudio(payload);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      // When this chunk finishes, play the next one
      source.onended = () => {
        void this.playNextClientChunk();
      };

      source.start();
    } catch (error) {
      console.error('Error playing client audio chunk:', error);
      void this.playNextClientChunk(); // Skip to next chunk on error
    }
  }

  // Play the next vendor chunk in the queue
  private async playNextVendorChunk(): Promise<void> {
    // Find a stream with chunks
    let streamId: string | null = null;
    let payload: string | null = null;

    for (const [id, chunks] of this.vendorChunks.entries()) {
      if (chunks.length > 0) {
        streamId = id;
        payload = chunks.shift()!;
        break;
      }
    }

    if (!streamId || !payload) {
      this.isVendorPlaying = false;
      this.currentVendorStreamId = null;
      return;
    }

    // Check if AudioContext is ready
    if (!this.audioContext || this.audioContext.state !== 'running') {
      this.isVendorPlaying = false;
      this.currentVendorStreamId = null;
      return;
    }

    this.isVendorPlaying = true;
    this.currentVendorStreamId = streamId;

    try {
      const audioBuffer = await convertMuLawToAudio(payload);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);

      // When this chunk finishes, play the next one
      source.onended = () => {
        void this.playNextVendorChunk();
      };

      source.start();
    } catch (error) {
      console.error('Error playing vendor audio chunk:', error);
      void this.playNextVendorChunk(); // Skip to next chunk on error
    }
  }

  // Clear the queue
  clear(): void {
    this.clientChunks.clear();
    this.vendorChunks.clear();
    this.pendingChunks = [];
    this.isClientPlaying = false;
    this.isVendorPlaying = false;
    this.currentClientStreamId = null;
    this.currentVendorStreamId = null;
  }

  // Get current client stream ID
  getCurrentClientStreamId(): string | null {
    return this.currentClientStreamId;
  }

  // Get the current stream ID
  getCurrentStreamId(source?: string): string | null {
    return source === 'vendor' ? this.currentVendorStreamId : this.currentClientStreamId;
  }
}