import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocketAudio } from '../services/WebSocketService';
import ErrorBoundary from '../components/ErrorBoundary';
import { linearToMulaw } from "../utils/AudioUtils";

const AudioBotPage: React.FC = () => {
  const token = "secret-token-for-browser";
  const navigate = useNavigate();
  
  // Use WebSocket service
  const { 
    status, 
    messages, 
    activeCall,
    connect, 
    disconnect, 
    initializeAudio,
    sendAudio,
    sendMark,
    isStreaming,
    setIsStreaming,
    handleCommunications
  } = useWebSocketAudio(token || "");
  
  // Refs for audio recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // State for UI components
  const [showHandleCall, setShowHandleCall] = useState<boolean>(true);
  const [audioInitialized, setAudioInitialized] = useState<boolean>(false);
  
  // Call status tracking
  const [callDuration, setCallDuration] = useState<number>(0);
  const [timerInterval, setTimerInterval] = useState<number | null>(null);
  
  // Connect to WebSocket once per token; avoid re-runs
  useEffect(() => {
    // Only connect when a valid token exists
    if (!token) {
      console.warn("No auth token present; skipping WS connect until login");
      return;
    }
    console.log("Connecting to WebSocket on page load with token");
    connect();

    // Cleanup on unmount
    return () => {
      console.log("Disconnecting WebSocket");
      disconnect();
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  
  // Initialize audio context (requires user interaction)
  const initAudio = () => {
    console.log("Setting up audio initialization for user interaction");
    const result = initializeAudio();
    setAudioInitialized(result);
    return result;
  };
  
  // Handle call button click - notify backend that browser will handle call
  const handleCallClick = () => {
    setShowHandleCall(false);
    
    // Notify backend that browser will handle the call
    console.log("Notifying backend that browser will handle call");
    handleCommunications();
  };
  
  // Start timer when call becomes active
  useEffect(() => {
    if (activeCall.isActive && !timerInterval) {
      const interval = window.setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
      setTimerInterval(interval);
    } else if (!activeCall.isActive && timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    
    // If call ends, reset duration after a delay
    if (!activeCall.isActive && callDuration > 0) {
      const resetTimer = setTimeout(() => {
        setCallDuration(0);
      }, 3000);
      
      return () => clearTimeout(resetTimer);
    }
  }, [activeCall.isActive, timerInterval, callDuration]);
  
  // Format call duration as MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Toggle microphone
  const toggleMicrophone = async () => {
    if (isStreaming) {
      // Stop recording and send mark event
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
        setIsStreaming(false);
        
        // Send mark event
        sendMark("recording_stopped");
      }
    } else {
      try {
        // Start recording
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        
        recorder.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            // Convert audio to 8k mu-law base64
            const audioBuffer = await event.data.arrayBuffer();
            const audioContext = new AudioContext();
            const audioData = await audioContext.decodeAudioData(audioBuffer);
            
            // Convert to mu-law and send
            const audioSamples = audioData.getChannelData(0);
            const muLawData = new Uint8Array(audioSamples.length);
            
            // Process each sample
            for (let i = 0; i < audioSamples.length; i++) {
              muLawData[i] = linearToMulaw(audioSamples[i]);
            }
            
            const base64Data = btoa(String.fromCharCode.apply(null, Array.from(muLawData)));
            sendAudio(base64Data);
          }
        };
        
        audioChunksRef.current = [];
        recorder.start(500); // Collect data every 500ms
        mediaRecorderRef.current = recorder;
        setIsStreaming(true);
        
        // Send mark event
        sendMark("recording_started");
      } catch (error) {
        console.error("Error accessing microphone:", error);
      }
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto p-4">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">Audio Bot Call</h1>
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-2 ${
                status === 'connected' 
                  ? 'bg-green-500' 
                  : status === 'connecting' 
                    ? 'bg-yellow-500' 
                    : 'bg-red-500'
              }`}></div>
              <span className="text-sm font-medium">
                {status === 'connected' 
                  ? 'Connected' 
                  : status === 'connecting' 
                    ? 'Connecting...' 
                    : 'Disconnected'}
              </span>
            </div>
          </div>
          
          <ErrorBoundary
            fallback={
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                <h2 className="text-lg font-medium text-yellow-800 mb-2">Call Interface Error</h2>
                <p className="text-sm text-yellow-600">
                  There was a problem with the call interface. This might be due to connection issues or audio device problems.
                </p>
                <button 
                  className="mt-3 px-4 py-2 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
                  onClick={() => window.location.reload()}
                >
                  Reload Page
                </button>
              </div>
            }
          >
            <div className="bg-gray-50 rounded-lg p-6">
              {activeCall.isActive ? (
                <div className="text-center">
                  <div className="text-lg font-medium mb-2">
                    Call in progress with {activeCall.contactName || `Contact #${activeCall.contactId}`}
                  </div>
                  <div className="text-3xl font-bold mb-4">
                    {formatDuration(callDuration)}
                  </div>
                  
                  {/* Microphone toggle button */}
                  <button
                    className={`mb-4 px-6 py-3 rounded-full flex items-center justify-center ${
                      isStreaming 
                        ? 'bg-red-500 hover:bg-red-600 text-white' 
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                    onClick={toggleMicrophone}
                  >
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className="h-5 w-5 mr-2" 
                      viewBox="0 0 20 20" 
                      fill="currentColor"
                    >
                      <path 
                        fillRule="evenodd" 
                        d={isStreaming 
                          ? "M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" 
                          : "M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                        } 
                        clipRule="evenodd" 
                      />
                    </svg>
                    {isStreaming ? 'Stop Microphone' : 'Start Microphone'}
                  </button>
                  
                  <div className="flex justify-center space-x-4">
                    <div className="animate-pulse flex space-x-1">
                      <div className="w-2 h-8 bg-blue-400 rounded"></div>
                      <div className="w-2 h-5 bg-blue-400 rounded"></div>
                      <div className="w-2 h-10 bg-blue-400 rounded"></div>
                      <div className="w-2 h-3 bg-blue-400 rounded"></div>
                      <div className="w-2 h-7 bg-blue-400 rounded"></div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => navigate('/')}
                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Back to Contacts
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  {showHandleCall ? (
                    <div>
                      <h2 className="text-xl font-medium mb-4">Ready to handle incoming calls</h2>
                      
                      {!audioInitialized && (
                        <button
                          className="px-6 py-3 mb-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow-md flex items-center justify-center mx-auto"
                          onClick={initAudio}
                        >
                          <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            className="h-5 w-5 mr-2" 
                            viewBox="0 0 20 20" 
                            fill="currentColor"
                          >
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                          Initialize Audio
                        </button>
                      )}
                      
                      <button
                        className={`px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg shadow-md flex items-center justify-center mx-auto ${!audioInitialized ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={handleCallClick}
                        disabled={!audioInitialized}
                      >
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          className="h-5 w-5 mr-2" 
                          viewBox="0 0 20 20" 
                          fill="currentColor"
                        >
                          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                        </svg>
                        Handle Call
                      </button>
                      
                      <button 
                        onClick={() => navigate('/')}
                        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Back to Contacts
                      </button>
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-xl font-medium mb-4">Waiting for call...</h2>
                      <div className="animate-pulse flex justify-center space-x-2">
                        <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                        <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                        <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                      </div>
                      
                      <button 
                        onClick={() => navigate('/')}
                        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Back to Contacts
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ErrorBoundary>
          
          {/* Message log (optional, can be hidden in production) */}
          <div className="mt-6">
            <h3 className="text-lg font-medium mb-2">Recent Messages</h3>
            <div className="bg-gray-50 rounded p-3 h-40 overflow-y-auto text-xs font-mono">
              {messages.length === 0 ? (
                <p className="text-gray-400">No messages received yet</p>
              ) : (
                messages.slice(-10).map((msg, idx) => (
                  <div key={idx} className="mb-1">
                    <span className="text-green-600">[{new Date().toLocaleTimeString()}]</span>
                    <span className="ml-2">
                      {msg.event}: {msg.media.source || 'unknown'} chunk {msg.media.chunk || '?'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">Call History</h2>
          <div className="text-center py-12">
            <p className="text-lg text-gray-500">
              {messages.length > 0 
                ? "Call ended. Waiting for new call..." 
                : "Waiting for call to start..."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioBotPage;
