import React, { useEffect, useState } from "react";
import { useWebSocketAudio } from "../services/WebSocketService";
import { recordAudio } from "../utils/AudioUtils";
import './CallInterface.css';

interface CallInterfaceProps {
  token: string;
}

const CallInterface: React.FC<CallInterfaceProps> = ({ token }) => {
  const { connect, disconnect, status, error, messages, initializeAudio, sendAudio, handleCommunications,
    isStreaming, startStreamingAudio, stopStreamingAudio } = useWebSocketAudio(token);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("");
  const [recorder, setRecorder] = useState<{ start: () => void; stop: () => Promise<string> } | null>(null);

  // Calculate client and vendor message counts and activity times
  const clientMessages = messages.filter((msg) => !msg.media.source).length;
  const vendorMessages = messages.filter(
    (msg) => msg.media.source === "vendor"
  ).length;

  // Get the timestamp of the last message for each participant
  const lastClientActivity = messages
    .filter((msg) => !msg.media.source)
    .reduce((latest, msg) => Math.max(latest, msg.media.timestamp || 0), 0);

  const lastVendorActivity = messages
    .filter((msg) => msg.media.source === "vendor")
    .reduce((latest, msg) => Math.max(latest, msg.media.timestamp || 0), 0);

  // Format timestamp to readable time
  const formatTimestamp = (timestamp: number): string => {
    if (timestamp === 0) return "No activity";

    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) {
      return `${seconds}s ago`;
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m ago`;
    } else {
      return `${Math.floor(seconds / 3600)}h ago`;
    }
  };

  // Initialize audio context on user interaction
  const handleInitializeAudio = () => {
    try {
      const success = initializeAudio();
      setAudioInitialized(success);
      if (!success) {
        console.warn("Audio initialization was not successful");
      }
    } catch (error) {
      console.error("Error initializing audio:", error);
      setAudioInitialized(false);
    }
  };
  
  // Function to handle starting the recording
  const handleStartRecording = async () => {
    try {
      setRecordingStatus("Initializing microphone...");
      // Start streaming audio with 8k mu-law encoding
      if (startStreamingAudio && typeof startStreamingAudio === 'function') {
        await startStreamingAudio('8k-mulaw');
      }
      
      // Create recorder that sends chunks in real-time
      const newRecorder = await recordAudio((chunk) => {
        if (sendAudio && typeof sendAudio === 'function') {
          sendAudio(chunk);
        }
      });
      setRecorder(newRecorder);
      
      newRecorder.start();
      setIsRecording(true);
      setRecordingStatus("Recording... Click to stop");
    } catch (error) {
      console.error("Error starting recording:", error);
      setRecordingStatus("Error: Could not access microphone");
    }
  };

  // Function to handle stopping the recording and sending to server
  const handleStopRecording = async () => {
    if (!recorder) return;
    
    try {
      setRecordingStatus("Processing audio...");
      await recorder.stop();
      setIsRecording(false);
      
      // Stop streaming audio
      if (stopStreamingAudio && typeof stopStreamingAudio === 'function') {
        stopStreamingAudio();
      }
      
      setRecordingStatus("Audio streaming completed");
      // Reset recorder
      setRecorder(null);
    } catch (error) {
      console.error("Error stopping recording:", error);
      setRecordingStatus("Error processing recording");
      setIsRecording(false);
    }
  };

  // Connect on component mount - only once
  useEffect(() => {
    // Only connect once when component mounts
    connect();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to ensure it only runs once

  return (
    <div className="call-interface p-4 max-w-md mx-auto bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Voice Bot Call</h2>

      {/* Connection status */}
      <div className="mb-4">
        <div className="flex items-center">
          <div
            className={`w-3 h-3 rounded-full mr-2 ${
              status === "connected" ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span>{status === "connected" ? "Connected" : "Disconnected"}</span>
        </div>
        {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
      </div>

      {/* Call participants */}
      <div className="flex justify-between mb-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <span className="text-blue-500 text-xl">C</span>
          </div>
          <p className="font-medium">Client</p>
          <div
            className={`text-xs ${
              Date.now() - lastClientActivity < 3000
                ? "text-green-500"
                : "text-gray-500"
            }`}
          >
            {formatTimestamp(lastClientActivity)}
          </div>
          <div className="mt-1 text-sm">{clientMessages} msgs</div>
        </div>

        <div className="text-center">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <span className="text-purple-500 text-xl">V</span>
          </div>
          <p className="font-medium">Vendor</p>
          <div
            className={`text-xs ${
              Date.now() - lastVendorActivity < 3000
                ? "text-green-500"
                : "text-gray-500"
            }`}
          >
            {formatTimestamp(lastVendorActivity)}
          </div>
          <div className="mt-1 text-sm">{vendorMessages} msgs</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-center space-x-4 mb-4">
        <button
          onClick={connect}
          disabled={status === "connected" || status === "connecting"}
          className={`px-4 py-2 rounded-md ${
            status === "connected" || status === "connecting"
              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
              : "bg-green-500 text-white hover:bg-green-600"
          }`}
        >
          Connect
        </button>
        <button
          onClick={disconnect}
          disabled={status === "disconnected"}
          className={`px-4 py-2 rounded-md ${
            status === "disconnected"
              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
              : "bg-red-500 text-white hover:bg-red-600"
          }`}
        >
          Disconnect
        </button>
      </div>
      {isStreaming && <div className="streaming-indicator text-center text-sm text-green-500 mb-2">Streaming Audio (8k mu-law)</div>}
      
      {/* Audio initialization button */}
      <div className="flex justify-center mb-4">
        <button
          onClick={handleInitializeAudio}
          className={`px-4 py-2 rounded-md ${
            audioInitialized
              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
              : "bg-blue-500 text-white hover:bg-blue-600"
          }`}
          disabled={audioInitialized}
        >
          {audioInitialized ? "Audio Initialized" : "Initialize Audio"}
        </button>
        {audioInitialized && status === "connected" && (
          <button
            onClick={() => {
              console.log('Handle Communications button clicked');
              if (handleCommunications && typeof handleCommunications === 'function') {
                console.log('Calling handleCommunications function');
                handleCommunications();
              } else {
                console.error('handleCommunications is not a function:', handleCommunications);
              }
            }}
            className="px-4 py-2 rounded-md bg-purple-500 text-white hover:bg-purple-600 ml-2"
          >
            Handle Communications
          </button>
        )}
      </div>
      
      {/* Voice Recording Button */}
      <div className="flex flex-col items-center mt-4">
        <button
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={!audioInitialized || status !== "connected"}
          className={`px-6 py-3 rounded-full font-medium text-white flex items-center ${
            !audioInitialized || status !== "connected"
              ? "bg-gray-300 cursor-not-allowed"
              : isRecording 
                ? "bg-red-500 hover:bg-red-600" 
                : "bg-green-500 hover:bg-green-600"
          }`}
        >
          <svg 
            className={`w-5 h-5 mr-2 ${isRecording ? "animate-pulse" : ""}`} 
            fill="currentColor" 
            viewBox="0 0 20 20" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <path 
              fillRule="evenodd" 
              d={isRecording 
                ? "M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" 
                : "M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z"
              } 
              clipRule="evenodd" 
            />
          </svg>
          {isRecording ? "Stop Recording" : "Record Voice (8k mulaw)"}
        </button>
        {recordingStatus && (
          <p className="mt-2 text-sm text-gray-600">{recordingStatus}</p>
        )}
      </div>
    </div>
  );
};

export default CallInterface;
