import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

calc_code = """
  // CALCULATE SHIFT PROGRESS
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
  else if (currentMins > aS) seg3Progress = ((currentMins - aS) / (aE - aS)) * 100;

  if (!isMobileDevice) {"""

content = content.replace("  if (!isMobileDevice) {", calc_code)

old_segments = """                          {/* Segment lines */}
                          <div className={`absolute left-0 h-full rounded-l-full ${hasMorningIn ? 'bg-green-500' : 'bg-transparent'} ${!hasMorningOut && hasMorningIn ? 'opacity-70 animate-pulse' : ''}`} style={{ width: '33.33%', zIndex: 0 }}></div>
                          <div className="absolute left-[33.33%] h-full bg-slate-200" style={{ width: '33.33%', zIndex: 0, opacity: 0.5 }}></div>
                          <div className={`absolute left-[66.66%] h-full rounded-r-full ${hasAfternoonIn ? 'bg-green-500' : 'bg-transparent'} ${!hasAfternoonOut && hasAfternoonIn ? 'opacity-70 animate-pulse' : ''}`} style={{ width: '33.33%', zIndex: 0 }}></div>"""

new_segments = """                          {/* Segment lines updating by time */}
                          <div className="absolute left-0 h-full rounded-l-full overflow-hidden" style={{ width: '33.33%', zIndex: 0 }}>
                            <div className={`h-full ${hasMorningIn ? 'bg-green-500' : 'bg-blue-300'} transition-all duration-1000 ${!hasMorningOut && hasMorningIn ? 'opacity-80 animate-pulse' : ''}`} style={{ width: hasMorningOut ? '100%' : `${seg1Progress}%` }}></div>
                          </div>
                          <div className="absolute left-[33.33%] h-full bg-slate-200 overflow-hidden" style={{ width: '33.33%', zIndex: 0, opacity: 0.5 }}>
                            <div className="h-full bg-slate-400 transition-all duration-1000" style={{ width: `${seg2Progress}%` }}></div>
                          </div>
                          <div className="absolute left-[66.66%] h-full rounded-r-full overflow-hidden" style={{ width: '33.33%', zIndex: 0 }}>
                            <div className={`h-full ${hasAfternoonIn ? 'bg-green-500' : 'bg-blue-300'} transition-all duration-1000 ${!hasAfternoonOut && hasAfternoonIn ? 'opacity-80 animate-pulse' : ''}`} style={{ width: hasAfternoonOut ? '100%' : `${seg3Progress}%` }}></div>
                          </div>"""

content = content.replace(old_segments, new_segments)

with open('src/pages/CheckIn.tsx', 'w') as f:
    f.write(content)
print("Updated CheckIn progress")
