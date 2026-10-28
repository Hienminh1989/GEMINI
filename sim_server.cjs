process.env.TZ = 'UTC'; // simulate current server without TZ fix
const hour = new Date().getHours();
console.log("Server Hour:", hour);

let shift = 'morning';
if (hour >= 12 && hour < 18) shift = 'afternoon';
else if (hour >= 18) shift = 'evening';
console.log("Shift:", shift);

const config = { morningEnd: '11:20', afternoonEnd: '16:50' };
let endStr = shift === 'morning' ? config.morningEnd : config.afternoonEnd;

const [endH, endM] = endStr.split(':').map(Number);
const endTime = new Date();
endTime.setHours(endH, endM, 0, 0);
console.log("EndTime:", endTime);

if (new Date() < endTime) {
    console.log("BLOCKED! Chưa đến giờ tan ca");
} else {
    console.log("ALLOWED!");
}
