const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

const oldLogic = `OR $3 ILIKE '%' || TRIM(user_name) || '%'`;
const newLogic = `OR TRIM(user_name) ILIKE '%' || $3 || '%'`;

if (code.includes(oldLogic)) {
  code = code.replace(oldLogic, newLogic);
  fs.writeFileSync('server.ts', code);
  console.log("Fixed duty query logic.");
} else {
  console.log("Could not find duty query logic.");
}
