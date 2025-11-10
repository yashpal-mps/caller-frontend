// WebSocket service for connecting to the voice bot
import { useRef, useState, useCallback } from 'react';
import { AudioQueue } from '../utils/AudioUtils';

// Define the message interfaces
export interface MediaMessage {
  event: "media";
  sequenceNumber: string;
  streamSid: string;
  media: {
    payload: string;
    track?: string;
    chunk?: number;
    timestamp?: number;
    source?: string; // Added for vendor messages
  };
}

export interface CallStartMessage {
  event: "start";
  callId: string;
  contactId: string;
  contactName?: string;
}

export interface CallStopMessage {
  event: "stop";
  callId: string;
  reason?: string;
}

export interface CommunicationMessage {
  event: "handle_communications" | "ping";
  message?: string;
}

// Interface for streaming options
export interface StreamingOptions {
  enabled: boolean;
  chunkSize?: number;
  format?: string;
}

// Union type for all message types
export type WebSocketMessage = MediaMessage | CallStartMessage | CallStopMessage | CommunicationMessage;

// Mark message for audio events
export interface MarkMessage {
  event: "mark";
  streamSid: string;
  mark: {
    name: string;
  };
}

// Define the connection status type
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Hook for using the WebSocket service
export const useWebSocketAudio = (token: string): {
  status: ConnectionStatus;
  messages: MediaMessage[];
  error: string | null;
  activeCall: {
    isActive: boolean;
    callId: string | null;
    contactId: string | null;
    contactName: string | null;
  };
  connect: () => void;
  disconnect: () => void;
  initializeAudio: () => boolean;
  sendAudio: (base64Audio: string) => Promise<void>;
  sendMark: (markName: string) => void;
  handleCommunications: () => void;
  isStreaming: boolean;
  setIsStreaming: (value: boolean) => void;
  startStreamingAudio: (format?: string) => Promise<void>;
  stopStreamingAudio: () => void;
} => {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [messages, setMessages] = useState<MediaMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<{
    isActive: boolean;
    callId: string | null;
    contactId: string | null;
    contactName: string | null;
  }>({
    isActive: false,
    callId: null,
    contactId: null,
    contactName: null
  });
  const socketRef = useRef<WebSocket | null>(null);
  const audioQueueRef = useRef<AudioQueue>(new AudioQueue());
  // Track if we've received a start event and can play audio
  const canPlayAudioRef = useRef<boolean>(false);


  // Connect to WebSocket - simplified, single attempt, fixed token
  const connect = (): void => {
    // Avoid duplicate sockets (connecting or already open)
    const currentState = socketRef.current?.readyState;
    if (currentState === WebSocket.OPEN || currentState === WebSocket.CONNECTING) {
      console.log('WebSocket already connecting or connected');
      return;
    }

    try {
      // Close any existing socket
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }

      setStatus('connecting');

      // Simple URL using fixed token
      // Reference `token` to satisfy lint while keeping hardcoded token
      const wsToken = token;
      const wsUrl = `ws://localhost:8080/browser?token=${wsToken}`;
      console.log('Connecting to WebSocket:', wsUrl);
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = (): void => {
        console.log('WebSocket connected');
        setStatus('connected');
        setError(null);
      };

      socket.onmessage = async (event: MessageEvent): Promise<void> => {
        try {
          // First check if the message is a string that needs parsing
          let data;
          if (typeof event.data === 'string') {
            // Use a safer approach to parse JSON that won't trigger CSP eval warnings
            try {
              // Use the native JSON.parse which is CSP-compliant when used directly
              data = JSON.parse(event.data) as WebSocketMessage;
            } catch (parseError) {
              console.error('Error parsing message:', parseError);
              return; // Skip processing for invalid JSON
            }
          } else {
            console.log('Received non-string message:', event.data);
            return; // Skip processing for non-string messages
          }

          // Log all events from WebSocket
          console.log('WebSocket Event Received:', data);

          // Handle different event types
          if (data.event === 'media') {
            // Add message to state for UI display
            setMessages(prev => [...prev, data]);

            // Determine if this is a vendor message
            const isVendor = data.media.source === 'vendor';

            // Add to audio queue for playback with source information
            try {
              // Make sure audio is initialized before adding chunks
              if (!audioQueueRef.current.isAudioContextReady && audioQueueRef.current.audioContext?.state !== 'running') {
                // Try to initialize audio if not ready
                audioQueueRef.current.initializeAudio();
              }

              // Only play audio if we've received a start event
              if (audioQueueRef.current && canPlayAudioRef.current) {
                audioQueueRef.current.addChunk(
                  data.streamSid,
                  data.media.payload,
                  data.media.chunk,
                  data.media.source
                );

                console.log(`Playing ${isVendor ? 'vendor' : 'client'} audio chunk`);
              } else if (!canPlayAudioRef.current) {
                console.log('Ignoring audio chunk - waiting for start event');
              } else {
                console.error('Audio queue not initialized when receiving media event');
              }
            } catch (error) {
              console.error('Error adding audio chunk:', error);
              // Continue processing other messages even if audio fails
            }
          } else if (data.event === 'start') {
            console.log('Call Start Event:', data);
            // Update active call state
            setActiveCall({
              isActive: true,
              callId: data.callId,
              contactId: data.contactId,
              contactName: data.contactName || null
            });

            // Initialize audio for the new call and enable audio playback
            audioQueueRef.current.initializeAudio();
            canPlayAudioRef.current = true;
            console.log('Audio playback enabled after receiving start event');

          } else if (data.event === 'stop') {
            console.log('Call Stop Event:', data);
            // Reset active call state
            setActiveCall({
              isActive: false,
              callId: null,
              contactId: null,
              contactName: null
            });

            // Clear audio queue and disable audio playback
            audioQueueRef.current.clear();
            canPlayAudioRef.current = false;
            console.log('Audio playback disabled after receiving stop event');

          } else if (data.event === 'handle_communications' || data.event === 'ping') {
            // Handle communication events from server
            console.log('Communication Event:', data);
            // No need to do anything special, just log it
          } else {
            // Log unknown event types
            console.log('Unknown Event Type:', data.event, data);
          }
        } catch (err) {
          console.error('Error processing WebSocket message:', err, 'Raw data:', event.data);
        }
      };

      socket.onerror = (err: Event): void => {
        console.error('WebSocket error:', err);
        setStatus('error');
        setError('Connection error');
        // Log detailed error information
        console.log("WebSocket error details:", err);
        console.log('WebSocket readyState:', socket.readyState);
      };

      socket.onclose = (event): void => {
        console.log(`WebSocket connection closed: ${event.code} ${event.reason || ''}`);
        setStatus('disconnected');
        socketRef.current = null;
      };
    } catch (err) {
      console.error('Error connecting to WebSocket:', err);
      setStatus('error');
      setError('Failed to connect');
    }
  };

  // Removed reconnection reset helper; reconnection is not used in the simplified flow

  // Disconnect from WebSocket
  const disconnect = (): void => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
      setStatus('disconnected');
      audioQueueRef.current.clear();
    }
  };

  // // Clean up on unmount
  // useEffect(() => {
  //   return () => {
  //     disconnect();
  //   };
  // // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, []);

  // Initialize audio context manually
  const initializeAudio = (): boolean => {
    try {
      if (!audioQueueRef.current) {
        console.error('Cannot initialize audio: Audio queue not initialized');
        return false;
      }

      // Try to initialize audio
      const result = audioQueueRef.current.initializeAudio();

      // If initialization was successful, try to play any pending chunks
      if (result && audioQueueRef.current) {
        // Force a small delay to ensure AudioContext is fully ready
        setTimeout(() => {
          try {
            if (audioQueueRef.current) {
              // Call the method directly to play any pending chunks
              audioQueueRef.current.playPendingChunks();
            }
          } catch (error) {
            console.error('Error playing pending chunks after initialization:', error);
          }
        }, 100);
      }

      return result;
    } catch (error) {
      console.error('Error in initializeAudio:', error);
      return false;
    }
  };

  // Function to send audio to the server
  const sendAudio = async (base64Audio: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (socketRef.current?.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not connected'));
        return;
      }

      try {
        // Create a media message with the audio data
        const audioMessage: MediaMessage = {
          event: "media",
          sequenceNumber: Date.now().toString(),
          streamSid: "client-recording",
          media: {
            payload: base64Audio,
            timestamp: Date.now(),
            chunk: 1,
            track: "inbound",
          }
        };

        // Send the audio data to the server
        socketRef.current.send(JSON.stringify(audioMessage));
        console.log('Audio sent to server');
        resolve();
      } catch (error) {
        console.error('Error sending audio:', error);
        reject(error);
      }
    });
  };

  // Function to send mark event
  const sendMark = (markName: string): void => {
    if (socketRef.current?.readyState !== WebSocket.OPEN || !activeCall.callId) {
      console.error('WebSocket is not connected or no active call');
      return;
    }

    const message: MarkMessage = {
      event: 'mark',
      streamSid: activeCall.callId,
      mark: {
        name: markName
      }
    };

    socketRef.current.send(JSON.stringify(message));
    console.log('Sent mark event:', markName);
  };

  // State to track streaming status
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  // Start streaming audio (local state toggle, optional format logging)
  const startStreamingAudio = useCallback(async (format?: string): Promise<void> => {
    try {
      setIsStreaming(true);
      if (format) {
        console.log(`Audio streaming started. format=${format}`);
      } else {
        console.log('Audio streaming started');
      }
    } catch (err) {
      console.error('Error starting audio streaming:', err);
      // Best-effort toggle even on error
      setIsStreaming(true);
    }
  }, []);

  // Stop streaming audio (local state toggle)
  const stopStreamingAudio = useCallback((): void => {
    try {
      setIsStreaming(false);
      console.log('Audio streaming stopped');
    } catch (err) {
      console.error('Error stopping audio streaming:', err);
      // Best-effort toggle even on error
      setIsStreaming(false);
    }
  }, []);

  // Function to notify server that browser will handle communications
  const handleCommunications = useCallback((): void => {
    console.log('handleCommunications called');
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        const communicationMessage: CommunicationMessage = {
          event: 'handle_communications',
          message: 'Browser will handle communications'
        };
        socketRef.current.send(JSON.stringify(communicationMessage));
        console.log('Sent handle_communications');
      } catch (error) {
        console.error('Error sending handle_communications:', error);
      }
    } else {
      console.warn('WebSocket not open; cannot send handle_communications');
    }
  }, [socketRef]);

  return {
    status,
    messages,
    error,
    activeCall,
    connect,
    disconnect,
    initializeAudio,
    sendAudio,
    sendMark,
    handleCommunications,
    isStreaming,
    setIsStreaming,
    startStreamingAudio,
    stopStreamingAudio
  };
};