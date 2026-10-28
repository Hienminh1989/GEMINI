const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

code = code.replace("app.use('/api/*',", "app.use('/api/*all',");
fs.writeFileSync('server.ts', code);
console.log("Fixed express fallback");
