const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

// regex replace
code = code.replace(/if\s*\(\s*distance\s*>\s*maxRadius\s*\)\s*\{/, "if (distance > maxRadius && type === 'in') {");
fs.writeFileSync('server.ts', code);
console.log("Replaced with regex");
