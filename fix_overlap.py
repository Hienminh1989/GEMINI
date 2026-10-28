import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

old_header_bg = 'className="bg-[#1e40af] text-white rounded-b-[24px] pt-5 pb-5 px-4 sm:px-5 relative shrink-0 shadow-md z-30"'
new_header_bg = 'className="bg-[#1e40af] text-white rounded-b-[28px] pt-5 pb-10 px-4 sm:px-5 relative shrink-0 z-10"'
content = content.replace(old_header_bg, new_header_bg)

old_container = '<div className="px-4 mt-4 relative z-20 flex-1 flex flex-col gap-4">'
new_container = '<div className="px-4 -mt-6 relative z-30 flex-1 flex flex-col gap-3">'
content = content.replace(old_container, new_container)

with open('src/pages/CheckIn.tsx', 'w') as f:
    f.write(content)
print("Updated header to z-10 and container to z-30 to fix overlap")
