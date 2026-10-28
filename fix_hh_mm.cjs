const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');
code = code.replace(/hh:mm/g, 'HH:mm');
fs.writeFileSync('server.ts', code);
