const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

const regex = /if\s*\(distance\s*>\s*maxRadius\)\s*\{\s*const\s*dateStr[^}]+return\s*res\.status\(400\)\.json\(\{[^}]+\}\);\s*\}/s;

const match = regex.exec(code);
if (match) {
  const replacement = match[0].replace('if (distance > maxRadius) {', "if (distance > maxRadius && type === 'in') {");
  code = code.replace(regex, replacement);
  fs.writeFileSync('server.ts', code);
  console.log("Fixed server.ts geofence");
} else {
  console.log("Could not find distance check block.");
}
