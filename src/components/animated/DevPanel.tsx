import React, { useState, useEffect, useRef } from 'react';
import { useAnimationStore } from '@/store/animationStore';

interface DevPanelProps {
  isVisible?: boolean;
}

export const DevPanel: React.FC<DevPanelProps> = ({ isVisible = false }) => {
  const { mouthOpennessTarget, voiceState, setMouthTarget, resetMouth } = useAnimationStore();
  
  const [testTarget, setTestTarget] = useState(0);
  const [simulateSpeaking, setSimulateSpeaking] = useState(false);
  const [performanceStats, setPerformanceStats] = useState({
    storeWritesPerSecond: 0,
    maxDelta: 0,
    currentOpenness: 0,
    fps: 0
  });
  
  const statsRef = useRef<{
    writeCount: number;
    lastWriteTime: number;
    maxDelta: number;
    frameCount: number;
    lastFrameTime: number;
  }>({
    writeCount: 0,
    lastWriteTime: Date.now(),
    maxDelta: 0,
    frameCount: 0,
    lastFrameTime: Date.now()
  });
  
  // Performance monitoring
  useEffect(() => {
    if (!isVisible) return;
    
    const updateStats = () => {
      const now = Date.now();
      const timeSinceLastWrite = now - statsRef.current.lastWriteTime;
      
      if (timeSinceLastWrite >= 1000) { // Update every second
        const writesPerSecond = statsRef.current.writeCount;
        const fps = statsRef.current.frameCount;
        
        setPerformanceStats(prev => ({
          ...prev,
          storeWritesPerSecond: writesPerSecond,
          fps: fps
        }));
        
        // Reset counters
        statsRef.current.writeCount = 0;
        statsRef.current.frameCount = 0;
        statsRef.current.lastWriteTime = now;
      }
      
      statsRef.current.frameCount++;
      requestAnimationFrame(updateStats);
    };
    
    const animationId = requestAnimationFrame(updateStats);
    
    return () => cancelAnimationFrame(animationId);
  }, [isVisible]);
  
  // Monitor store writes
  useEffect(() => {
    if (!isVisible) return;
    
    const now = Date.now();
    statsRef.current.writeCount++;
    
    // Track max delta between target and current
    const delta = Math.abs(mouthOpennessTarget - performanceStats.currentOpenness);
    if (delta > statsRef.current.maxDelta) {
      statsRef.current.maxDelta = delta;
      setPerformanceStats(prev => ({ ...prev, maxDelta: delta }));
    }
    
    setPerformanceStats(prev => ({ ...prev, currentOpenness: mouthOpennessTarget }));
  }, [mouthOpennessTarget, isVisible, performanceStats.currentOpenness]);
  
  // Simulate speaking state
  useEffect(() => {
    if (!isVisible || !simulateSpeaking) return;
    
    const interval = setInterval(() => {
      const randomTarget = Math.random() * 0.8 + 0.2; // Random between 0.2 and 1.0
      setMouthTarget(randomTarget);
    }, 100); // Update every 100ms for realistic speech simulation
    
    return () => clearInterval(interval);
  }, [simulateSpeaking, isVisible, setMouthTarget]);

  const handleReset = async () => {
    try {
      console.log('🔄 Manual reset triggered');
      const response = await fetch('/voice/reset', { method: 'POST' });
      if (response.ok) {
        console.log('✅ Manual reset successful');
        // Reload the page to start fresh
        window.location.reload();
      } else {
        console.error('❌ Manual reset failed:', response.status);
      }
    } catch (error) {
      console.error('❌ Manual reset error:', error);
      // Force reload as fallback
      window.location.reload();
    }
  };
  
  if (!isVisible) return null;
  
  return (
    <div className="fixed top-4 right-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4 z-50 max-w-sm">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
        🎯 Mouth Dev Panel
      </h3>
      
      {/* Test Controls */}
      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Test Mouth Target (0-1)
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={testTarget}
              onChange={(e) => setTestTarget(parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="text-xs text-gray-500 w-12">
              {testTarget.toFixed(2)}
            </span>
          </div>
          <div className="flex space-x-2 mt-1">
            <button
              onClick={() => setMouthTarget(testTarget)}
              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Set
            </button>
            <button
              onClick={resetMouth}
              className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Reset
            </button>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="simulateSpeaking"
            checked={simulateSpeaking}
            onChange={(e) => setSimulateSpeaking(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="simulateSpeaking" className="text-xs text-gray-600 dark:text-gray-400">
            Simulate Speaking
          </label>
        </div>
        
        {/* Test Speaking State */}
        <div className="flex space-x-2">
          <button
            onClick={() => {
              console.log('🧪 Test button: Starting speaking...');
              useAnimationStore.getState().startSpeaking();
            }}
            className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
          >
            Test Start Speaking
          </button>
          <button
            onClick={() => {
              console.log('🧪 Test button: Stopping speaking...');
              useAnimationStore.getState().stopSpeaking();
            }}
            className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
          >
            Test Stop Speaking
          </button>
        </div>
        
        {/* Manual Mouth Test */}
        <div className="flex space-x-2">
          <button
            onClick={() => {
              console.log('🧪 Manual mouth test: Setting target to 0.8');
              useAnimationStore.getState().setMouthTarget(0.8);
            }}
            className="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600"
          >
            Mouth 0.8
          </button>
          <button
            onClick={() => {
              console.log('🧪 Manual mouth test: Setting target to 0.2');
              useAnimationStore.getState().setMouthTarget(0.2);
            }}
            className="px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            Mouth 0.2
          </button>
        </div>
      </div>
      
      {/* Performance Stats */}
      <div className="space-y-2 text-xs">
        <div className="border-t pt-2">
          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Performance</h4>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-gray-500">Store Writes:</span>
              <span className="ml-1 font-mono text-green-600">
                {performanceStats.storeWritesPerSecond}/s
              </span>
            </div>
            <div>
              <span className="text-gray-500">FPS:</span>
              <span className="ml-1 font-mono text-blue-600">
                {performanceStats.fps}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Max Delta:</span>
              <span className="ml-1 font-mono text-orange-600">
                {performanceStats.maxDelta.toFixed(3)}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Current:</span>
              <span className="ml-1 font-mono text-purple-600">
                {performanceStats.currentOpenness.toFixed(3)}
              </span>
            </div>
          </div>
        </div>
        
        {/* Voice State */}
        <div className="border-t pt-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Voice State:</span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              voiceState === 'speaking' ? 'bg-blue-100 text-blue-800' :
              voiceState === 'listening' ? 'bg-green-100 text-green-800' :
              voiceState === 'thinking' ? 'bg-yellow-100 text-yellow-800' :
              voiceState === 'error' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {voiceState}
            </span>
          </div>
        </div>
        
        {/* Voice Debug Section */}
        <div className="border-t pt-2">
          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Voice Debug</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Audio Element:</span>
              <span className={window.__hexaAudioEl ? 'text-green-600' : 'text-red-600'}>
                {window.__hexaAudioEl ? '✅' : '❌'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Audio srcObject:</span>
              <span className={window.__hexaAudioEl?.srcObject ? 'text-green-600' : 'text-red-600'}>
                {window.__hexaAudioEl?.srcObject ? '✅' : '❌'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Audio Playing:</span>
              <span className={window.__hexaAudioEl?.paused === false ? 'text-green-600' : 'text-red-600'}>
                {window.__hexaAudioEl?.paused === false ? '✅' : '❌'}
              </span>
            </div>
          </div>
          <button 
            onClick={() => window.__hexaDebug?.()}
            className="mt-2 w-full px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs"
          >
            Debug Console
          </button>
        </div>
      </div>
      <button 
        onClick={handleReset}
        className="mt-4 w-full px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
      >
        Reset Voice Service
      </button>
    </div>
  );
};
