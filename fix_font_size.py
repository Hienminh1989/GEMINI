import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

old_text = '<p className="text-[12.5px] sm:text-[14px] font-medium text-blue-100 uppercase tracking-wide whitespace-nowrap truncate mt-0.5">Bệnh viện Đa khoa Thiệu Hóa</p>'
new_text = '<p className="text-[11.5px] sm:text-[13px] font-medium text-blue-100 uppercase tracking-wider whitespace-nowrap truncate mt-0.5">Bệnh viện Đa khoa Thiệu Hóa</p>'
content = content.replace(old_text, new_text)

with open('src/pages/CheckIn.tsx', 'w') as f:
    f.write(content)
print("Updated font size")
