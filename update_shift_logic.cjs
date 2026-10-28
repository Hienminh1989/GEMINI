const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

// I will just replace the duty checking and the special check logic completely.
// But it's easier to find the whole block and replace it.

const matchStart = "const yesterdayDateStr = format(subDays(now, 1), 'yyyy-MM-dd');";
const matchEnd = "effectiveCheckoutDatetime = new Date(endDatetime);\n        shiftId = ca;\n        shiftName = ca === 'morning' ? 'Sáng' : 'Chiều';";

let startIndex = code.indexOf(matchStart);
let endIndex = code.indexOf(matchEnd);

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find bounds");
  process.exit(1);
}

const before = code.substring(0, startIndex);
const after = code.substring(endIndex + matchEnd.length);

const newLogic = `const yesterdayDateStr = format(subDays(now, 1), 'yyyy-MM-dd');
    const vnTime = getVnTimeObject(now);

    const dutyRes = await db.query(\`
      SELECT * FROM duty_schedules 
      WHERE (
        user_id = $1 
        OR LOWER(TRIM(user_name)) = LOWER(TRIM($2)) 
        OR $3 ILIKE '%' || user_name || '%'
      )
      AND (date_str = $4 OR date_str = $5)
      ORDER BY date_str DESC, id DESC LIMIT 5
    \`, [effectiveUserId, effectiveUserName, effectiveUserName, todayDateStr, yesterdayDateStr]);

    let activeDuty = null;
    if (dutyRes.rows.length > 0) {
      for (const d of dutyRes.rows) {
        const sTime = d.start_time || '07:30';
        const eTime = d.end_time || '07:30';
        const [sH, sM] = sTime.split(':').map(Number);
        const [eH, eM] = eTime.split(':').map(Number);
        
        let sDate, eDate;
        if (d.date_str === todayDateStr) {
           sDate = vnTime.getDateForVnTime(sH, sM);
           eDate = vnTime.getDateForVnTime(eH, eM);
        } else {
           // Yesterday
           const vnYesterday = getVnTimeObject(new Date(now.getTime() - 24*60*60*1000));
           sDate = vnYesterday.getDateForVnTime(sH, sM);
           eDate = vnYesterday.getDateForVnTime(eH, eM);
        }

        if (sH > eH || (sH === eH && sM >= eM)) {
          // Overnight shift (crosses midnight)
          eDate = new Date(eDate.getTime() + 24 * 60 * 60 * 1000);
        }

        // Duty shift is considered active if current time is within [start - 3h, end + 8h]
        const validStart = new Date(sDate.getTime() - 3 * 60 * 60 * 1000);
        const validEnd = new Date(eDate.getTime() + 8 * 60 * 60 * 1000);
        if (now >= validStart && now <= validEnd) {
          activeDuty = { ...d, sDate, eDate };
          break;
        }
      }
    }

    if (activeDuty) {
      scheduleType = 'DUTY_SHIFT';
      shiftId = 'duty_' + activeDuty.id;
      shiftName = activeDuty.duty_role || activeDuty.shift_name || 'Lịch trực';
      startDatetime = activeDuty.sDate;
      endDatetime = activeDuty.eDate;
      effectiveCheckoutDatetime = activeDuty.eDate;
      appliedSchedule = {
        scheduleType,
        shiftId,
        shiftName,
        dutyRole: activeDuty.duty_role,
        dateStr: activeDuty.date_str,
        startTime: activeDuty.start_time,
        endTime: activeDuty.end_time,
        startDatetime,
        endDatetime
      };
    } else {
      // PRIORITY 2 & 3: Check Special Priority / Custom Shifts
      const specialResult = await db.query(
        "SELECT * FROM special_employees WHERE (LOWER(TRIM(user_name)) = LOWER(TRIM($1)) AND department = $2) OR user_id = $3",
        [effectiveUserName, effectiveDepartment, effectiveUserId]
      );

      const currentMinutes = vnTime.hours * 60 + vnTime.minutes;
      
      // Standard hospital config shift boundaries (Default: Morning 07:00 - 11:20, Afternoon 13:30 - 16:50)
      const morningStartStr = config.morningStart || '07:00';
      const morningEndStr = config.morningEnd || '11:20';
      const afternoonStartStr = config.afternoonStart || '13:30';
      const afternoonEndStr = config.afternoonEnd || '16:50';

      const [mStartH, mStartM] = morningStartStr.split(':').map(Number);
      const [mEndH, mEndM] = morningEndStr.split(':').map(Number);
      const [aStartH, aStartM] = afternoonStartStr.split(':').map(Number);
      const [aEndH, aEndM] = afternoonEndStr.split(':').map(Number);
      const afternoonStartMinutes = aStartH * 60 + (aStartM || 0);

      // Determine shift (morning vs afternoon)
      let ca = 'morning';
      if (type === 'in') {
        // Vào ca: Trước 12:30 -> Ca Sáng. Từ 12:30 -> Ca Chiều.
        if (currentMinutes >= Math.max(12 * 60 + 30, afternoonStartMinutes - 60)) {
          ca = 'afternoon';
        } else {
          ca = 'morning';
        }
      } else {
        // Ra ca: Trước giờ bắt đầu ca chiều (13:30) -> Ra ca sáng. Từ 13:30 trở đi -> Ra ca chiều.
        if (currentMinutes < afternoonStartMinutes) {
          ca = 'morning';
        } else {
          ca = 'afternoon';
        }
      }

      if (specialResult.rows.length > 0) {
        const specialEmp = specialResult.rows[0];
        const isNuoiConNho = (specialEmp.employee_type || '').toLowerCase().includes('nuôi con nhỏ') ||
                             (specialEmp.employee_type || '').toLowerCase().includes('nuoi con nho');

        if (isNuoiConNho) {
          // PRIORITY 2: Đối tượng ưu tiên "Nuôi con nhỏ" (Về sớm theo phút)
          scheduleType = 'CHILDCARE_PRIORITY';
          const earlyAllowedMins = Number(specialEmp.early_minutes) || 30;
          
          const startStr = ca === 'morning' ? morningStartStr : afternoonStartStr;
          const endStr = ca === 'morning' ? morningEndStr : afternoonEndStr;
          const [sH, sM] = startStr.split(':').map(Number);
          const [eH, eM] = endStr.split(':').map(Number);

          startDatetime = vnTime.getDateForVnTime(sH, sM);
          endDatetime = vnTime.getDateForVnTime(eH, eM);
          
          // Effective checkout is allowed early by earlyAllowedMins (e.g. 11:20 - 30m = 10:50; 16:50 - 30m = 16:20)
          effectiveCheckoutDatetime = new Date(endDatetime.getTime() - earlyAllowedMins * 60 * 1000);
          shiftId = ca;
          shiftName = ca === 'morning' ? 'Sáng' : 'Chiều';

          appliedSchedule = {
            scheduleType,
            shiftId,
            shiftName,
            employeeType: 'Nuôi con nhỏ',
            earlyAllowedMinutes: earlyAllowedMins,
            startDatetime,
            endDatetime,
            effectiveCheckoutDatetime
          };
        } else if (specialEmp.custom_start_time && specialEmp.custom_end_time) {
          // PRIORITY 3: Đối tượng "Đi làm sớm" hoặc ca đặc thù riêng
          scheduleType = 'CUSTOM_SCHEDULE';
          const [sH, sM] = specialEmp.custom_start_time.split(':').map(Number);
          const [eH, eM] = specialEmp.custom_end_time.split(':').map(Number);

          startDatetime = vnTime.getDateForVnTime(sH, sM);
          endDatetime = vnTime.getDateForVnTime(eH, eM);

          if (sH > eH) {
            // Night shift
            shiftId = 'night_custom';
            shiftName = 'Ca đêm riêng';
            // If it's early morning (e.g. 1 AM, less than eH + 4), then the shift actually started yesterday
            if (vnTime.hours < eH + 4) {
               startDatetime = new Date(startDatetime.getTime() - 24 * 60 * 60 * 1000);
            } else {
               endDatetime = new Date(endDatetime.getTime() + 24 * 60 * 60 * 1000);
            }
          } else {
            shiftId = 'custom';
            shiftName = specialEmp.employee_type || 'Ca riêng';
          }

          effectiveCheckoutDatetime = new Date(endDatetime);

          appliedSchedule = {
            scheduleType,
            shiftId,
            shiftName,
            customStartTime: specialEmp.custom_start_time,
            customEndTime: specialEmp.custom_end_time,
            startDatetime,
            endDatetime,
            effectiveCheckoutDatetime
          };
        }
      }

      // PRIORITY 4: Đối tượng bình thường (Hành chính chuẩn)
      if (scheduleType === 'DEFAULT') {
        const startStr = ca === 'morning' ? morningStartStr : afternoonStartStr;
        const endStr = ca === 'morning' ? morningEndStr : afternoonEndStr;
        const [sH, sM] = startStr.split(':').map(Number);
        const [eH, eM] = endStr.split(':').map(Number);

        startDatetime = vnTime.getDateForVnTime(sH, sM);
        endDatetime = vnTime.getDateForVnTime(eH, eM);
        
        effectiveCheckoutDatetime = new Date(endDatetime);
        shiftId = ca;
        shiftName = ca === 'morning' ? 'Sáng' : 'Chiều';`;

fs.writeFileSync('server.ts', before + newLogic + after);
console.log("Updated shift logic");
