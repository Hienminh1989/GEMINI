import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

old_header_bg = 'className="bg-[#1e40af] text-white rounded-b-[40px] pt-6 pb-24 px-6 relative shrink-0 shadow-md z-30"'
new_header_bg = 'className="bg-[#1e40af] text-white rounded-b-[32px] pt-5 pb-20 px-5 relative shrink-0 shadow-md z-30"'

content = content.replace(old_header_bg, new_header_bg)

old_container = '<div className="px-4 -mt-16 relative z-20 flex-1 flex flex-col gap-4">'
new_container = '<div className="px-4 -mt-12 relative z-20 flex-1 flex flex-col gap-4">'
content = content.replace(old_container, new_container)

with open('src/pages/CheckIn.tsx', 'w') as f:
    f.write(content)
print("Updated header spacing")
