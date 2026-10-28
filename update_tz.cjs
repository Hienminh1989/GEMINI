const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

const helper = `
// --- TZ Helper ---
function getVnTimeObject(utcDate) {
  const vnOffset = 7 * 60 * 60 * 1000;
  const fakeVnDate = new Date(utcDate.getTime() + vnOffset);
  return {
    year: fakeVnDate.getUTCFullYear(),
    month: fakeVnDate.getUTCMonth(),
    date: fakeVnDate.getUTCDate(),
    hours: fakeVnDate.getUTCHours(),
    minutes: fakeVnDate.getUTCMinutes(),
    getDateForVnTime: (h, m, s = 0) => {
       const d = new Date(Date.UTC(fakeVnDate.getUTCFullYear(), fakeVnDate.getUTCMonth(), fakeVnDate.getUTCDate(), h, m, s));
       return new Date(d.getTime() - vnOffset);
    }
  }
}
// -----------------
`;

if (!code.includes("function getVnTimeObject")) {
  code = code.replace("const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;", "const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;\n" + helper);
}

fs.writeFileSync('server.ts', code);
console.log("Helper added.");
