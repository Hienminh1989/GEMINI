const fs = require('fs');
let code = fs.readFileSync('src/lib/audio.ts', 'utf-8');

if (!code.includes('unlockAudio')) {
  const unlockCode = `
/**
 * Call this synchronously inside onClick to unlock browser audio context
 */
export function unlockAudio(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.001; // nearly silent
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.01);
  } catch(e) {}
}
`;
  code = code + unlockCode;
  fs.writeFileSync('src/lib/audio.ts', code);
}
