const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

code = code.replace("FROM duty_schedules", "FROM duty_shifts");
fs.writeFileSync('server.ts', code);
console.log("Fixed duty table name");
