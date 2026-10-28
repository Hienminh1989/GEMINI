const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

const target = "if (!isProd) {";
const replacement = `
  // Global API Error Handler
  app.use('/api', (err, req, res, next) => {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  });

  // 404 for missing API routes
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  if (!isProd) {
`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log("Added global API error handler and 404 fallback.");
} else {
  console.log("Could not find target.");
}
