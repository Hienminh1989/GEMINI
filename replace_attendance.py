import re

with open('server.ts', 'r') as f:
    content = f.read()

# Find the block starting with app.post("/api/attendance", async (req, res) => {
# and ending before app.put("/api/attendance/:id", async (req, res) => {
start_idx = content.find('app.post("/api/attendance", async (req, res) => {')
end_idx = content.find('app.put("/api/attendance/:id", async (req, res) => {')

if start_idx == -1 or end_idx == -1:
    print("Could not find the block to replace!")
    exit(1)

old_block = content[start_idx:end_idx]

new_block = """app.post("/api/attendance", async (req, res) => {
  try {
    const { 
      userId, userName, department, type, location, deviceInfo, reason 
    } = req.body;
    
    // SERVER TIME IS THE SINGLE SOURCE OF TRUTH
    const now = new Date();
    const serverTimestamp = now.getTime();
    
    // 1. Fetch Config
    const configResult = await client.query("SELECT data FROM settings WHERE id = 'config'");
    let config: any = {
        morningStart: '07:00',
        morningEnd: '11:20',
        afternoonStart: '13:30',
        afternoonEnd: '17:00',
        radius: 600,
        targetLat: 19.866034,
        targetLng: 105.656531
    };
    if (configResult.rows.length > 0) {
        config = { ...config, ...configResult.rows[0].data };
    }

    // 2. Validate Location (GPS check on server)
    const distance = getDistance(
      { latitude: Number(location.lat), longitude: Number(location.lng) },
      { latitude: Number(config.targetLat), longitude: Number(config.targetLng) }
    );
    const maxRadius = Number(config.radius) || 600;
    
    if (distance > maxRadius) {
        const dateStr = format(now, 'yyyy-MM-dd');
        await client.query(
          `INSERT INTO attendance_failed 
            (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason)
           VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [userId, userName, department, serverTimestamp, dateStr, 'out_of_range', type, location, deviceInfo, reason || '']
        );
        return res.status(400).json({ 
            error: `Vị trí của bạn (${Math.round(distance)}m) vượt quá khoảng cách cho phép (${maxRadius}m).`,
            status: 'out_of_range',
            distance
        });
    }

    // 3. Resolve Effective Schedule
    let scheduleType = 'DEFAULT';
    let shiftId = '';
    let startDatetime: Date = new Date();
    let endDatetime: Date = new Date();
    let earlyLeaveMinutes = 0;
    let effectiveCheckoutDatetime: Date = new Date();
    let shiftName = '';
    let appliedSchedule: any = {};

    // Priority 1: Duty Shift (Lịch trực) active right now.
    // Query duty_shifts where 'now' is within the shift window (-2 hours before start to +12 hours after end to allow late checkouts)
    const dutyRes = await client.query(`
        SELECT * FROM duty_shifts 
        WHERE employee_id = $1 
        AND status = 'active'
        AND $2 >= (shift_start_datetime - INTERVAL '2 hours')
        AND $2 <= (shift_end_datetime + INTERVAL '12 hours')
        ORDER BY shift_start_datetime DESC LIMIT 1
    `, [userId, now]);

    if (dutyRes.rows.length > 0) {
        const duty = dutyRes.rows[0];
        scheduleType = 'DUTY_SHIFT';
        shiftId = 'duty_' + duty.id;
        shiftName = duty.shift_type || 'Trực';
        startDatetime = new Date(duty.shift_start_datetime);
        endDatetime = new Date(duty.shift_end_datetime);
        effectiveCheckoutDatetime = new Date(duty.shift_end_datetime);
        
        appliedSchedule = { scheduleType, shiftId, startDatetime, endDatetime, duty_id: duty.id };
    } else {
        // Priority 2 & 3: Custom Schedule or Priority Policy (from special_employees)
        const specialResult = await client.query("SELECT * FROM special_employees WHERE user_name = $1 AND department = $2", [userName, department]);
        
        const hour = now.getHours();
        let ca = 'morning';
        if (hour >= 12) ca = 'afternoon';

        if (specialResult.rows.length > 0) {
            const specialEmp = specialResult.rows[0];
            if (specialEmp.employee_type?.toLowerCase().includes('nuôi con nhỏ')) {
                scheduleType = 'CHILDCARE_PRIORITY';
                earlyLeaveMinutes = specialEmp.early_minutes || 30;
                
                let startStr = ca === 'morning' ? config.morningStart : config.afternoonStart;
                let endStr = ca === 'morning' ? config.morningEnd : config.afternoonEnd;
                
                const [sH, sM] = startStr.split(':').map(Number);
                const [eH, eM] = endStr.split(':').map(Number);
                
                startDatetime = new Date(now); startDatetime.setHours(sH, sM, 0, 0);
                endDatetime = new Date(now); endDatetime.setHours(eH, eM, 0, 0);
                
                effectiveCheckoutDatetime = new Date(endDatetime);
                effectiveCheckoutDatetime.setMinutes(effectiveCheckoutDatetime.getMinutes() - earlyLeaveMinutes);
                shiftId = ca;
                shiftName = ca === 'morning' ? 'Sáng' : 'Chiều';
                
            } else if (specialEmp.custom_start_time && specialEmp.custom_end_time) {
                scheduleType = 'CUSTOM_SCHEDULE';
                const [sH, sM] = specialEmp.custom_start_time.split(':').map(Number);
                const [eH, eM] = specialEmp.custom_end_time.split(':').map(Number);
                
                startDatetime = new Date(now); startDatetime.setHours(sH, sM, 0, 0);
                endDatetime = new Date(now); endDatetime.setHours(eH, eM, 0, 0);
                
                if (sH > eH) { // Night shift
                    shiftId = 'night_custom';
                    shiftName = 'Ca đêm';
                    if (hour < eH + 4) { 
                       startDatetime.setDate(startDatetime.getDate() - 1);
                    } else {
                       endDatetime.setDate(endDatetime.getDate() + 1);
                    }
                } else {
                    shiftId = 'custom';
                    shiftName = 'Ca riêng';
                }
                effectiveCheckoutDatetime = new Date(endDatetime);
            }
        }
        
        if (scheduleType === 'DEFAULT') {
            // Priority 4: Default Schedule
            let startStr = ca === 'morning' ? config.morningStart : config.afternoonStart;
            let endStr = ca === 'morning' ? config.morningEnd : config.afternoonEnd;
            
            const [sH, sM] = startStr.split(':').map(Number);
            const [eH, eM] = endStr.split(':').map(Number);
            
            startDatetime = new Date(now); startDatetime.setHours(sH, sM, 0, 0);
            endDatetime = new Date(now); endDatetime.setHours(eH, eM, 0, 0);
            effectiveCheckoutDatetime = new Date(endDatetime);
            shiftId = ca;
            shiftName = ca === 'morning' ? 'Sáng' : 'Chiều';
        }
        
        appliedSchedule = { scheduleType, shiftId, shiftName, startDatetime, endDatetime, earlyLeaveMinutes, effectiveCheckoutDatetime };
    }

    const currentShiftDateStr = format(startDatetime, 'yyyy-MM-dd');
    let lateMinutes = 0;
    let greetingMsg = '';
    
    // Transaction to prevent duplicates
    await client.query('BEGIN');
    
    if (type === 'in') {
        const existingIn = await client.query(`
            SELECT id FROM attendance 
            WHERE user_id = $1 AND shift_id = $2 AND date_str = $3 AND type = 'in'
        `, [userId, shiftId, currentShiftDateStr]);
        
        if (existingIn.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Bạn đã chấm vào ca này rồi!', status: 'duplicate' });
        }
        
        if (now > startDatetime) {
            lateMinutes = Math.floor((now.getTime() - startDatetime.getTime()) / 60000);
            greetingMsg = `Chấm vào thành công. Bạn đi muộn ${lateMinutes} phút.`;
        } else {
            greetingMsg = `Chấm đúng giờ! Chúc bạn làm việc hiệu quả!`;
        }
    } else if (type === 'out') {
        const existingOut = await client.query(`
            SELECT id FROM attendance 
            WHERE user_id = $1 AND shift_id = $2 AND date_str = $3 AND type = 'out'
        `, [userId, shiftId, currentShiftDateStr]);
        
        if (existingOut.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Bạn đã chấm ra ca này rồi!', status: 'duplicate' });
        }
        
        if (now < effectiveCheckoutDatetime) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                error: `Chưa đến giờ tan ca! Bạn được phép chấm ra từ ${format(effectiveCheckoutDatetime, 'HH:mm')}.`,
                status: 'early_out'
            });
        }
        greetingMsg = 'Đã ra ca thành công.';
    }

    // Insert into attendance
    const result = await client.query(
        `INSERT INTO attendance 
        (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason, shift, late_minutes, early_leave_minutes, shift_id, applied_schedule) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
        RETURNING id`,
        [userId, userName, department, serverTimestamp, currentShiftDateStr, 'success', type, location, deviceInfo, reason || '', shiftName, lateMinutes, earlyLeaveMinutes, shiftId, JSON.stringify(appliedSchedule)]
    );
    
    await client.query('COMMIT');
    res.json({ id: result.rows[0].id.toString(), message: greetingMsg, distance });

  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

"""

content = content.replace(old_block, new_block)
with open('server.ts', 'w') as f:
    f.write(content)
print("Server logic successfully updated with strict schedule resolver!")

