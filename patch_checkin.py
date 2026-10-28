import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

# Add state
if 'const [showConfirmOut, setShowConfirmOut] = useState(false);' not in content:
    content = content.replace('const [showNotifications, setShowNotifications] = useState(false);', 
                              'const [showNotifications, setShowNotifications] = useState(false);\n  const [showConfirmOut, setShowConfirmOut] = useState(false);')

# Change button onClick
old_btn = """            <button 
              onClick={() => handleCheckIn('out')} 
              disabled={lastActionToday !== 'in'}
              className={`flex-1 h-[52px] px-2 sm:px-4 rounded-full font-bold transition-all transform flex items-center justify-center relative overflow-hidden group ${
                lastActionToday !== 'in' 
                  ? 'bg-orange-50 text-orange-300 border-2 border-orange-100 cursor-not-allowed scale-95 shadow-none' 
                  : 'bg-white text-orange-500 border-[3px] border-orange-500 hover:bg-orange-50 active:scale-95 shadow-[0_8px_20px_rgba(249,115,22,0.3)]'
              }`}
            >"""
new_btn = """            <button 
              onClick={() => setShowConfirmOut(true)} 
              disabled={lastActionToday !== 'in'}
              className={`flex-1 h-[52px] px-2 sm:px-4 rounded-full font-bold transition-all transform flex items-center justify-center relative overflow-hidden group ${
                lastActionToday !== 'in' 
                  ? 'bg-orange-50 text-orange-300 border-2 border-orange-100 cursor-not-allowed scale-95 shadow-none' 
                  : 'bg-white text-orange-500 border-[3px] border-orange-500 hover:bg-orange-50 active:scale-95 shadow-[0_8px_20px_rgba(249,115,22,0.3)]'
              }`}
            >"""
content = content.replace(old_btn, new_btn)

# Add confirm modal
modal_html = """      {showConfirmOut && (
        <div className="fixed inset-0 bg-slate-900/60 z-[120] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="bg-orange-50 p-6 flex flex-col items-center border-b border-orange-100">
              <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mb-4 shadow-sm">
                <LogOut className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-xl text-slate-800 text-center">Xác nhận chấm ra</h3>
              <p className="text-slate-600 text-center text-sm mt-2 font-medium">Bạn có chắc chắn muốn ghi nhận ra về vào lúc này?</p>
            </div>
            <div className="p-4 flex gap-3 bg-slate-50">
              <button 
                onClick={() => setShowConfirmOut(false)}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold bg-white hover:bg-slate-50 transition-colors shadow-sm"
              >
                HỦY
              </button>
              <button 
                onClick={() => {
                  setShowConfirmOut(false);
                  handleCheckIn('out');
                }}
                className="flex-1 py-3 px-4 rounded-xl text-white font-bold bg-orange-500 hover:bg-orange-600 transition-colors shadow-md"
              >
                CHẮC CHẮN
              </button>
            </div>
          </div>
        </div>
      )}
"""

if '{showConfirmOut && (' not in content:
    content = content.replace('      {showNotifications && (', modal_html + '      {showNotifications && (')

# need to import LogOut if not imported
if 'LogOut' not in content:
    content = content.replace('import { MapPin,', 'import { MapPin, LogOut,')

with open('src/pages/CheckIn.tsx', 'w') as f:
    f.write(content)
print("CheckIn.tsx updated")
