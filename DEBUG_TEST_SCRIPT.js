// Hexa Audio Analyzer Debug Test Script
// Run this in the browser console (F12 -> Console tab)

console.log('🧪 Starting Hexa Audio Analyzer Debug Test...');

// Test 1: Check global debug variables
console.log('\n🔍 Test 1: Global Debug Variables');
console.log('window.__hexaAudioEl:', window.__hexaAudioEl);
console.log('window.__currentVoiceState:', window.__currentVoiceState);
console.log('window.__hexaDebug:', typeof window.__hexaDebug);

// Test 2: Check if DevPanel is accessible
console.log('\n🔍 Test 2: DevPanel Access');
const devPanel = document.querySelector('[class*="DevPanel"]');
console.log('DevPanel found:', !!devPanel);

// Test 3: Check animation store state
console.log('\n🔍 Test 3: Animation Store State');
if (window.__hexaAudioEl) {
  console.log('Audio Element Properties:');
  console.log('  - srcObject:', window.__hexaAudioEl.srcObject);
  console.log('  - readyState:', window.__hexaAudioEl.readyState);
  console.log('  - paused:', window.__hexaAudioEl.paused);
  console.log('  - currentTime:', window.__hexaAudioEl.currentTime);
  console.log('  - duration:', window.__hexaAudioEl.duration);
  console.log('  - volume:', window.__hexaAudioEl.volume);
  console.log('  - muted:', window.__hexaAudioEl.muted);
  
  // Check if it's a MediaStream
  if (window.__hexaAudioEl.srcObject instanceof MediaStream) {
    const stream = window.__hexaAudioEl.srcObject;
    console.log('  - Stream tracks:', stream.getTracks().length);
    stream.getTracks().forEach((track, i) => {
      console.log(`    Track ${i}:`, {
        kind: track.kind,
        readyState: track.readyState,
        enabled: track.enabled,
        muted: track.muted
      });
    });
  }
} else {
  console.log('❌ No audio element found');
}

// Test 4: Check voice state
console.log('\n🔍 Test 4: Voice State');
console.log('Current voice state:', window.__currentVoiceState);

// Test 5: Manual mouth test
console.log('\n🔍 Test 5: Manual Mouth Test');
console.log('Use the DevPanel buttons to test:');
console.log('  - "Test Start Speaking" to trigger speaking state');
console.log('  - "Mouth 0.8" to test mouth animation');
console.log('  - "Mouth 0.2" to test mouth animation');

// Test 6: Run comprehensive debug
console.log('\n🔍 Test 6: Comprehensive Debug');
if (typeof window.__hexaDebug === 'function') {
  console.log('Running window.__hexaDebug()...');
  window.__hexaDebug();
} else {
  console.log('❌ window.__hexaDebug function not found');
}

// Test 7: Check for audio context
console.log('\n🔍 Test 7: Audio Context Check');
try {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  console.log('AudioContext created successfully');
  console.log('  - State:', audioContext.state);
  console.log('  - Sample rate:', audioContext.sampleRate);
  console.log('  - Destination max channel count:', audioContext.destination.maxChannelCount);
  
  // Test creating an analyzer
  const analyzer = audioContext.createAnalyser();
  console.log('  - Analyzer created successfully');
  console.log('  - FFT size:', analyzer.fftSize);
  console.log('  - Frequency bin count:', analyzer.frequencyBinCount);
  
  audioContext.close();
} catch (error) {
  console.error('❌ AudioContext test failed:', error);
}

// Test 8: Check for WebRTC support
console.log('\n🔍 Test 8: WebRTC Support');
console.log('RTCPeerConnection:', typeof RTCPeerConnection);
console.log('MediaStream:', typeof MediaStream);
console.log('MediaStreamTrack:', typeof MediaStreamTrack);

// Test 9: Check for voice interaction hooks
console.log('\n🔍 Test 9: Voice Interaction Hooks');
const voiceHooks = [
  'useVoiceInteraction',
  'useVoiceAgentService', 
  'useVoiceConnectionService',
  'useVoiceControlService'
];

voiceHooks.forEach(hook => {
  console.log(`${hook}:`, typeof window[hook]);
});

// Test 10: Performance check
console.log('\n🔍 Test 10: Performance Check');
console.log('Performance.now available:', typeof performance.now === 'function');
console.log('RequestAnimationFrame available:', typeof requestAnimationFrame === 'function');

// Summary
console.log('\n🎯 Debug Test Summary');
console.log('✅ Check the console output above for any issues');
console.log('✅ Use DevPanel to manually test mouth animation');
console.log('✅ Look for specific error messages or missing components');
console.log('✅ Check if audio element has srcObject and is playing');
console.log('✅ Verify voice state changes when testing speaking');

console.log('\n🧪 Debug Test Complete!');
console.log('Next steps:');
console.log('1. Try to trigger voice interaction');
console.log('2. Watch console for debug logs');
console.log('3. Use DevPanel to test manual controls');
console.log('4. Look for specific failure points');
