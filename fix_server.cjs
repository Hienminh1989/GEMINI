const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

// Replace `const db = await client.connect();\n  try {`
// with `let db; try { db = await client.connect();`
code = code.replace(/const db = await client\.connect\(\);\s*try\s*\{/g, 'let db;\n  try {\n    db = await client.connect();');

// Replace `finally { db.release(); }`
// with `finally { if (db) db.release(); }`
code = code.replace(/finally\s*\{\s*db\.release\(\);\s*\}/g, 'finally {\n    if (db) db.release();\n  }');

fs.writeFileSync('server.ts', code);
