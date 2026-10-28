import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

# 1. Update status type
content = content.replace(
    "const [status, setStatus] = useState<'idle' | 'checking' | 'success' | 'failed' | 'early_out'>('idle');",
    "const [status, setStatus] = useState<'idle' | 'checking' | 'success' | 'failed' | 'early_out' | 'warning'>('idle');"
)

# Add AlertTriangle to imports
content = content.replace("from 'lucide-react';", ", AlertTriangle } from 'lucide-react';")

# 2. Update handleCheckIn spam check
spam_check_old = """    if (now - lastClickTimeRef.current < 3000) {
      setStatus('failed');"""
spam_check_new = """    if (now - lastClickTimeRef.current < 3000) {
      setStatus('warning');"""
content = content.replace(spam_check_old, spam_check_new)

# 3. Add UI for 'warning'
failed_ui = """                {status === 'failed' && (
                  <div className="flex-1 flex flex-col items-center justify-center w-full mt-2 py-6">
                    <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4 shadow-sm ring-4 ring-red-50">
                      <XCircle className="w-10 h-10" />
                    </div>
                    <h2 className="text-xl font-bold text-red-600 text-center mb-3">ĐIỂM DANH LỖI</h2>
                    <p className="text-sm text-slate-500 font-medium text-center">
                      {message}
                    </p>"""
warning_ui = """                {status === 'warning' && (
                  <div className="flex-1 flex flex-col items-center justify-center w-full mt-2 py-6">
                    <div className="w-20 h-20 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mb-4 shadow-sm ring-4 ring-amber-50">
                      <AlertTriangle className="w-10 h-10" />
                    </div>
                    <h2 className="text-xl font-bold text-amber-600 text-center mb-3">THAO TÁC QUÁ NHANH</h2>
                    <p className="text-sm text-slate-500 font-medium text-center">
                      {message}
                    </p>
                    <button 
                      onClick={() => setStatus('idle')}
                      className="mt-6 px-8 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-colors shadow-lg"
                    >
                      Đã hiểu
                    </button>
                  </div>
                )}
                {status === 'failed' && (
                  <div className="flex-1 flex flex-col items-center justify-center w-full mt-2 py-6">
                    <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4 shadow-sm ring-4 ring-red-50">
                      <XCircle className="w-10 h-10" />
                    </div>
                    <h2 className="text-xl font-bold text-red-600 text-center mb-3">ĐIỂM DANH LỖI</h2>
                    <p className="text-sm text-slate-500 font-medium text-center">
                      {message}
                    </p>"""
content = content.replace(failed_ui, warning_ui)

# 4. Update floating action buttons text
content = content.replace("<span>ĐIỂM DANH VÀO</span>", "<span>GHI NHẬN CÓ MẶT</span>")
content = content.replace("<span>ĐIỂM DANH RA</span>", "<span>GHI NHẬN RA VỀ</span>")

# 5. Update progress bar glow and labels
# Find the Continuous progress bar section
old_progress = """{/* Continuous progress bar */}
                          <div className="absolute left-0 h-full rounded-full bg-blue-500 overflow-hidden transition-all duration-1000" style={{ width: `${currentProgress}%`, zIndex: 0 }}></div>
                          
                          {/* Optional: mark actual working time with green instead of blue? Or let's just make it all blue/green. Let's use a dynamic color based on status */}
                          <div className={`absolute left-0 h-full rounded-full transition-all duration-1000 ${hasMorningIn && !hasAfternoonOut ? 'bg-green-500' : 'bg-blue-400'}`} style={{ width: `${currentProgress}%`, zIndex: 1, opacity: 0.8 }}></div>"""

new_progress = """{/* Continuous progress bar */}
                          <div className="absolute left-0 h-full rounded-full bg-blue-500 overflow-hidden transition-all duration-1000 shadow-[0_0_8px_rgba(59,130,246,0.6)] animate-pulse" style={{ width: `${currentProgress}%`, zIndex: 0 }}></div>
                          
                          {/* Main animated active bar */}
                          <div className={`absolute left-0 h-full rounded-full transition-all duration-1000 shadow-[0_0_12px_rgba(34,197,94,0.6)] animate-pulse ${hasMorningIn && !hasAfternoonOut ? 'bg-green-400' : 'bg-blue-400'}`} style={{ width: `${currentProgress}%`, zIndex: 1, opacity: 0.9 }}></div>"""
content = content.replace(old_progress, new_progress)

# Labels
old_m_in = """<div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${hasMorningIn ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{displayMorningIn}</div>"""
new_m_in = """<div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap shadow-sm ${hasMorningIn ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{hasMorningIn ? `Lúc ${displayMorningIn}` : displayMorningIn}</div>"""
content = content.replace(old_m_in, new_m_in)

old_m_out = """<div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${hasMorningOut ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{displayMorningOut}</div>"""
new_m_out = """<div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap shadow-sm ${hasMorningOut ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{hasMorningOut ? `Lúc ${displayMorningOut}` : displayMorningOut}</div>"""
content = content.replace(old_m_out, new_m_out)

old_a_in = """<div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${hasAfternoonIn ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{displayAfternoonIn}</div>"""
new_a_in = """<div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap shadow-sm ${hasAfternoonIn ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{hasAfternoonIn ? `Lúc ${displayAfternoonIn}` : displayAfternoonIn}</div>"""
content = content.replace(old_a_in, new_a_in)

old_a_out = """<div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${hasAfternoonOut ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{displayAfternoonOut}</div>"""
new_a_out = """<div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap shadow-sm ${hasAfternoonOut ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{hasAfternoonOut ? `Lúc ${displayAfternoonOut}` : displayAfternoonOut}</div>"""
content = content.replace(old_a_out, new_a_out)

with open('src/pages/CheckIn.tsx', 'w') as f:
    f.write(content)
print("Updated perfectly")
