import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

old_btns = """            <button 
              onClick={() => handleCheckIn('in')} 
              disabled={lastActionToday === 'in'}
              className={`flex-1 py-3.5 px-2 sm:px-4 rounded-full font-bold transition-all transform flex flex-col items-center justify-center gap-0.5 relative overflow-hidden group ${
                lastActionToday === 'in' 
                  ? 'bg-green-50 text-green-300 border-2 border-green-100 cursor-not-allowed scale-95 shadow-none' 
                  : 'bg-white text-green-600 border-[3px] border-green-500 hover:bg-green-50 active:scale-95 shadow-[0_8px_20px_rgba(34,197,94,0.3)] animate-heartbeat-glow'
              }`}
            >
              <div className="flex items-center justify-center relative z-10 w-full">
                <span className="text-[13px] sm:text-[15px] whitespace-nowrap tracking-wide">GHI NHẬN CÓ MẶT</span>
              </div>
              <span className={`text-[9px] sm:text-[10px] uppercase font-bold tracking-wider relative z-10 whitespace-nowrap ${lastActionToday === 'in' ? 'opacity-50' : 'text-green-500'}`}>Bắt đầu ca làm</span>
            </button>
            
            <button 
              onClick={() => handleCheckIn('out')} 
              disabled={lastActionToday !== 'in'}
              className={`flex-1 py-3.5 px-2 sm:px-4 rounded-full font-bold transition-all transform flex flex-col items-center justify-center gap-0.5 relative overflow-hidden group ${
                lastActionToday !== 'in' 
                  ? 'bg-orange-50 text-orange-300 border-2 border-orange-100 cursor-not-allowed scale-95 shadow-none' 
                  : 'bg-white text-orange-500 border-[3px] border-orange-500 hover:bg-orange-50 active:scale-95 shadow-[0_8px_20px_rgba(249,115,22,0.3)]'
              }`}
            >
              <div className="flex items-center justify-center relative z-10 w-full">
                <span className="text-[13px] sm:text-[15px] whitespace-nowrap tracking-wide">GHI NHẬN RA VỀ</span>
              </div>
              <span className={`text-[9px] sm:text-[10px] uppercase font-bold tracking-wider relative z-10 whitespace-nowrap ${lastActionToday !== 'in' ? 'opacity-50' : 'text-orange-400'}`}>Kết thúc ca làm</span>
            </button>"""

new_btns = """            <button 
              onClick={() => handleCheckIn('in')} 
              disabled={lastActionToday === 'in'}
              className={`flex-1 h-[52px] px-2 sm:px-4 rounded-full font-bold transition-all transform flex items-center justify-center relative overflow-hidden group ${
                lastActionToday === 'in' 
                  ? 'bg-green-50 text-green-300 border-2 border-green-100 cursor-not-allowed scale-95 shadow-none' 
                  : 'bg-white text-green-600 border-[3px] border-green-500 hover:bg-green-50 active:scale-95 shadow-[0_8px_20px_rgba(34,197,94,0.3)] animate-heartbeat-glow'
              }`}
            >
              <span className="text-[13px] sm:text-[15px] whitespace-nowrap tracking-wide relative z-10">GHI NHẬN CÓ MẶT</span>
            </button>
            
            <button 
              onClick={() => handleCheckIn('out')} 
              disabled={lastActionToday !== 'in'}
              className={`flex-1 h-[52px] px-2 sm:px-4 rounded-full font-bold transition-all transform flex items-center justify-center relative overflow-hidden group ${
                lastActionToday !== 'in' 
                  ? 'bg-orange-50 text-orange-300 border-2 border-orange-100 cursor-not-allowed scale-95 shadow-none' 
                  : 'bg-white text-orange-500 border-[3px] border-orange-500 hover:bg-orange-50 active:scale-95 shadow-[0_8px_20px_rgba(249,115,22,0.3)]'
              }`}
            >
              <span className="text-[13px] sm:text-[15px] whitespace-nowrap tracking-wide relative z-10">GHI NHẬN RA VỀ</span>
            </button>"""

content = content.replace(old_btns, new_btns)

with open('src/pages/CheckIn.tsx', 'w') as f:
    f.write(content)
print("Updated Buttons to 1 line successfully")
