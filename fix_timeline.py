import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

# Replace the CALCULATE SHIFT PROGRESS section
old_calc = """  // CALCULATE SHIFT PROGRESS
  const currentMins = currentTime.getHours() * 60 + currentTime.getMinutes();
  const parseTime = (timeStr: string) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h * 60) + (m || 0);
  };
  const mS = parseTime(morningStartStr);
  const mE = parseTime(morningEndStr);
  const aS = parseTime(afternoonStartStr);
  const aE = parseTime(afternoonEndStr);

  let seg1Progress = 0;
  if (currentMins >= mE) seg1Progress = 100;
  else if (currentMins > mS) seg1Progress = ((currentMins - mS) / (mE - mS)) * 100;

  let seg2Progress = 0;
  if (currentMins >= aS) seg2Progress = 100;
  else if (currentMins > mE) seg2Progress = ((currentMins - mE) / (aS - mE)) * 100;

  let seg3Progress = 0;
  if (currentMins >= aE) seg3Progress = 100;
  else if (currentMins > aS) seg3Progress = ((currentMins - aS) / (aE - aS)) * 100;"""

new_calc = """  // CALCULATE SHIFT PROGRESS (CONTINUOUS TIMELINE)
  const currentMins = currentTime.getHours() * 60 + currentTime.getMinutes();
  const parseTime = (timeStr: string) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h * 60) + (m || 0);
  };
  const mS = parseTime(morningStartStr);
  const mE = parseTime(morningEndStr);
  const aS = parseTime(afternoonStartStr);
  const aE = parseTime(afternoonEndStr);

  const totalShiftMins = Math.max(1, aE - mS); // Prevent div by 0
  
  // Percentages for nodes (0 to 100)
  const p_mS = 0;
  const p_mE = Math.max(0, Math.min(100, ((mE - mS) / totalShiftMins) * 100));
  const p_aS = Math.max(0, Math.min(100, ((aS - mS) / totalShiftMins) * 100));
  const p_aE = 100;

  // Current progress on the single bar
  let currentProgress = 0;
  if (currentMins >= aE) currentProgress = 100;
  else if (currentMins > mS) currentProgress = ((currentMins - mS) / totalShiftMins) * 100;
"""

content = content.replace(old_calc, new_calc)

old_ui = """                      <div className="relative pt-2 pb-16 px-4">
                        <div className="h-1.5 bg-slate-100 rounded-full w-full relative flex justify-between items-center">
                          {/* Segment lines updating by time */}
                          <div className="absolute left-0 h-full rounded-l-full overflow-hidden" style={{ width: '33.33%', zIndex: 0 }}>
                            <div className={`h-full ${hasMorningIn ? 'bg-green-500' : 'bg-blue-300'} transition-all duration-1000 ${!hasMorningOut && hasMorningIn ? 'opacity-80 animate-pulse' : ''}`} style={{ width: hasMorningOut ? '100%' : `${seg1Progress}%` }}></div>
                          </div>
                          <div className="absolute left-[33.33%] h-full bg-slate-200 overflow-hidden" style={{ width: '33.33%', zIndex: 0, opacity: 0.5 }}>
                            <div className="h-full bg-slate-400 transition-all duration-1000" style={{ width: `${seg2Progress}%` }}></div>
                          </div>
                          <div className="absolute left-[66.66%] h-full rounded-r-full overflow-hidden" style={{ width: '33.33%', zIndex: 0 }}>
                            <div className={`h-full ${hasAfternoonIn ? 'bg-green-500' : 'bg-blue-300'} transition-all duration-1000 ${!hasAfternoonOut && hasAfternoonIn ? 'opacity-80 animate-pulse' : ''}`} style={{ width: hasAfternoonOut ? '100%' : `${seg3Progress}%` }}></div>
                          </div>
                          
                          {/* Nodes */}
                          <div className={`relative z-10 w-4 h-4 rounded-full border-[3px] shadow-sm ${hasMorningIn ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`}></div>
                          <div className={`relative z-10 w-4 h-4 rounded-full border-[3px] shadow-sm ${hasMorningOut ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`}></div>
                          <div className={`relative z-10 w-4 h-4 rounded-full border-[3px] shadow-sm ${hasAfternoonIn ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`}></div>
                          <div className={`relative z-10 w-4 h-4 rounded-full border-[3px] shadow-sm ${hasAfternoonOut ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`}></div>
                        </div>
                        <div className="flex justify-between text-[11px] font-medium text-slate-500 mt-4 absolute w-full left-0 px-1">
                          <div className="flex flex-col items-center w-[60px]">
                            <span className="text-[9px] uppercase text-slate-400 mb-0.5">Vào sáng</span>
                            <span className="text-[11px] font-bold text-slate-800">{morningStartStr}</span>
                            <div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${hasMorningIn ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{displayMorningIn}</div>
                          </div>
                          <div className="flex flex-col items-center w-[60px]">
                            <span className="text-[9px] uppercase text-slate-400 mb-0.5">Ra sáng</span>
                            <span className="text-[11px] font-bold text-slate-800">{morningEndStr}</span>
                            <div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${hasMorningOut ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{displayMorningOut}</div>
                          </div>
                          <div className="flex flex-col items-center w-[60px]">
                            <span className="text-[9px] uppercase text-slate-400 mb-0.5">Vào chiều</span>
                            <span className="text-[11px] font-bold text-slate-800">{afternoonStartStr}</span>
                            <div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${hasAfternoonIn ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{displayAfternoonIn}</div>
                          </div>
                          <div className="flex flex-col items-center w-[60px]">
                            <span className="text-[9px] uppercase text-slate-400 mb-0.5">Ra chiều</span>
                            <span className="text-[11px] font-bold text-slate-800">{afternoonEndStr}</span>
                            <div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${hasAfternoonOut ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{displayAfternoonOut}</div>
                          </div>
                        </div>"""

new_ui = """                      <div className="relative pt-2 pb-[80px] px-2 sm:px-4">
                        <div className="h-2 bg-slate-100 rounded-full w-full relative flex items-center">
                          {/* Continuous progress bar */}
                          <div className="absolute left-0 h-full rounded-full bg-blue-500 overflow-hidden transition-all duration-1000" style={{ width: `${currentProgress}%`, zIndex: 0 }}></div>
                          
                          {/* Optional: mark actual working time with green instead of blue? Or let's just make it all blue/green. Let's use a dynamic color based on status */}
                          <div className={`absolute left-0 h-full rounded-full transition-all duration-1000 ${hasMorningIn && !hasAfternoonOut ? 'bg-green-500' : 'bg-blue-400'}`} style={{ width: `${currentProgress}%`, zIndex: 1, opacity: 0.8 }}></div>

                          {/* Nodes (dynamic positioning) */}
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasMorningIn ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_mS}%` }}></div>
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasMorningOut ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_mE}%` }}></div>
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasAfternoonIn ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_aS}%` }}></div>
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 md:w-4 md:h-4 rounded-full border-[3px] shadow-sm -translate-x-1/2 ${hasAfternoonOut ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_aE}%` }}></div>
                          
                          {/* Current time indicator bubble */}
                          {currentProgress > 0 && currentProgress < 100 && (
                            <div className="absolute top-1/2 -translate-y-1/2 z-20 w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow-md -translate-x-1/2 transition-all duration-1000" style={{ left: `${currentProgress}%` }}>
                              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                                {format(currentTime, 'HH:mm')}
                                <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-t-[4px] border-t-blue-600 border-r-[4px] border-r-transparent"></div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Labels positioned identically to nodes */}
                        <div className="absolute w-full h-full top-6 left-0 px-2 sm:px-4 pointer-events-none">
                          <div className="absolute -translate-x-1/2 flex flex-col items-center w-[60px]" style={{ left: `calc(0.5rem + (100% - 1rem) * ${p_mS} / 100)` }}>
                            <span className="text-[9px] uppercase text-slate-400 mb-0.5">Vào sáng</span>
                            <span className="text-[11px] font-bold text-slate-800">{morningStartStr}</span>
                            <div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${hasMorningIn ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{displayMorningIn}</div>
                          </div>
                          <div className="absolute -translate-x-1/2 flex flex-col items-center w-[60px]" style={{ left: `calc(0.5rem + (100% - 1rem) * ${p_mE} / 100)` }}>
                            <span className="text-[9px] uppercase text-slate-400 mb-0.5">Ra sáng</span>
                            <span className="text-[11px] font-bold text-slate-800">{morningEndStr}</span>
                            <div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${hasMorningOut ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{displayMorningOut}</div>
                          </div>
                          <div className="absolute -translate-x-1/2 flex flex-col items-center w-[60px]" style={{ left: `calc(0.5rem + (100% - 1rem) * ${p_aS} / 100)` }}>
                            <span className="text-[9px] uppercase text-slate-400 mb-0.5">Vào chiều</span>
                            <span className="text-[11px] font-bold text-slate-800">{afternoonStartStr}</span>
                            <div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${hasAfternoonIn ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{displayAfternoonIn}</div>
                          </div>
                          <div className="absolute -translate-x-1/2 flex flex-col items-center w-[60px]" style={{ left: `calc(0.5rem + (100% - 1rem) * ${p_aE} / 100)` }}>
                            <span className="text-[9px] uppercase text-slate-400 mb-0.5">Ra chiều</span>
                            <span className="text-[11px] font-bold text-slate-800">{afternoonEndStr}</span>
                            <div className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${hasAfternoonOut ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>{displayAfternoonOut}</div>
                          </div>
                        </div>"""

content = content.replace(old_ui, new_ui)

with open('src/pages/CheckIn.tsx', 'w') as f:
    f.write(content)
print("Updated CheckIn dynamic timeline")
