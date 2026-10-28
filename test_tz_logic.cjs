function getVnTimeObject(utcDate = new Date()) {
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

const now = new Date("2026-08-19T10:21:00Z"); // 17:21 VN time
const vnTime = getVnTimeObject(now);
console.log("Current VN Hours:", vnTime.hours);
console.log("Current VN Minutes:", vnTime.minutes);

const morningStart = vnTime.getDateForVnTime(7, 0); // 07:00 VN time
console.log("Morning Start (UTC):", morningStart.toISOString());

const afternoonEnd = vnTime.getDateForVnTime(16, 50); // 16:50 VN time
console.log("Afternoon End (UTC):", afternoonEnd.toISOString());

// Test overnight shift
const dutyStart = vnTime.getDateForVnTime(7, 30);
let dutyEnd = vnTime.getDateForVnTime(7, 30);
dutyEnd.setDate(dutyEnd.getDate() + 1); // Add 1 day
console.log("Duty End (UTC):", dutyEnd.toISOString());
