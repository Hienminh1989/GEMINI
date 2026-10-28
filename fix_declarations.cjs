const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

const target = "// 4. Resolve Effective Schedule according to Strict Hierarchy";
const declarations = `
    let scheduleType = 'DEFAULT';
    let shiftId = '';
    let shiftName = '';
    let startDatetime;
    let endDatetime;
    let effectiveCheckoutDatetime;
    let appliedSchedule;
`;

if (code.includes(target)) {
  code = code.replace(target, target + "\n" + declarations);
  fs.writeFileSync('server.ts', code);
  console.log("Declarations added back.");
} else {
  console.log("Could not find target.");
}
