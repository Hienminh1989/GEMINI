// Audio utility using Web Audio API and Speech Synthesis for check-in / check-out notifications

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Play a pleasant synthesized chord / chime for Check-In Success (Vào ca)
 */
export function playCheckInSuccessSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Chime notes: C5 (523.25), E5 (659.25), G5 (783.99), C6 (1046.50)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      // Volume envelope
      gain.gain.setValueAtTime(0, now + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.3, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.55);
    });
  } catch (err) {
    console.warn('Audio play error:', err);
  }
}

/**
 * Play a warm synthesized chord / chime for Check-Out Success (Ra ca)
 */
export function playCheckOutSuccessSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Chime notes: G5 (783.99), E5 (659.25), C5 (523.25), G4 (392.00)
    const notes = [783.99, 659.25, 523.25, 392.00];
    
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);

      // Volume envelope
      gain.gain.setValueAtTime(0, now + idx * 0.09);
      gain.gain.linearRampToValueAtTime(0.28, now + idx * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.65);
    });
  } catch (err) {
    console.warn('Audio play error:', err);
  }
}

/**
 * Play a warning / error sound
 */
export function playErrorSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.setValueAtTime(220, now + 0.15);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);
  } catch (err) {
    console.warn('Audio play error:', err);
  }
}

/**
 * Text-to-speech announcement in Vietnamese
 */
export function speakVietnamese(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel(); // Stop any pending speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Find Vietnamese voice if available
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find(v => v.lang && (v.lang.toLowerCase().includes('vi-vn') || v.lang.toLowerCase().includes('vi_vn') || v.lang.toLowerCase().startsWith('vi')));
    if (viVoice) {
      utterance.voice = viVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
  }
}

/**
 * Check if sound notifications are enabled in user settings
 */
export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const saved = localStorage.getItem('checkin_sound_enabled');
  return saved === null ? true : saved === 'true';
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('checkin_sound_enabled', enabled ? 'true' : 'false');
}

/**
 * High level trigger for attendance events
 */
export function triggerAttendanceAudio(type: 'in' | 'out' | 'error', options?: { userName?: string; isLate?: boolean; isEarly?: boolean }): void {
  if (!isSoundEnabled()) return;

  const rawName = options?.userName ? options.userName.trim() : '';
  const name = rawName;

  if (type === 'in') {
    playCheckInSuccessSound();
    const textToSpeak = name 
      ? `Chào bạn ${name}, bạn đã chấm công vào thành công.`
      : `Chào bạn, bạn đã chấm công vào thành công.`;
    setTimeout(() => {
      speakVietnamese(textToSpeak);
    }, 200);
  } else if (type === 'out') {
    playCheckOutSuccessSound();
    const textToSpeak = name 
      ? `Chào bạn ${name}, bạn đã chấm công ra thành công.`
      : `Chào bạn, bạn đã chấm công ra thành công.`;
    setTimeout(() => {
      speakVietnamese(textToSpeak);
    }, 200);
  } else if (type === 'error') {
    playErrorSound();
  }
}

/**
 * Call this synchronously inside onClick to unlock browser audio context & speech synthesis
 */
export function unlockAudio(): void {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (ctx) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.001; // nearly silent
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.01);
    }

    // Prime Web Speech Synthesis engine on mobile browsers (iOS Safari / Chrome)
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const dummy = new SpeechSynthesisUtterance('');
      dummy.volume = 0.01;
      window.speechSynthesis.speak(dummy);
    }
  } catch(e) {}
}
