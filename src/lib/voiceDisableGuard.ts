import { useAnimationStore } from '@/store/animationStore';

export function isVoiceDisabledNow(): boolean {
  try {
    return useAnimationStore.getState().isVoiceDisabled;
  } catch {
    return false;
  }
}

export function muteGlobalAudioElement(): void {
  try {
    const audioEl: HTMLAudioElement | undefined = (window as any).__hexaAudioEl;
    if (audioEl) {
      audioEl.muted = true;
      if (!audioEl.paused) audioEl.pause();
    }
  } catch {}
}

export function muteAllPageAudio(): void {
  try {
    const els = Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[];
    els.forEach((el) => {
      try {
        el.muted = true;
        if (!el.paused) el.pause();
      } catch {}
    });
  } catch {}
}

export function silenceAudioEverywhere(): void {
  muteGlobalAudioElement();
  muteAllPageAudio();
}

