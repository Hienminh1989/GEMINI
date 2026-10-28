import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

# Make sure to import PartyPopper, Heart, Sun, Coffee if they aren't already
if 'PartyPopper' not in content:
    content = content.replace("import { MapPin, CheckCircle, XCircle, ChevronLeft, Map, Clock, History, Camera, RotateCcw } from 'lucide-react';", 
                              "import { MapPin, CheckCircle, XCircle, ChevronLeft, Map, Clock, History, Camera, RotateCcw, PartyPopper, Heart, Sun, Coffee } from 'lucide-react';")

old_ui = """                {status === 'success' && (
                  <div className="flex-1 flex flex-col items-center justify-center w-full mt-2 py-6">
                    <div className="w-20 h-20 bg-green-100 text-blue-600 rounded-full flex items-center justify-center mb-4 shadow-sm ring-4 ring-green-50">
                      <CheckCircle className="w-10 h-10" />
                    </div>
                    <h2 className="text-xl font-bold text-blue-600 text-center mb-3">ĐIỂM DANH THÀNH CÔNG!</h2>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 mx-4 mb-4 shadow-sm w-full max-w-sm text-center">
                      <p className="text-sm text-green-800 font-bold leading-relaxed">{message.replace('Điểm danh Thành công! ', '')}</p>
                    </div>"""

new_ui = """                {status === 'success' && (
                  <div className="flex-1 flex flex-col items-center justify-center w-full mt-2 py-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="w-24 h-24 bg-gradient-to-tr from-green-400 to-emerald-500 text-white rounded-full flex items-center justify-center mb-6 shadow-xl shadow-green-200/50 ring-8 ring-green-50 transform hover:scale-105 transition-all">
                      <PartyPopper className="w-12 h-12 animate-bounce" />
                    </div>
                    <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-green-500 text-center mb-4 tracking-tight">
                      {message.includes('ra ca') ? 'ĐÃ RA CA THÀNH CÔNG!' : 'CHẤM VÀO THÀNH CÔNG!'}
                    </h2>
                    <div className="relative bg-gradient-to-br from-green-50 to-emerald-50/50 border border-green-200/60 rounded-2xl p-6 mx-4 mb-4 shadow-sm w-full max-w-sm text-center overflow-hidden">
                      <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-green-200/40 rounded-full blur-2xl"></div>
                      <div className="absolute bottom-0 left-0 -ml-6 -mb-6 w-24 h-24 bg-emerald-200/40 rounded-full blur-2xl"></div>
                      
                      <div className="relative z-10">
                        {message.includes('đi muộn') && (
                           <div className="inline-block px-3 py-1 mb-3 bg-orange-100 text-orange-700 rounded-full text-xs font-bold border border-orange-200 shadow-sm">
                             ⚠️ Ghi nhận đi muộn
                           </div>
                        )}
                        <p className="text-base text-emerald-900 font-bold leading-relaxed mb-4">
                          {message}
                        </p>
                        <div className="flex justify-center gap-4 text-emerald-500">
                          {message.includes('ra ca') ? (
                            <>
                              <Heart className="w-6 h-6 animate-pulse text-rose-400 drop-shadow-sm" />
                            </>
                          ) : (
                            <>
                              <Sun className="w-6 h-6 animate-[spin_4s_linear_infinite] drop-shadow-sm text-amber-400" />
                              <Coffee className="w-6 h-6 drop-shadow-sm text-amber-600" />
                            </>
                          )}
                        </div>
                      </div>
                    </div>"""

if old_ui in content:
    content = content.replace(old_ui, new_ui)
    with open('src/pages/CheckIn.tsx', 'w') as f:
        f.write(content)
    print("UI successfully replaced.")
else:
    print("Could not find exact old_ui match. Finding closely...")
    # Find start and end exactly
    start_idx = content.find("{status === 'success' && (")
    end_idx = content.find("{locationDetails && (")
    
    if start_idx != -1 and end_idx != -1:
        part_to_replace = content[start_idx:end_idx]
        # Append some necessary div closings that were before locationDetails
        new_ui_full = new_ui + """\n                    \n                    """
        content = content.replace(part_to_replace, new_ui_full)
        with open('src/pages/CheckIn.tsx', 'w') as f:
            f.write(content)
        print("UI fuzzy matched and replaced.")
    else:
        print("Still failed to replace!")
