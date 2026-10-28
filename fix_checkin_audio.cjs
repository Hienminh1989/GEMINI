const fs = require('fs');
let code = fs.readFileSync('src/pages/CheckIn.tsx', 'utf-8');

// Replace `import { triggerAttendanceAudio, isSoundEnabled, setSoundEnabled, playCheckInSuccessSound } from '../lib/audio';`
// with `import { triggerAttendanceAudio, isSoundEnabled, setSoundEnabled, playCheckInSuccessSound, unlockAudio } from '../lib/audio';`

if (!code.includes('unlockAudio')) {
  code = code.replace(
    /import \{ triggerAttendanceAudio, isSoundEnabled, setSoundEnabled, playCheckInSuccessSound \} from '\.\.\/lib\/audio';/,
    "import { triggerAttendanceAudio, isSoundEnabled, setSoundEnabled, playCheckInSuccessSound, unlockAudio } from '../lib/audio';"
  );
  
  // Add unlockAudio() at the top of handleCheckIn
  code = code.replace(
    /const handleCheckIn = async \(type: 'in' \| 'out'\) => \{/,
    "const handleCheckIn = async (type: 'in' | 'out') => {\n    unlockAudio();"
  );
  
  fs.writeFileSync('src/pages/CheckIn.tsx', code);
}
