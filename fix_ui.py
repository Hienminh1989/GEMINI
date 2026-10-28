import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

# Update CheckIn Progress bar to use the heartbeat
old_progress = """{/* Continuous progress bar */}
                          <div className="absolute left-0 h-full rounded-full bg-blue-500 overflow-hidden transition-all duration-1000 shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse" style={{ width: `${currentProgress}%`, zIndex: 0 }}></div>
                          
                          {/* Main animated active bar */}
                          <div className={`absolute left-0 h-full rounded-full transition-all duration-1000 shadow-[0_0_12px_rgba(34,197,94,0.6)] animate-pulse ${hasMorningIn && !hasAfternoonOut ? 'bg-green-400' : 'bg-blue-400'}`} style={{ width: `${currentProgress}%`, zIndex: 1, opacity: 0.9 }}></div>"""

new_progress = """{/* Continuous progress bar */}
                          <div className="absolute left-0 h-full rounded-full bg-blue-500 overflow-hidden transition-all duration-1000 animate-heartbeat-blue" style={{ width: `${currentProgress}%`, zIndex: 0 }}></div>
                          
                          {/* Main animated active bar */}
                          <div className={`absolute left-0 h-full rounded-full transition-all duration-1000 ${hasMorningIn && !hasAfternoonOut ? 'bg-green-400 animate-heartbeat-glow' : 'bg-blue-400 animate-heartbeat-blue'}`} style={{ width: `${currentProgress}%`, zIndex: 1 }}></div>"""
content = content.replace(old_progress, new_progress)

# Replace the current time bubble icon with a Heart from Lucide (medical vibe)
old_bubble = """<div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                                {format(currentTime, 'HH:mm')}
                                <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-t-[4px] border-t-blue-600 border-r-[4px] border-r-transparent"></div>
                              </div>"""

new_bubble = """<div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap flex items-center gap-1">
                                <Heart className="w-2.5 h-2.5 fill-current animate-pulse text-red-200" /> {format(currentTime, 'HH:mm')}
                                <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-t-[4px] border-t-blue-600 border-r-[4px] border-r-transparent"></div>
                              </div>"""
content = content.replace(old_bubble, new_bubble)

# Change Activity icon next to "Tiến trình điểm danh" to a Heart pulse icon
old_activity = """<Activity className="w-4 h-4 text-slate-500" /> Tiến trình điểm danh"""
new_activity = """<Heart className="w-4 h-4 text-red-400 animate-pulse fill-red-100" /> Tiến trình điểm danh"""
content = content.replace(old_activity, new_activity)

# We also want to redesign the buttons to be prettier
# Find the buttons:
old_btns = """            <button 
              onClick={() => handleCheckIn('in')} 
              disabled={lastActionToday === 'in'}
              className={`flex-1 py-4 rounded-full font-bold text-lg transition-all shadow-[0_8px_20px_rgba(21,178,83,0.3)] transform flex flex-col items-center justify-center gap-1 ${
                lastActionToday === 'in' 
                  ? 'bg-green-600/40 text-white/70 cursor-not-allowed scale-95 shadow-none' 
                  : 'bg-gradient-to-b from-[#21c55e] to-[#15b253] text-white hover:from-[#15b253] hover:to-[#0f9142] active:scale-95 border border-[#15b253]'
              }`}
            >
              <div className="flex items-center gap-2">
                <LogIn className="w-6 h-6" /> <span>GHI NHẬN CÓ MẶT</span>
              </div>
              <span className="text-[11px] font-normal opacity-90 tracking-wide">Bắt đầu làm việc</span>
            </button>
            <button 
              onClick={() => handleCheckIn('out')} 
              disabled={lastActionToday !== 'in'}
              className={`flex-1 py-4 rounded-full font-bold text-lg transition-all shadow-[0_8px_20px_rgba(251,129,20,0.3)] transform flex flex-col items-center justify-center gap-1 ${
                lastActionToday !== 'in' 
                  ? 'bg-orange-500/40 text-white/70 cursor-not-allowed scale-95 shadow-none' 
                  : 'bg-gradient-to-b from-[#fca34d] to-[#fb8114] text-white hover:from-[#fb8114] hover:to-[#e86f05] active:scale-95 border border-[#fb8114]'
              }`}
            >
              <div className="flex items-center gap-2">
                <LogOut className="w-6 h-6" /> <span>GHI NHẬN RA VỀ</span>
              </div>
              <span className="text-[11px] font-normal opacity-90 tracking-wide">Kết thúc làm việc</span>
            </button>"""

new_btns = """            <button 
              onClick={() => handleCheckIn('in')} 
              disabled={lastActionToday === 'in'}
              className={`flex-1 py-3.5 rounded-full font-bold text-lg transition-all transform flex flex-col items-center justify-center gap-0.5 relative overflow-hidden group ${
                lastActionToday === 'in' 
                  ? 'bg-green-50 text-green-300 border-2 border-green-100 cursor-not-allowed scale-95 shadow-none' 
                  : 'bg-white text-green-600 border-[3px] border-green-500 hover:bg-green-50 active:scale-95 shadow-[0_8px_20px_rgba(34,197,94,0.3)] animate-heartbeat-glow'
              }`}
            >
              <div className="flex items-center gap-2 relative z-10">
                <LogIn className="w-5 h-5" /> <span className="tracking-wide">GHI NHẬN CÓ MẶT</span>
              </div>
              <span className={`text-[10px] uppercase font-bold tracking-wider relative z-10 ${lastActionToday === 'in' ? 'opacity-50' : 'text-green-500'}`}>Bắt đầu ca làm</span>
            </button>
            
            <button 
              onClick={() => handleCheckIn('out')} 
              disabled={lastActionToday !== 'in'}
              className={`flex-1 py-3.5 rounded-full font-bold text-lg transition-all transform flex flex-col items-center justify-center gap-0.5 relative overflow-hidden group ${
                lastActionToday !== 'in' 
                  ? 'bg-orange-50 text-orange-300 border-2 border-orange-100 cursor-not-allowed scale-95 shadow-none' 
                  : 'bg-white text-orange-500 border-[3px] border-orange-500 hover:bg-orange-50 active:scale-95 shadow-[0_8px_20px_rgba(249,115,22,0.3)]'
              }`}
            >
              <div className="flex items-center gap-2 relative z-10">
                <LogOut className="w-5 h-5" /> <span className="tracking-wide">GHI NHẬN RA VỀ</span>
              </div>
              <span className={`text-[10px] uppercase font-bold tracking-wider relative z-10 ${lastActionToday !== 'in' ? 'opacity-50' : 'text-orange-400'}`}>Kết thúc ca làm</span>
            </button>"""

content = content.replace(old_btns, new_btns)

with open('src/pages/CheckIn.tsx', 'w') as f:
    f.write(content)
print("Updated CSS and JS successfully")
