const { format } = require('date-fns');
function test(nowHour, nowMin, type) {
    const now = new Date();
    now.setHours(nowHour, nowMin, 0, 0);
    
    let shift = 'morning';
    let shiftDate = now;
    const hour = now.getHours();
    if (hour >= 12 && hour < 18) shift = 'afternoon';
    else if (hour >= 18) shift = 'evening';
    
    let config = { morningStart: '07:00', morningEnd: '11:20', afternoonStart: '13:30', afternoonEnd: '16:50' };
    
    if (type === 'out') {
        let endStr = shift === 'morning' ? config.morningEnd : config.afternoonEnd;
        const [endH, endM] = endStr.split(':').map(Number);
        const endTime = new Date(now);
        endTime.setHours(endH, endM, 0, 0);
        
        if (now < endTime) {
            console.log(`${nowHour}:${nowMin} OUT => BLOCKED! ${now} < ${endTime}`);
        } else {
            console.log(`${nowHour}:${nowMin} OUT => ALLOWED!`);
        }
    } else {
        let startStr = shift === 'morning' ? config.morningStart : (shift === 'afternoon' ? config.afternoonStart : '18:00');
        const [startH, startM] = startStr.split(':').map(Number);
        const startTime = new Date(shiftDate);
        startTime.setHours(startH, startM, 0, 0);
        
        if (now <= startTime) {
            console.log(`${nowHour}:${nowMin} IN => ON TIME!`);
        } else {
            const lateMinutes = Math.floor((now.getTime() - startTime.getTime()) / 60000);
            console.log(`${nowHour}:${nowMin} IN => LATE by ${lateMinutes}m`);
        }
    }
}
test(16, 49, 'out');
test(16, 50, 'out');
test(23, 59, 'out');
test(0, 1, 'out');
test(0, 1, 'in');
test(6, 59, 'in');
test(7, 1, 'in');
