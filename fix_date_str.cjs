const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

// The original lines might look like:
// const dateStr = format(now, 'yyyy-MM-dd');
// const todayDateStr = format(now, 'yyyy-MM-dd');
// const yesterdayDateStr = format(subDays(now, 1), 'yyyy-MM-dd');

// We need to use the VN time to get the correct date string.
// Fortunately, our vnTime object has year, month, date.

const replacementHelper = `
function getVnDateString(vnTimeObj) {
  return \`\${vnTimeObj.year}-\${String(vnTimeObj.month + 1).padStart(2, '0')}-\${String(vnTimeObj.date).padStart(2, '0')}\`;
}
`;

if (!code.includes("getVnDateString")) {
    code = code.replace("function getVnTimeObject", replacementHelper + "\nfunction getVnTimeObject");
}

code = code.replace(/const dateStr = format\(now, 'yyyy-MM-dd'\);/g, "const dateStr = getVnDateString(getVnTimeObject(now));");
code = code.replace(/const todayDateStr = format\(now, 'yyyy-MM-dd'\);/g, "const todayDateStr = getVnDateString(getVnTimeObject(now));");
code = code.replace(/const yesterdayDateStr = format\(subDays\(now, 1\), 'yyyy-MM-dd'\);/g, "const yesterdayDateStr = getVnDateString(getVnTimeObject(new Date(now.getTime() - 24*60*60*1000)));");

fs.writeFileSync('server.ts', code);
console.log("Updated date_str logic.");
