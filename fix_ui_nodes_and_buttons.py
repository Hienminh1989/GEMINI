import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

# 1. Update Buttons (Remove animate-heartbeat-glow from the first button)
old_btns = """            <button 
              onClick={() => handleCheckIn('in')} 
              disabled={lastActionToday === 'in'}
              className={`flex-1 h-[52px] px-2 sm:px-4 rounded-full font-bold transition-all transform flex items-center justify-center relative overflow-hidden group ${
                lastActionToday === 'in' 
                  ? 'bg-green-50 text-green-300 border-2 border-green-100 cursor-not-allowed scale-95 shadow-none' 
                  : 'bg-white text-green-600 border-[3px] border-green-500 hover:bg-green-50 active:scale-95 shadow-[0_8px_20px_rgba(34,197,94,0.3)] animate-heartbeat-glow'
              }`}
            >"""

new_btns = """            <button 
              onClick={() => handleCheckIn('in')} 
              disabled={lastActionToday === 'in'}
              className={`flex-1 h-[52px] px-2 sm:px-4 rounded-full font-bold transition-all transform flex items-center justify-center relative overflow-hidden group ${
                lastActionToday === 'in' 
                  ? 'bg-green-50 text-green-300 border-2 border-green-100 cursor-not-allowed scale-95 shadow-none' 
                  : 'bg-white text-green-600 border-[3px] border-green-500 hover:bg-green-50 active:scale-95 shadow-[0_8px_20px_rgba(34,197,94,0.3)]'
              }`}
            >"""
content = content.replace(old_btns, new_btns)

# 2. Update Nodes
# The ping element needs to be larger than the node to be visible, so use -inset-1 or -inset-2
old_nodes = """                          {/* Nodes (dynamic positioning) */}
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

new_nodes = """                          {/* Nodes (dynamic positioning) */}
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasMorningIn ? 'bg-red-500 border-red-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_mS}%` }}>
                            {hasMorningIn && <div className="absolute -inset-2 rounded-full bg-red-500 animate-ping opacity-75"></div>}
                          </div>
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasMorningOut ? 'bg-red-500 border-red-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_mE}%` }}>
                            {hasMorningOut && <div className="absolute -inset-2 rounded-full bg-red-500 animate-ping opacity-75"></div>}
                          </div>
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasAfternoonIn ? 'bg-red-500 border-red-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_aS}%` }}>
                            {hasAfternoonIn && <div className="absolute -inset-2 rounded-full bg-red-500 animate-ping opacity-75"></div>}
                          </div>
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasAfternoonOut ? 'bg-red-500 border-red-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_aE}%` }}>
                            {hasAfternoonOut && <div className="absolute -inset-2 rounded-full bg-red-500 animate-ping opacity-75"></div>}
                          </div>"""

content = content.replace(old_nodes, new_nodes)

with open('src/pages/CheckIn.tsx', 'w') as f:
    f.write(content)
print("Updated UI nodes and buttons")
