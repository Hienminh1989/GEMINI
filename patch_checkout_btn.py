import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

old_btn = """            <button 
              onClick={() => setShowConfirmOut(true)} 
              disabled={lastActionToday !== 'in'}
              className={`flex-1 h-[52px] px-2 sm:px-4 rounded-full font-bold transition-all transform flex items-center justify-center relative overflow-hidden group ${
                lastActionToday !== 'in' 
                  ? 'bg-orange-50 text-orange-300 border-2 border-orange-100 cursor-not-allowed scale-95 shadow-none' 
                  : 'bg-white text-orange-500 border-[3px] border-orange-500 hover:bg-orange-50 active:scale-95 shadow-[0_8px_20px_rgba(249,115,22,0.3)]'
              }`}
            >"""
new_btn = """            <button 
              onClick={() => setShowConfirmOut(true)} 
              className={`flex-1 h-[52px] px-2 sm:px-4 rounded-full font-bold transition-all transform flex items-center justify-center relative overflow-hidden group bg-white text-orange-500 border-[3px] border-orange-500 hover:bg-orange-50 active:scale-95 shadow-[0_8px_20px_rgba(249,115,22,0.3)]`}
            >"""
content = content.replace(old_btn, new_btn)

with open('src/pages/CheckIn.tsx', 'w') as f:
    f.write(content)
print("Checkout button updated")
