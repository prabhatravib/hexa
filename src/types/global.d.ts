// Global type declarations for Hexa debugging
declare global {
  interface Window {
    __hexaAudioEl: HTMLAudioElement | null;
    __currentVoiceState: string;
    __hexaDebug: () => void;
  }
}

export {};
