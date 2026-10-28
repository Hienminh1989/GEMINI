import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

# 1. Update Buttons
old_btns = """            <button 
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

new_btns = """            <button 
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

content = content.replace(old_btns, new_btns)

# 2. Update Nodes
old_nodes = """                          {/* Nodes (dynamic positioning) */}
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasMorningIn ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_mS}%` }}></div>
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasMorningOut ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_mE}%` }}></div>
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasAfternoonIn ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_aS}%` }}></div>
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasAfternoonOut ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_aE}%` }}></div>"""

new_nodes = """                          {/* Nodes (dynamic positioning) */}
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasMorningIn ? 'bg-red-50 border-red-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_mS}%` }}>
                            {hasMorningIn && <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75"></div>}
                            {hasMorningIn && <div className="absolute inset-0 rounded-full bg-red-500"></div>}
                          </div>
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasMorningOut ? 'bg-red-50 border-red-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_mE}%` }}>
                            {hasMorningOut && <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75"></div>}
                            {hasMorningOut && <div className="absolute inset-0 rounded-full bg-red-500"></div>}
                          </div>
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasAfternoonIn ? 'bg-red-50 border-red-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_aS}%` }}>
                            {hasAfternoonIn && <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75"></div>}
                            {hasAfternoonIn && <div className="absolute inset-0 rounded-full bg-red-500"></div>}
                          </div>
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasAfternoonOut ? 'bg-red-50 border-red-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_aE}%` }}>
                            {hasAfternoonOut && <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75"></div>}
                            {hasAfternoonOut && <div className="absolute inset-0 rounded-full bg-red-500"></div>}
                          </div>"""

content = content.replace(old_nodes, new_nodes)

with open('src/pages/CheckIn.tsx', 'w') as f:
    f.write(content)
print("Updated Nodes and Buttons successfully")
