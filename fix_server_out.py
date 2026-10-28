import re

with open('server.ts', 'r') as f:
    content = f.read()

old_logic = """        if (now < effectiveCheckoutDatetime) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                error: `Chưa đến giờ tan ca! Bạn được phép chấm ra từ ${format(effectiveCheckoutDatetime, 'HH:mm')}.`,
                status: 'early_out'
            });
        }
        greetingMsg = 'Đã ra ca thành công! Chúc bạn những phút giây nghỉ ngơi vui vẻ bên gia đình!';"""

new_logic = """        if (now < effectiveCheckoutDatetime) {
            earlyLeaveMinutes = differenceInMinutes(effectiveCheckoutDatetime, now);
            greetingMsg = 'Đã ra ca sớm thành công! Thông tin ra về sớm đã được ghi nhận.';
        } else {
            greetingMsg = 'Đã ra ca thành công! Chúc bạn những phút giây nghỉ ngơi vui vẻ bên gia đình!';
        }"""

if old_logic in content:
    content = content.replace(old_logic, new_logic)
    with open('server.ts', 'w') as f:
        f.write(content)
    print("Replaced logic successfully")
else:
    print("Logic not found!")
