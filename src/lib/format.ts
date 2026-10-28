export const getPositionBadgeClass = (position?: string) => {
  if (!position) return "text-blue-700 bg-blue-100 border-blue-200";
  const p = position.toLowerCase();
  
  if (p === 'giám đốc') {
    return "text-red-700 bg-red-100 border-red-200"; // Đỏ
  }
  if (p === 'phó giám đốc') {
    return "text-orange-700 bg-orange-100 border-orange-200"; // Cam đỏ
  }
  if (p.includes('trưởng phòng') || p.includes('trưởng khoa')) {
    return "text-amber-700 bg-amber-100 border-amber-200"; // Cam
  }
  if (p.includes('phó phòng') || p.includes('phó khoa')) {
    return "text-yellow-700 bg-yellow-100 border-yellow-200"; // Vàng
  }
  if (p.includes('nhân viên') || p.includes('nhân sự')) {
    return "text-blue-700 bg-blue-100 border-blue-200"; // Xanh dương
  }
  
  return "text-blue-700 bg-blue-100 border-blue-200"; // Default
};

export const getVnTodayDateString = (date: Date = new Date()): string => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(date);
  } catch (e) {
    const utc = date.getTime() + date.getTimezoneOffset() * 60000;
    const vnTime = new Date(utc + 7 * 3600000);
    const y = vnTime.getFullYear();
    const m = String(vnTime.getMonth() + 1).padStart(2, '0');
    const d = String(vnTime.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
};
