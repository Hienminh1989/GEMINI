const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

const oldQuery = `SELECT * FROM duty_schedules 
      WHERE (
        user_id = $1 
        OR LOWER(TRIM(user_name)) = LOWER(TRIM($2)) 
        OR $3 ILIKE '%' || user_name || '%'
      )
      AND (date_str = $4 OR date_str = $5)
      ORDER BY date_str DESC, id DESC LIMIT 5`;

const newQuery = `SELECT * FROM duty_schedules 
      WHERE (
        (user_id IS NOT NULL AND user_id != '' AND user_id = $1)
        OR (user_name IS NOT NULL AND TRIM(user_name) != '' AND (
            LOWER(TRIM(user_name)) = LOWER(TRIM($2)) 
            OR $3 ILIKE '%' || TRIM(user_name) || '%'
        ))
      )
      AND (date_str = $4 OR date_str = $5)
      ORDER BY date_str DESC, id DESC LIMIT 5`;

if (code.includes(oldQuery)) {
  code = code.replace(oldQuery, newQuery);
  fs.writeFileSync('server.ts', code);
  console.log("Fixed duty query.");
} else {
  console.log("Could not find duty query.");
}
