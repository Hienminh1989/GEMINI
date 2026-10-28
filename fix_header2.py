import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

# Replace header background & padding
old_bg = 'className="bg-[#1e40af] text-white rounded-b-[32px] pt-5 pb-20 px-5 relative shrink-0 shadow-md z-30"'
new_bg = 'className="bg-[#1e40af] text-white rounded-b-[24px] pt-5 pb-5 px-4 sm:px-5 relative shrink-0 shadow-md z-30"'
content = content.replace(old_bg, new_bg)

# Replace logo size, gap, and text styles
old_content = """        <div className="flex justify-between items-center relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center p-1 shrink-0 overflow-hidden shadow-sm">
              <img src={appConfig?.logoBase64 || "/logo.jpg"} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="font-extrabold text-[15px] leading-tight tracking-wide">HỆ THỐNG ĐIỂM DANH</h1>
              <p className="text-xs font-medium text-blue-100 uppercase tracking-wider">Bệnh viện Đa khoa Thiệu Hóa</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">"""

new_content = """        <div className="flex justify-between items-center relative z-10 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-[52px] h-[52px] sm:w-[56px] sm:h-[56px] bg-white rounded-full flex items-center justify-center p-1 shrink-0 overflow-hidden shadow-sm">
              <img src={appConfig?.logoBase64 || "/logo.jpg"} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="font-extrabold text-[16px] sm:text-[18px] leading-tight tracking-normal whitespace-nowrap truncate">HỆ THỐNG ĐIỂM DANH</h1>
              <p className="text-[12.5px] sm:text-[14px] font-medium text-blue-100 uppercase tracking-wide whitespace-nowrap truncate mt-0.5">Bệnh viện Đa khoa Thiệu Hóa</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">"""
content = content.replace(old_content, new_content)

# Replace the overlap container margin
old_container = '<div className="px-4 -mt-12 relative z-20 flex-1 flex flex-col gap-4">'
new_container = '<div className="px-4 mt-4 relative z-20 flex-1 flex flex-col gap-4">'
content = content.replace(old_container, new_container)

with open('src/pages/CheckIn.tsx', 'w') as f:
    f.write(content)
print("Updated header perfectly")
