const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

const target = `    if (distance > maxRadius) {
        const dateStr = format(now, 'yyyy-MM-dd');`;

const replacement = `    if (distance > maxRadius && type === 'in') {
        const dateStr = format(now, 'yyyy-MM-dd');`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log("Success replacing distance check");
} else {
  console.log("Failed to find target block");
}
