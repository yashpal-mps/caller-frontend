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

  // Track reconnection
  const reconnectTimeoutRef = useRef<number | null>(null);
  const maxReconnectAttempts = 5;
  const reconnectAttemptsRef = useRef<number>(0);
  const isReconnectingRef = useRef<boolean>(false);

  // Heartbeat interval reference
  const heartbeatIntervalRef = useRef<number | null>(null);

  // Function to send heartbeat
  const sendHeartbeat = (): void => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      console.log('Sending heartbeat ping');
      socketRef.current.send(JSON.stringify({ event: 'ping' }));
    }
  };

  // Track if we've already connected
  const hasConnectedRef = useRef<boolean>(false);
  const connectionAttemptTimestampRef = useRef<number>(0);
  const CONNECTION_COOLDOWN_MS = 5000; // 5 seconds cooldown between connection attempts
  const connectionInProgressRef = useRef<boolean>(false);

  // Connect to WebSocket - only once
  const connect = (): void => {
    // Connect regardless of audio initialization status
    console.log('Attempting to connect WebSocket without waiting for AudioContext');

    // If already connected, don't try again
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected, not creating a new one');
      return;
    }

    // If there's an existing socket in CONNECTING state, don't create another one
    if (socketRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket already connecting, not creating a new one');
      return;
    }

    // If we're already in the process of reconnecting, don't start a new connection
    if (isReconnectingRef.current) {
      console.log('Already in the process of reconnecting, not starting a new connection');
      return;
    }

    // Check if we're in a connection cooldown period
    const now = Date.now();
    if (now - connectionAttemptTimestampRef.current < CONNECTION_COOLDOWN_MS) {
      console.log(`Connection attempt throttled. Please wait ${(CONNECTION_COOLDOWN_MS - (now - connectionAttemptTimestampRef.current)) / 1000} seconds before trying again.`);
      return;
    }

    // Check if a connection is already in progress
    if (connectionInProgressRef.current) {
      console.log('Connection already in progress, waiting for response');
      return;
    }

    // Set connection in progress flag
    connectionInProgressRef.current = true;
    connectionAttemptTimestampRef.current = now;

    // Clear any existing reconnection attempts
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Reset reconnection attempts if this is a manual connection (not a reconnect)
    if (!isReconnectingRef.current) {
      reconnectAttemptsRef.current = 0;
    }

    try {
      // Close any existing socket before creating a new one
      if (socketRef.current) {
        console.log('Closing existing socket before creating a new one');
        socketRef.current.close();
        socketRef.current = null;
      }

      setStatus('connecting');


      // Try a more reliable WebSocket URL format
      const wsUrl = `ws://localhost:8080/browser?token=${token}`;

      console.log('Connecting to WebSocket:', wsUrl);
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      // Set connection timeout to prevent hanging connections
      const connectionTimeout = window.setTimeout(() => {
        if (socketRef.current?.readyState !== WebSocket.OPEN) {
          console.log('WebSocket connection timeout');
          if (socketRef.current) {
            socketRef.current.close();
          }
          setStatus('disconnected');
          setError('Connection timeout');
        }
      }, 10000); // 10 second timeout

      socket.onopen = (): void => {
        console.log('WebSocket connected');
        clearTimeout(connectionTimeout);
        setStatus('connected');
        setError(null);

        // Reset connection flags
        connectionInProgressRef.current = false;

        // Reset reconnection attempts and flag on successful connection
        reconnectAttemptsRef.current = 0;
        isReconnectingRef.current = false;

        // Start heartbeat to keep connection alive
        if (heartbeatIntervalRef.current !== null) {
          window.clearInterval(heartbeatIntervalRef.current);
        }
        heartbeatIntervalRef.current = window.setInterval(sendHeartbeat, 30000); // Send heartbeat every 30 seconds
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

        // Reset connection in progress flag
        connectionInProgressRef.current = false;

        // Log detailed error information
        console.log("WebSocket error details:", err);
        console.log('WebSocket readyState:', socket.readyState);
      };

      socket.onclose = (event): void => {
        console.log(`WebSocket connection closed: ${event.code} ${event.reason || ''}`);
        setStatus('disconnected');
        socketRef.current = null;

        // Reset connection in progress flag
        connectionInProgressRef.current = false;

        // Clear heartbeat interval
        if (heartbeatIntervalRef.current !== null) {
          window.clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        // Only attempt to reconnect if:
        // 1. Not a normal closure (code 1000)
        // 2. Not already at max reconnect attempts
        if ((event.code !== 1000) && reconnectAttemptsRef.current < maxReconnectAttempts) {
          // Increment the attempt counter first
          reconnectAttemptsRef.current += 1;

          const backoffTime = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);
          console.log(`Attempting to reconnect in ${backoffTime}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);

          // Clear any existing timeout
          if (reconnectTimeoutRef.current !== null) {
            window.clearTimeout(reconnectTimeoutRef.current);
          }

          // Set reconnecting flag
          isReconnectingRef.current = true;

          // Reset connection flag to allow reconnection
          hasConnectedRef.current = false;

          // Set new timeout for reconnection
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, backoffTime);
        } else {
          console.log('Not reconnecting: normal close or already at max attempts');
          isReconnectingRef.current = false;
          hasConnectedRef.current = false; // Reset connection flag to allow manual reconnection
        }
      };
    } catch (err) {
      console.error('Error connecting to WebSocket:', err);
      setStatus('error');
      setError('Failed to connect');

      // If this was a manual connection attempt, don't auto-reconnect
      if (!isReconnectingRef.current) {
        resetReconnection();
      }
    }
  };

  // Reset reconnection attempts and connection state
  const resetReconnection = (): void => {
    reconnectAttemptsRef.current = 0;
    isReconnectingRef.current = false;
    hasConnectedRef.current = false; // Reset connection flag to allow reconnecting

    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  // Disconnect from WebSocket
  const disconnect = (): void => {
    // Clear any pending reconnection attempts
    resetReconnection();

    // Clear heartbeat interval
    if (heartbeatIntervalRef.current !== null) {
      window.clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

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

  // Function to notify server that browser will handle communications
  const handleCommunications = useCallback((): void => {
    console.log('handleCommunications function called in WebSocketService');
    console.log('Current WebSocket status:', status);

    // If socket exists, log its readyState
    if (socketRef.current) {
      console.log('Current WebSocket readyState:', socketRef.current.readyState);
    } else {
      console.log('socketRef.current is null');
    }

    // Reconnect if socket is closed (readyState 3) or null but status shows connected
    const needsReconnection =
      (socketRef.current && socketRef.current.readyState === WebSocket.CLOSED) ||
      (!socketRef.current && status === 'connected');

    if (needsReconnection) {
      console.log('WebSocket is closed or null, reconnecting...');

      // Close existing socket if it exists
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch (e) {
          console.log('Error closing existing socket:', e);
        }
        socketRef.current = null;
      }

      // Create new connection
      try {
        // Use the same URL format as in the connect function
        const wsUrl = `ws://localhost:8080/browser?token=${token}`;
        console.log('Reconnecting to WebSocket:', wsUrl);

        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = (): void => {
          console.log('WebSocket reconnected successfully');
          setStatus('connected');
          sendCommunicationMessage();
        };

        socket.onerror = (error): void => {
          console.error('WebSocket reconnection error:', error);
          setStatus('error');
          setError('Failed to reconnect to WebSocket');
        };

        socket.onclose = (): void => {
          console.log('WebSocket reconnection closed');
        };

        // Set up other event handlers as needed

        return; // Return and let the onopen handler send the message
      } catch (error) {
        console.error('Failed to recreate WebSocket connection:', error);
        setStatus('error');
        setError('Failed to reconnect to WebSocket');
        return;
      }
    }

    // If socket exists and is in OPEN state, send message directly
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      sendCommunicationMessage();
    } else if (socketRef.current && socketRef.current.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket is connecting, will send message when connected');
      // Set up a one-time event handler to send the message when connected
      const originalOnOpen = socketRef.current.onopen;
      socketRef.current.onopen = function (event) {
        // Call the original handler if it exists
        if (originalOnOpen) {
          originalOnOpen.call(this, event);
        }
        // Send our message
        sendCommunicationMessage();
        // Restore original handler
        if (socketRef.current) {
          socketRef.current.onopen = originalOnOpen;
        }
      };
    } else {
      console.error('WebSocket is not in a state that can send messages');
      return;
    }

    // Helper function to send the actual message
    function sendCommunicationMessage() {
      try {
        // Create a communication message
        const communicationMessage: CommunicationMessage = {
          event: 'handle_communications',
          message: 'Browser will handle communications'
        };

        // Use a safer approach to stringify the object
        // This avoids potential CSP issues with eval()
        const jsonString = JSON.stringify(communicationMessage);

        // Send the message
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(jsonString);
          console.log('Notified server that browser will handle communications');
        } else {
          console.error('Socket not available for sending message');
        }
      } catch (error) {
        console.error('Error sending handle_communications message:', error);
      }
    }
  }, [socketRef, status, token]);

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
    setIsStreaming
  };
};