import { useVoiceControlService } from './voiceControlService';

interface VoiceInteractionControlsOptions {
  setVoiceState: (state: any) => void;
  onError?: (error: string) => void;
  startListening: () => void;
  stopListening: () => void;
  startSpeaking: () => void;
  stopSpeaking: () => void;
  setSpeechIntensity: (intensity: number) => void;
  openaiAgentRef: React.MutableRefObject<any>;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  audioQueueRef: React.MutableRefObject<ArrayBuffer[]>;
  isPlayingRef: React.MutableRefObject<boolean>;
}

export const useVoiceInteractionControls = (options: VoiceInteractionControlsOptions) => {
  const {
    setVoiceState,
    onError,
    startListening,
    stopListening,
    startSpeaking,
    stopSpeaking,
    setSpeechIntensity,
    openaiAgentRef,
    audioContextRef,
    audioQueueRef,
    isPlayingRef
  } = options;

  const {
    startRecording: startRecordingControl,
    stopRecording: stopRecordingControl,
    playAudioQueue,
    sendText: sendTextControl,
    switchAgent: switchAgentControl,
    interrupt: interruptControl
  } = useVoiceControlService({
    setVoiceState,
    onError,
    startListening,
    stopListening,
    startSpeaking,
    stopSpeaking,
    setSpeechIntensity,
    openaiAgentRef,
    audioContextRef,
    audioQueueRef,
    isPlayingRef
  });

  return {
    startRecording: startRecordingControl,
    stopRecording: stopRecordingControl,
    playAudioQueue,
    sendText: sendTextControl,
    switchAgent: switchAgentControl,
    interrupt: interruptControl
  };
};
