import re

with open('server.ts', 'r') as f:
    content = f.read()

# Add getDistance at the top if not present
if "getDistance" not in content:
    content = content.replace("import cors from 'cors';", "import cors from 'cors';\nimport { getDistance } from 'geolib';\nimport { format, differenceInMinutes } from 'date-fns';")

new_api = """app.post("/api/attendance", async (req, res) => {
  try {
    const { 
      userId, userName, department, type, location, deviceInfo, reason 
    } = req.body;
    
    // SERVER TIME IS THE SINGLE SOURCE OF TRUTH
    const now = new Date();
    const serverTimestamp = now.getTime();
    
    // 1. Fetch Config
    const configResult = await client.query("SELECT data FROM settings WHERE id = 'config'");
    let config = {
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
        // Save to attendance_failed
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
    let isNuoiConNho = false;
    let customStart = null;
    let customEnd = null;
    let earlyLeaveMinutes = 0;

    const specialResult = await client.query("SELECT * FROM special_employees WHERE user_name = $1 AND department = $2", [userName, department]);
    if (specialResult.rows.length > 0) {
        // We take the first valid one, or just the first one as currently implemented
        const specialEmp = specialResult.rows[0];
        // TODO: check valid_from, valid_until if needed. For now assuming active.
        const isActive = true; 
        if (isActive) {
            if (specialEmp.employee_type?.toLowerCase().includes('nuôi con nhỏ')) {
                isNuoiConNho = true;
                earlyLeaveMinutes = specialEmp.early_minutes || 30;
            } else {
                customStart = specialEmp.custom_start_time;
                customEnd = specialEmp.custom_end_time;
            }
        }
    }

    // Determine shift
    const hour = now.getHours();
    let shift = 'morning';
    let shiftDate = now;
    if (hour >= 12 && hour < 18) shift = 'afternoon';
    else if (hour >= 18) shift = 'evening';

    let dateStr = format(shiftDate, 'yyyy-MM-dd');
    let lateMinutes = 0;
    let greetingMsg = '';

    // If custom schedule, override shift logic if it's overnight
    if (customStart && customEnd) {
        const [sH] = customStart.split(':').map(Number);
        const [eH] = customEnd.split(':').map(Number);
        // It's a night shift crossing midnight if start hour > end hour
        if (sH > eH) {
            shift = 'night';
            if (hour < eH + 4) { // Still in the morning of the next day, belongs to yesterday's shift
                shiftDate = new Date(now.getTime() - 24 * 3600 * 1000);
                dateStr = format(shiftDate, 'yyyy-MM-dd');
            }
        }
    }

    if (type === 'in') {
        let startStr = shift === 'morning' ? config.morningStart : (shift === 'afternoon' ? config.afternoonStart : '18:00');
        if (customStart) {
            startStr = customStart;
        }

        const [startH, startM] = startStr.split(':').map(Number);
        const startTime = new Date(shiftDate);
        startTime.setHours(startH, startM, 0, 0);

        if (now <= startTime) {
            greetingMsg = shift === 'morning' 
                ? 'Chấm đúng giờ! Chúc bạn một ngày làm việc tuyệt vời!' 
                : 'Chấm đúng giờ! Chúc bạn làm việc hiệu quả!';
        } else {
            lateMinutes = Math.floor((now.getTime() - startTime.getTime()) / 60000);
            greetingMsg = `Chấm vào thành công. Bạn đi muộn ${lateMinutes} phút.`;
        }
    } else if (type === 'out') {
        let endStr = shift === 'morning' ? config.morningEnd : (shift === 'afternoon' ? config.afternoonEnd : '22:00');
        
        if (customEnd) {
            endStr = customEnd;
        } else if (shift === 'afternoon' && !isNuoiConNho && !customEnd) {
            // Force normal employees to checkout at 17:00 or later
            const [cfgH, cfgM] = endStr.split(':').map(Number);
            if (cfgH < 17 || (cfgH === 17 && cfgM < 0)) {
                endStr = '17:00';
            }
        }

        const [endH, endM] = endStr.split(':').map(Number);
        const endTime = new Date(now); // use current day for end time unless we span over midnight
        
        if (customStart && customEnd) {
            const [sH] = customStart.split(':').map(Number);
            // If overnight, and we are in the morning hours, we set the date properly
            if (sH > endH && hour < endH + 4) {
               // already on the correct day for end time
            } else if (sH > endH && hour >= sH - 2) {
               // if they checkout early the same day they started the night shift
               endTime.setDate(endTime.getDate() + 1);
            }
        }
        
        endTime.setHours(endH, endM, 0, 0);

        if (isNuoiConNho) {
            endTime.setMinutes(endTime.getMinutes() - earlyLeaveMinutes);
        }

        if (now < endTime) {
            const ca = shift === 'morning' ? 'sáng' : (shift === 'afternoon' ? 'chiều' : 'ca');
            return res.status(400).json({ 
                error: `Chưa đến giờ tan ca ${ca}! Bạn được phép chấm ra từ ${format(endTime, 'HH:mm')}.`,
                status: 'early_out'
            });
        }
        greetingMsg = 'Đã ra ca thành công.';
    }

    // Insert into attendance
    const result = await client.query(
      `INSERT INTO attendance 
        (user_id, user_name, department, timestamp, date_str, status, type, location, device_info, reason, shift, late_minutes, early_leave_minutes) 
       VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
       RETURNING id`,
      [userId, userName, department, serverTimestamp, dateStr, 'success', type, location, deviceInfo, reason || '', shift, lateMinutes, earlyLeaveMinutes]
    );
    
    res.json({ id: result.rows[0].id.toString(), message: greetingMsg, distance });
  } catch (err: any) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    res.status(500).json({ error: err.message });
  }
});"""

match = re.search(r'app\.post\("/api/attendance", async \(req, res\) => \{.*?\n  \}\n\}\);', content, flags=re.DOTALL)
if match:
    content = content.replace(match.group(0), new_api)
    with open('server.ts', 'w') as f:
        f.write(content)
    print("API patched successfully.")
else:
    print("Could not find the API pattern.")

