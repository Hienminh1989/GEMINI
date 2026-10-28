const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

const earlyOld = `      if (now < effectiveCheckoutDatetime) {
        earlyLeaveMinutes = Math.floor((effectiveCheckoutDatetime.getTime() - now.getTime()) / 60000);
        greetingMsg = \`Đã ra ca sớm thành công (sớm \${earlyLeaveMinutes} phút). Thông tin đã được ghi nhận vào hệ thống.\`;
      } else {
        earlyLeaveMinutes = 0;
        greetingMsg = \`Đã ra ca \${shiftName} thành công! Chúc bạn những phút giây nghỉ ngơi vui vẻ bên gia đình!\`;
      }`;

const earlyNew = `      if (now < effectiveCheckoutDatetime) {
        const diffMins = Math.floor((effectiveCheckoutDatetime.getTime() - now.getTime()) / 60000);
        const dateStr = format(now, 'yyyy-MM-dd');
        await db.query(
          \`INSERT INTO attendance_failed 
             (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason)
           VALUES 
             ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)\`,
          [effectiveUserId, effectiveUserName, effectiveDepartment, serverTimestamp, dateStr, 'early_checkout', type, location, deviceInfo, \`Chưa đến giờ tan ca (còn \${diffMins} phút)\`]
        );
        await db.query('ROLLBACK');
        return res.status(400).json({ 
           error: \`Chưa đến giờ tan ca! Vui lòng đợi thêm \${diffMins} phút nữa để điểm danh ra ca \${shiftName}.\`,
           status: 'early_checkout'
        });
      } else {
        earlyLeaveMinutes = 0;
        greetingMsg = \`Đã ra ca \${shiftName} thành công! Chúc bạn những phút giây nghỉ ngơi vui vẻ bên gia đình!\`;
      }`;

if (code.includes(earlyOld)) {
  code = code.replace(earlyOld, earlyNew);
  fs.writeFileSync('server.ts', code);
  console.log("Fixed early checkout logic");
} else {
  console.log("Could not find early checkout logic block to replace.");
}
