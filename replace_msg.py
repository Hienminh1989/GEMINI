import re

with open('server.ts', 'r') as f:
    content = f.read()

old_1 = "greetingMsg = `Chấm vào thành công. Bạn đi muộn ${lateMinutes} phút.`;"
new_1 = "greetingMsg = `Chấm vào thành công. Bạn đi muộn ${lateMinutes} phút. Chúc bạn một ngày làm việc vui vẻ và hiệu quả!`;"

old_2 = "greetingMsg = `Chấm đúng giờ! Chúc bạn làm việc hiệu quả!`;"
new_2 = "greetingMsg = `Chấm vào thành công! Chúc bạn một ngày làm việc vui vẻ và hiệu quả!`;"

old_3 = "greetingMsg = 'Đã ra ca thành công.';"
new_3 = "greetingMsg = 'Đã ra ca thành công! Chúc bạn những phút giây nghỉ ngơi vui vẻ bên gia đình!';"

content = content.replace(old_1, new_1)
content = content.replace(old_2, new_2)
content = content.replace(old_3, new_3)

with open('server.ts', 'w') as f:
    f.write(content)
print("Updated messages in server.ts")

