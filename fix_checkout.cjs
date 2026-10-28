const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

// Fix 1: Location Check - Only block if type === 'in'
const locationOld = `    if (distance > maxRadius) {
        const dateStr = format(now, 'yyyy-MM-dd');
        await db.query(
          \`INSERT INTO attendance_failed 
             (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason)
           VALUES 
             ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)\`,
          [effectiveUserId, effectiveUserName, effectiveDepartment, serverTimestamp, dateStr, 'out_of_range', type, location, deviceInfo, reason || '']
        );
        return res.status(400).json({ 
             error: \`Vị trí của bạn (\${Math.round(distance)}m) vượt quá khoảng cách cho phép (\${maxRadius}m) so với bệnh viện.\`,
            status: 'out_of_range',
            distance
        });
    }`;

const locationNew = `    if (distance > maxRadius) {
        if (type === 'in') {
            const dateStr = format(now, 'yyyy-MM-dd');
            await db.query(
              \`INSERT INTO attendance_failed 
                 (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason)
               VALUES 
                 ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)\`,
              [effectiveUserId, effectiveUserName, effectiveDepartment, serverTimestamp, dateStr, 'out_of_range', type, location, deviceInfo, reason || '']
            );
            return res.status(400).json({ 
                 error: \`Vị trí của bạn (\${Math.round(distance)}m) vượt quá khoảng cách cho phép (\${maxRadius}m) so với bệnh viện.\`,
                status: 'out_of_range',
                distance
            });
        }
        // If type === 'out', we just ignore the out of range and allow check-out.
    }`;

code = code.replace(locationOld, locationNew);

// Fix 2: Early Check-out Check - Allow but record
const earlyOld = `    } else if (type === 'out') {
      // Early leave calculation
      if (now < effectiveCheckoutDatetime) {
        const diffMins = Math.floor((effectiveCheckoutDatetime.getTime() - now.getTime()) / 60000);
        
        // Cập nhật: THẤT BẠI NẾU CHƯA ĐẾN GIỜ TAN CA!
        const dateStr = format(now, 'yyyy-MM-dd');
        await db.query(
          \`INSERT INTO attendance_failed 
             (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason)
           VALUES 
             ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)\`,
          [effectiveUserId, effectiveUserName, effectiveDepartment, serverTimestamp, dateStr, 'early_checkout', type, location, deviceInfo, \`Chưa đến giờ tan ca (còn \${diffMins} phút)\`]
        );
        return res.status(400).json({ 
           error: \`Chưa đến giờ tan ca! Vui lòng đợi thêm \${diffMins} phút nữa để điểm danh ra ca \${shiftName}.\`,
           status: 'early_checkout'
        });
      } else {
        earlyLeaveMinutes = 0;
        greetingMsg = \`Đã ra ca \${shiftName} thành công! Chúc bạn những phút giây nghỉ ngơi vui vẻ bên gia đình!\`;
      }`;

const earlyNew = `    } else if (type === 'out') {
      // Early leave calculation
      if (now < effectiveCheckoutDatetime) {
        earlyLeaveMinutes = Math.floor((effectiveCheckoutDatetime.getTime() - now.getTime()) / 60000);
        greetingMsg = \`Đã ra ca sớm thành công (sớm \${earlyLeaveMinutes} phút). Thông tin đã được ghi nhận vào hệ thống.\`;
      } else {
        earlyLeaveMinutes = 0;
        greetingMsg = \`Đã ra ca \${shiftName} thành công! Chúc bạn những phút giây nghỉ ngơi vui vẻ bên gia đình!\`;
      }`;

code = code.replace(earlyOld, earlyNew);

fs.writeFileSync('server.ts', code);
