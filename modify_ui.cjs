const fs = require('fs');
const file = 'src/pages/CheckIn.tsx';
let code = fs.readFileSync(file, 'utf-8');

// The output of the previous grep is arriving...
