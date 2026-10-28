const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

const target = "let appliedSchedule;";
const declarations = `
    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;
`;

if (code.includes(target)) {
  code = code.replace(target, target + "\n" + declarations);
  fs.writeFileSync('server.ts', code);
  console.log("Declarations 2 added back.");
} else {
  console.log("Could not find target.");
}
