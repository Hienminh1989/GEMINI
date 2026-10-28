import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Clock, CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, 
  RotateCcw, Filter, LogIn, LogOut, MapPin, Smartphone, ChevronDown, ChevronUp, 
  CalendarDays, TrendingUp, Search, Info, ShieldCheck, Download, User, Sparkles,
  FileSpreadsheet, X
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, addMonths, isToday } from 'date-fns';
import { vi } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { AppConfig } from '../types';
import { apiFetch } from '../lib/api';

interface DailyHistoryViewProps {
  userId?: string;
  userName?: string;
  department?: string;
  appConfig?: AppConfig | null;
  initialRecords?: any[];
}

export interface DayGroup {
  dateStr: string;
  date: Date;
  records: any[];
  morningIn?: any;
  morningOut?: any;
  afternoonIn?: any;
  afternoonOut?: any;
  otherRecords: any[];
  totalWorkMinutes: number;
  totalLateMinutes: number;
  totalEarlyMinutes: number;
  isComplete: boolean;
  statusSummary: 'perfect' | 'late' | 'early' | 'incomplete' | 'normal';
}

const getVietnameseDayOfWeek = (d: Date): string => {
  const day = d.getDay();
  switch (day) {
    case 0: return 'Chủ Nhật';
    case 1: return 'Thứ Hai';
    case 2: return 'Thứ Ba';
    case 3: return 'Thứ Tư';
    case 4: return 'Thứ Năm';
    case 5: return 'Thứ Sáu';
    case 6: return 'Thứ Bảy';
    default: return '';
  }
};

const formatDuration = (minutes: number): string => {
  if (!minutes || minutes <= 0) return '0 phút';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} phút`;
  if (m === 0) return `${h} giờ`;
  return `${h}h ${m}p`;
};

export const DailyHistoryView: React.FC<DailyHistoryViewProps> = ({
  userId,
  userName,
  department,
  appConfig,
  initialRecords = []
}) => {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [records, setRecords] = useState<any[]>(initialRecords);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'perfect' | 'late' | 'early' | 'incomplete'>('all');
  const [searchDay, setSearchDay] = useState<string>('');
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});

  // Fetch monthly attendance data
  const fetchMonthData = async (targetMonth: Date) => {
    const activeName = (userName || localStorage.getItem('checkin_name') || '').trim();
    const activeUid = (userId || localStorage.getItem('checkin_userId') || '').trim();

    if (!activeName && !activeUid) return;

    setLoading(true);
    try {
      const sDate = format(startOfMonth(targetMonth), 'yyyy-MM-dd');
      const eDate = format(endOfMonth(targetMonth), 'yyyy-MM-dd');
      
      const qUid = encodeURIComponent(activeUid || '');
      const qName = encodeURIComponent(activeName || '');
      const res = await apiFetch(`/api/attendance?userId=${qUid}&userName=${qName}&startDate=${sDate}&endDate=${eDate}&limitStr=300&orderByStr=asc&_t=${Date.now()}`);
      
      if (res.ok && Array.isArray(res.data)) {
        setRecords(res.data);
      } else {
        setRecords([]);
      }
    } catch (err) {
      console.error("Error fetching daily history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthData(currentMonth);
  }, [currentMonth, userId, userName]);

  // Helper for safe timestamp to Date
  const parseDateSafe = (ts: any): Date => {
    const num = Number(ts) || (typeof ts === 'string' && !isNaN(Date.parse(ts)) ? Date.parse(ts) : 0);
    return new Date(num);
  };

  // Group raw records by date and calculate metrics
  const dayGroups: DayGroup[] = useMemo(() => {
    const groupsMap: Record<string, any[]> = {};

    records.forEach(r => {
      if (!r.timestamp) return;
      const d = parseDateSafe(r.timestamp);
      if (isNaN(d.getTime())) return;
      const dateKey = r.date_str || r.dateStr || format(d, 'yyyy-MM-dd');
      if (!groupsMap[dateKey]) {
        groupsMap[dateKey] = [];
      }
      groupsMap[dateKey].push({
        ...r,
        timestamp: Number(r.timestamp) || d.getTime()
      });
    });

    const mStartStr = appConfig?.morningStart || '07:00';
    const aStartStr = appConfig?.afternoonStart || '13:30';
    const [aStartH, aStartM] = aStartStr.split(':').map(Number);
    const afternoonStartMin = aStartH * 60 + (aStartM || 0);

    const result: DayGroup[] = Object.keys(groupsMap).map(dateKey => {
      const dayRecs = groupsMap[dateKey].sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
      const firstD = parseDateSafe(dayRecs[0].timestamp);

      let morningIn: any = null;
      let morningOut: any = null;
      let afternoonIn: any = null;
      let afternoonOut: any = null;
      const otherRecords: any[] = [];

      let totalLate = 0;
      let totalEarly = 0;

      const getRecShift = (rec: any) => {
        const sId = rec.shift_id || rec.shiftId || rec.applied_schedule?.shiftId || rec.appliedSchedule?.shiftId;
        if (sId === 'morning' || rec.shift === 'Sáng') return 'morning';
        if (sId === 'afternoon' || rec.shift === 'Chiều') return 'afternoon';
        if (sId === 'evening' || rec.shift === 'Tối' || sId?.startsWith('duty_') || sId === 'night_custom') return 'evening';
        const rTime = parseDateSafe(rec.timestamp);
        const rMins = rTime.getHours() * 60 + rTime.getMinutes();
        if (rec.type === 'out') {
          return rMins < 13 * 60 + 30 ? 'morning' : (rMins < 18 * 60 + 30 ? 'afternoon' : 'evening');
        } else {
          return rMins < 12 * 60 + 30 ? 'morning' : (rMins < 18 * 60 ? 'afternoon' : 'evening');
        }
      };

      dayRecs.forEach(r => {
        const late = Number(r.late_minutes || r.lateMinutes || 0);
        const early = Number(r.early_leave_minutes || r.earlyLeaveMinutes || 0);
        if (late > 0) totalLate += late;
        if (early > 0) totalEarly += early;

        const shiftType = getRecShift(r);

        if (r.type === 'in') {
          if (shiftType === 'morning') {
            if (!morningIn) morningIn = r;
            else otherRecords.push(r);
          } else if (shiftType === 'afternoon') {
            if (!afternoonIn) afternoonIn = r;
            else otherRecords.push(r);
          } else {
            otherRecords.push(r);
          }
        } else if (r.type === 'out') {
          if (shiftType === 'morning') {
            morningOut = r;
          } else if (shiftType === 'afternoon' || shiftType === 'evening') {
            afternoonOut = r;
          } else {
            otherRecords.push(r);
          }
        } else {
          otherRecords.push(r);
        }
      });

      // Calculate total work duration in minutes
      let totalWorkMinutes = 0;
      if (morningIn && morningOut) {
        const diff = Math.max(0, Math.floor((morningOut.timestamp - morningIn.timestamp) / 60000));
        totalWorkMinutes += diff;
      }
      if (afternoonIn && afternoonOut) {
        const diff = Math.max(0, Math.floor((afternoonOut.timestamp - afternoonIn.timestamp) / 60000));
        totalWorkMinutes += diff;
      }
      // If only single in-out pair for the whole day
      if (!morningIn && !afternoonIn && dayRecs.length >= 2) {
        const firstIn = dayRecs.find(x => x.type === 'in');
        const lastOut = dayRecs.slice().reverse().find(x => x.type === 'out');
        if (firstIn && lastOut && lastOut.timestamp > firstIn.timestamp) {
          totalWorkMinutes = Math.floor((lastOut.timestamp - firstIn.timestamp) / 60000);
        }
      }

      const hasMorning = !!morningIn;
      const hasAfternoon = !!afternoonIn;
      const isComplete = (hasMorning && morningOut && hasAfternoon && afternoonOut) || (hasMorning && morningOut && !hasAfternoon) || (hasAfternoon && afternoonOut);

      let statusSummary: DayGroup['statusSummary'] = 'normal';
      if (totalLate > 0 && totalEarly > 0) {
        statusSummary = 'late';
      } else if (totalLate > 0) {
        statusSummary = 'late';
      } else if (totalEarly > 0) {
        statusSummary = 'early';
      } else if ((morningIn && !morningOut) || (afternoonIn && !afternoonOut)) {
        statusSummary = 'incomplete';
      } else if (isComplete && totalLate === 0 && totalEarly === 0) {
        statusSummary = 'perfect';
      }

      return {
        dateStr: dateKey,
        date: firstD,
        records: dayRecs,
        morningIn,
        morningOut,
        afternoonIn,
        afternoonOut,
        otherRecords,
        totalWorkMinutes,
        totalLateMinutes: totalLate,
        totalEarlyMinutes: totalEarly,
        isComplete: !!isComplete,
        statusSummary
      };
    });

    // Sort newest date on top
    return result.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
  }, [records, appConfig]);

  // Summary Metrics for the current month
  const monthStats = useMemo(() => {
    const totalDaysWorked = dayGroups.length;
    let totalCheckIns = 0;
    let lateCount = 0;
    let earlyCount = 0;
    let totalLateMins = 0;
    let totalEarlyMins = 0;
    let totalMinutesWorked = 0;
    let perfectDays = 0;

    dayGroups.forEach(g => {
      totalCheckIns += g.records.length;
      if (g.totalLateMinutes > 0) {
        lateCount++;
        totalLateMins += g.totalLateMinutes;
      }
      if (g.totalEarlyMinutes > 0) {
        earlyCount++;
        totalEarlyMins += g.totalEarlyMinutes;
      }
      if (g.statusSummary === 'perfect') {
        perfectDays++;
      }
      totalMinutesWorked += g.totalWorkMinutes;
    });

    return {
      totalDaysWorked,
      totalCheckIns,
      lateCount,
      earlyCount,
      totalLateMins,
      totalEarlyMins,
      totalMinutesWorked,
      perfectDays
    };
  }, [dayGroups]);

  // Filtered Day Groups
  const filteredDays = useMemo(() => {
    return dayGroups.filter(g => {
      if (searchDay) {
        const formatted = format(g.date, 'dd/MM/yyyy');
        if (!g.dateStr.includes(searchDay) && !formatted.includes(searchDay)) {
          return false;
        }
      }

      if (filterType === 'perfect') return g.statusSummary === 'perfect';
      if (filterType === 'late') return g.totalLateMinutes > 0;
      if (filterType === 'early') return g.totalEarlyMinutes > 0;
      if (filterType === 'incomplete') return g.statusSummary === 'incomplete';
      return true;
    });
  }, [dayGroups, filterType, searchDay]);

  const toggleExpand = (dateStr: string) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateStr]: !prev[dateStr]
    }));
  };

  const handlePrevMonth = () => {
    setCurrentMonth(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => addMonths(prev, 1));
  };

  const handleCurrentMonth = () => {
    setCurrentMonth(new Date());
  };

  const handleExportCsv = () => {
    if (dayGroups.length === 0) return;
    const activeName = (userName || localStorage.getItem('checkin_name') || 'NhanVien').trim();
    const monthStr = format(currentMonth, 'MM-yyyy');
    
    let csvContent = 'data:text/csv;charset=utf-8,\uFEFF';
    csvContent += `BẢNG CHẤM CÔNG CÁ NHÂN - THÁNG ${format(currentMonth, 'MM/yyyy')}\n`;
    csvContent += `Nhân viên: ${activeName}\n`;
    csvContent += `Khoa / Phòng: ${department || localStorage.getItem('checkin_department') || ''}\n`;
    csvContent += `Mã nhân viên: ${userId || localStorage.getItem('checkin_userId') || ''}\n\n`;
    csvContent += 'Ngày,Thứ,Vào Sáng,Ra Sáng,Vào Chiều,Ra Chiều,Đi muộn (phút),Về sớm (phút),Tổng giờ làm,Đánh giá\n';

    dayGroups.forEach(g => {
      const dStr = format(g.date, 'dd/MM/yyyy');
      const dow = getVietnameseDayOfWeek(g.date);
      const mIn = g.morningIn ? format(new Date(Number(g.morningIn.timestamp)), 'HH:mm') : '--';
      const mOut = g.morningOut ? format(new Date(Number(g.morningOut.timestamp)), 'HH:mm') : '--';
      const aIn = g.afternoonIn ? format(new Date(Number(g.afternoonIn.timestamp)), 'HH:mm') : '--';
      const aOut = g.afternoonOut ? format(new Date(Number(g.afternoonOut.timestamp)), 'HH:mm') : '--';
      const late = g.totalLateMinutes;
      const early = g.totalEarlyMinutes;
      const workDur = formatDuration(g.totalWorkMinutes);
      const statusText = g.statusSummary === 'perfect' ? 'Đúng giờ' : g.statusSummary === 'incomplete' ? 'Đang trong ca' : g.totalLateMinutes > 0 ? `Muộn ${g.totalLateMinutes}p` : 'Bình thường';

      csvContent += `"${dStr}","${dow}","${mIn}","${mOut}","${aIn}","${aOut}",${late},${early},"${workDur}","${statusText}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Bang_Cham_Cong_${activeName.replace(/\s+/g, '_')}_T${monthStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [showDayPickerModal, setShowDayPickerModal] = useState(false);
  const [chosenExportDate, setChosenExportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isExportingDay, setIsExportingDay] = useState(false);

  const handleExportDayExcel = (group: DayGroup) => {
    const activeName = (userName || localStorage.getItem('checkin_name') || 'Nhân viên').trim();
    const activeDept = (department || localStorage.getItem('checkin_department') || 'Chưa cập nhật').trim();
    const activeUid = (userId || localStorage.getItem('checkin_userId') || '').trim();

    const morningInTime = group.morningIn ? format(new Date(Number(group.morningIn.timestamp)), 'HH:mm:ss') : '';
    const morningOutTime = group.morningOut ? format(new Date(Number(group.morningOut.timestamp)), 'HH:mm:ss') : '';
    const afternoonInTime = group.afternoonIn ? format(new Date(Number(group.afternoonIn.timestamp)), 'HH:mm:ss') : '';
    const afternoonOutTime = group.afternoonOut ? format(new Date(Number(group.afternoonOut.timestamp)), 'HH:mm:ss') : '';

    let statusStr = "Đúng giờ";
    if (group.records.length === 0) {
      statusStr = "Chưa điểm danh";
    } else if (group.totalLateMinutes > 0 && group.totalEarlyMinutes > 0) {
      statusStr = `Đi muộn (${group.totalLateMinutes}p) & Về sớm (${group.totalEarlyMinutes}p)`;
    } else if (group.totalLateMinutes > 0) {
      statusStr = `Đi muộn (${group.totalLateMinutes}p)`;
    } else if (group.totalEarlyMinutes > 0) {
      statusStr = `Về sớm (${group.totalEarlyMinutes}p)`;
    } else if (group.statusSummary === 'incomplete') {
      statusStr = "Đang trong ca";
    }

    // 2-tier headers requested by user:
    // STT | Mã NV | Họ và tên | Khoa / Phòng | Trạng thái | CA SÁNG (Giờ vào, Giờ ra) | CA CHIỀU (Giờ vào, Giờ ra)
    const headers = [
      ['STT', 'Mã NV', 'Họ và tên', 'Khoa / Phòng', 'Trạng thái', 'CA SÁNG', '', 'CA CHIỀU', ''],
      ['', '', '', '', '', 'Giờ vào', 'Giờ ra', 'Giờ vào', 'Giờ ra']
    ];

    const dataRows = [
      [
        1,
        activeUid,
        activeName,
        activeDept,
        statusStr,
        morningInTime,
        morningOutTime,
        afternoonInTime,
        afternoonOutTime
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet([...headers, ...dataRows]);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // STT
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // Mã NV
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }, // Họ và tên
      { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } }, // Khoa / Phòng
      { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } }, // Trạng thái
      { s: { r: 0, c: 5 }, e: { r: 0, c: 6 } }, // CA SÁNG
      { s: { r: 0, c: 7 }, e: { r: 0, c: 8 } }, // CA CHIỀU
    ];

    ws['!cols'] = [
      { wch: 6 },  // STT
      { wch: 14 }, // Mã NV
      { wch: 28 }, // Họ và tên
      { wch: 24 }, // Khoa / Phòng
      { wch: 22 }, // Trạng thái
      { wch: 14 }, // Ca Sáng - Giờ vào
      { wch: 14 }, // Ca Sáng - Giờ ra
      { wch: 14 }, // Ca Chiều - Giờ vào
      { wch: 14 }  // Ca Chiều - Giờ ra
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DiemDanh");
    XLSX.writeFile(wb, `DiemDanh_${activeName.replace(/\s+/g, '_')}_${group.dateStr}.xlsx`);
  };

  const handleExportChosenDate = async (targetDateStr: string) => {
    const existingGroup = dayGroups.find(g => g.dateStr === targetDateStr);
    if (existingGroup) {
      handleExportDayExcel(existingGroup);
      setShowDayPickerModal(false);
      return;
    }

    setIsExportingDay(true);
    try {
      const activeName = (userName || localStorage.getItem('checkin_name') || 'Nhân viên').trim();
      const activeDept = (department || localStorage.getItem('checkin_department') || 'Chưa cập nhật').trim();
      const activeUid = (userId || localStorage.getItem('checkin_userId') || '').trim();

      const res = await apiFetch(`/api/attendance?dateStr=${targetDateStr}${activeUid ? `&userId=${activeUid}` : ''}`);
      const data = res.data || {};
      const dayRecs = (data.records || []).filter((r: any) => !activeUid || r.userId === activeUid);

      let statusStr = "Chưa điểm danh";
      let morningInTime = "";
      let morningOutTime = "";
      let afternoonInTime = "";
      let afternoonOutTime = "";

      if (dayRecs.length > 0) {
        dayRecs.forEach((r: any) => {
          let actualShift = r.shiftId || (r.shift === 'Sáng' ? 'morning' : (r.shift === 'Chiều' ? 'afternoon' : ''));
          if (!actualShift || actualShift === 'default') {
            const d = new Date(Number(r.timestamp));
            const mins = d.getHours() * 60 + d.getMinutes();
            if (r.type === 'out') {
              actualShift = mins < 13 * 60 + 30 ? 'morning' : 'afternoon';
            } else {
              actualShift = mins < 12 * 60 + 30 ? 'morning' : 'afternoon';
            }
          }

          const tStr = format(new Date(Number(r.timestamp)), 'HH:mm:ss');
          if (actualShift === 'morning') {
            if (r.type === 'in' || !r.type) {
              if (!morningInTime) morningInTime = tStr;
            } else {
              morningOutTime = tStr;
            }
          } else {
            if (r.type === 'in' || !r.type) {
              if (!afternoonInTime) afternoonInTime = tStr;
            } else {
              afternoonOutTime = tStr;
            }
          }
        });

        const hasLate = dayRecs.some((r: any) => r.lateMinutes && r.lateMinutes > 0);
        statusStr = hasLate ? "Đi muộn" : "Đúng giờ";
      }

      const headers = [
        ['STT', 'Mã NV', 'Họ và tên', 'Khoa / Phòng', 'Trạng thái', 'CA SÁNG', '', 'CA CHIỀU', ''],
        ['', '', '', '', '', 'Giờ vào', 'Giờ ra', 'Giờ vào', 'Giờ ra']
      ];

      const dataRows = [
        [
          1,
          activeUid,
          activeName,
          activeDept,
          statusStr,
          morningInTime,
          morningOutTime,
          afternoonInTime,
          afternoonOutTime
        ]
      ];

      const ws = XLSX.utils.aoa_to_sheet([...headers, ...dataRows]);
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // STT
        { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // Mã NV
        { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }, // Họ và tên
        { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } }, // Khoa / Phòng
        { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } }, // Trạng thái
        { s: { r: 0, c: 5 }, e: { r: 0, c: 6 } }, // CA SÁNG
        { s: { r: 0, c: 7 }, e: { r: 0, c: 8 } }, // CA CHIỀU
      ];

      ws['!cols'] = [
        { wch: 6 },
        { wch: 14 },
        { wch: 28 },
        { wch: 24 },
        { wch: 22 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "DiemDanh");
      XLSX.writeFile(wb, `DiemDanh_${activeName.replace(/\s+/g, '_')}_${targetDateStr}.xlsx`);
      setShowDayPickerModal(false);
    } catch (err) {
      console.error(err);
      alert('Không thể xuất dữ liệu điểm danh cho ngày đã chọn.');
    } finally {
      setIsExportingDay(false);
    }
  };

  const activeEmpName = (userName || localStorage.getItem('checkin_name') || 'Nhân viên').trim();
  const activeEmpDept = (department || localStorage.getItem('checkin_department') || '').trim();
  const activeEmpId = (userId || localStorage.getItem('checkin_userId') || '').trim();

  return (
    <div className="space-y-4">
      {/* EMPLOYEE INFO BANNER */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white rounded-3xl p-5 shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-13 h-13 rounded-2xl bg-white/20 border-2 border-white/30 flex items-center justify-center text-white shrink-0 shadow-inner">
              <User className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] uppercase tracking-wider font-bold text-blue-200 bg-white/15 px-2.5 py-0.5 rounded-full">
                  Lịch Sử Cá Nhân
                </span>
                {activeEmpId && (
                  <span className="text-xs font-mono font-bold text-white/90 bg-white/10 px-2 py-0.5 rounded-md">
                    Mã: {activeEmpId}
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white mt-0.5 truncate">
                {activeEmpName}
              </h2>
              <p className="text-xs text-blue-100/90 font-medium truncate">
                {activeEmpDept || 'Bệnh viện đa khoa Thiệu Hóa'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowDayPickerModal(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl border border-emerald-400/50 transition-all flex items-center gap-1.5 shadow-xs"
              title="Tải file Excel điểm danh một ngày bất kỳ theo mẫu chuẩn"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Tải Excel Ngày</span>
            </button>

            <button
              onClick={handleExportCsv}
              disabled={dayGroups.length === 0}
              className="px-3.5 py-2 bg-white/20 hover:bg-white/30 active:scale-95 text-white font-bold text-xs rounded-xl border border-white/30 transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Bảng Công</span>
            </button>

            <button
              onClick={() => fetchMonthData(currentMonth)}
              disabled={loading}
              title="Làm mới dữ liệu"
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 text-white transition-colors border border-white/25"
            >
              <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* HEADER: MONTH NAVIGATION */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-xs border border-slate-100 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-blue-600" />
              Bảng chấm công tháng {format(currentMonth, 'MM/yyyy')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Ghi nhận đầy đủ thời gian vào ca, ra ca và tổng công của bạn
            </p>
          </div>
        </div>

        {/* Month Selector Bar */}
        <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded-2xl border border-slate-200/70">
          <button
            onClick={handlePrevMonth}
            className="p-2 rounded-xl text-slate-600 hover:bg-white hover:shadow-xs transition-all font-bold flex items-center gap-1 text-xs"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Tháng trước</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 text-sm sm:text-base font-mono">
              Tháng {format(currentMonth, 'MM / yyyy')}
            </span>
            {format(currentMonth, 'yyyy-MM') !== format(new Date(), 'yyyy-MM') && (
              <button
                onClick={handleCurrentMonth}
                className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[11px] font-bold rounded-lg hover:bg-blue-200 transition-colors"
              >
                Hôm nay
              </button>
            )}
          </div>

          <button
            onClick={handleNextMonth}
            className="p-2 rounded-xl text-slate-600 hover:bg-white hover:shadow-xs transition-all font-bold flex items-center gap-1 text-xs"
          >
            <span className="hidden sm:inline">Tháng sau</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* MONTHLY METRIC STATS CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50/60 p-3 rounded-2xl border border-blue-100 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Số ngày làm việc</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-bold text-blue-700 font-mono">{monthStats.totalDaysWorked}</span>
              <span className="text-xs text-slate-500 font-medium">ngày</span>
            </div>
            <span className="text-[10px] text-blue-600 mt-0.5 font-medium">{monthStats.totalCheckIns} lượt quét</span>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-teal-50/60 p-3 rounded-2xl border border-emerald-100 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Tổng giờ làm</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-bold text-emerald-700 font-mono">
                {Math.floor(monthStats.totalMinutesWorked / 60)}h
              </span>
              <span className="text-xs text-slate-500 font-medium">{monthStats.totalMinutesWorked % 60}p</span>
            </div>
            <span className="text-[10px] text-emerald-600 mt-0.5 font-medium">{monthStats.perfectDays} ngày chuẩn giờ</span>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-50/60 p-3 rounded-2xl border border-amber-100 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Lượt đi muộn</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-bold text-amber-700 font-mono">{monthStats.lateCount}</span>
              <span className="text-xs text-slate-500 font-medium">lần</span>
            </div>
            <span className="text-[10px] text-amber-600 mt-0.5 font-medium">Tổng {monthStats.totalLateMins} phút</span>
          </div>

          <div className="bg-gradient-to-br from-rose-50 to-red-50/60 p-3 rounded-2xl border border-rose-100 flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Lượt về sớm</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-bold text-rose-700 font-mono">{monthStats.earlyCount}</span>
              <span className="text-xs text-slate-500 font-medium">lần</span>
            </div>
            <span className="text-[10px] text-rose-600 mt-0.5 font-medium">Tổng {monthStats.totalEarlyMins} phút</span>
          </div>
        </div>

        {/* FILTER CHIPS & SEARCH */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
                filterType === 'all'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tất cả ({dayGroups.length})
            </button>
            <button
              onClick={() => setFilterType('perfect')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
                filterType === 'perfect'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Đúng giờ ({monthStats.perfectDays})
            </button>
            <button
              onClick={() => setFilterType('late')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
                filterType === 'late'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              Đi muộn ({monthStats.lateCount})
            </button>
            <button
              onClick={() => setFilterType('early')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
                filterType === 'early'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              Về sớm ({monthStats.earlyCount})
            </button>
            <button
              onClick={() => setFilterType('incomplete')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
                filterType === 'incomplete'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              Chưa ra ca
            </button>
          </div>

          {/* Quick Date Search Input */}
          <div className="relative sm:w-44 shrink-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm ngày (vd: 20/08)..."
              value={searchDay}
              onChange={(e) => setSearchDay(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {searchDay && (
              <button
                onClick={() => setSearchDay('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* DAILY GROUPED CARDS LIST */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-semibold text-slate-600">Đang tải lịch sử điểm danh...</p>
          </div>
        ) : filteredDays.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-xs flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-1">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-700 text-sm">Không tìm thấy dữ liệu điểm danh</h3>
            <p className="text-xs text-slate-500 max-w-xs">
              {searchDay || filterType !== 'all' 
                ? 'Không có ngày nào khớp với bộ lọc hiện tại. Hãy thử chọn điều kiện khác.' 
                : `Chưa ghi nhận lượt điểm danh nào trong tháng ${format(currentMonth, 'MM/yyyy')}.`}
            </p>
          </div>
        ) : (
          filteredDays.map(group => {
            const isExpanded = !!expandedDates[group.dateStr];
            const isTodayDate = isToday(group.date);
            const dayOfWeekStr = getVietnameseDayOfWeek(group.date);
            const formattedDate = format(group.date, 'dd/MM/yyyy');

            return (
              <div
                key={group.dateStr}
                className={`bg-white rounded-3xl border transition-all duration-200 overflow-hidden shadow-xs ${
                  isTodayDate 
                    ? 'border-blue-300 ring-2 ring-blue-500/10' 
                    : 'border-slate-100 hover:border-slate-200'
                }`}
              >
                {/* DAY HEADER */}
                <div 
                  onClick={() => toggleExpand(group.dateStr)}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer bg-gradient-to-r from-slate-50/50 via-white to-slate-50/30 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-2xl flex flex-col items-center justify-center shrink-0 border ${
                      isTodayDate 
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs' 
                        : 'bg-white text-slate-700 border-slate-200 shadow-xs'
                    }`}>
                      <span className="text-[10px] font-bold uppercase leading-none">{format(group.date, 'MM')}</span>
                      <span className="text-base font-black leading-tight font-mono">{format(group.date, 'dd')}</span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm sm:text-base">
                          {dayOfWeekStr}, {formattedDate}
                        </span>
                        {isTodayDate && (
                          <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                            Hôm nay
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                        {/* Status Badges */}
                        {group.totalLateMinutes > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[11px] font-bold">
                            <Clock className="w-3 h-3 text-amber-600" /> Muộn {group.totalLateMinutes}p
                          </span>
                        )}
                        {group.totalEarlyMinutes > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold">
                            <LogOut className="w-3 h-3 text-rose-600" /> Sớm {group.totalEarlyMinutes}p
                          </span>
                        )}
                        {group.statusSummary === 'perfect' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Đúng giờ
                          </span>
                        )}
                        {group.statusSummary === 'incomplete' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-bold">
                            <Info className="w-3 h-3 text-blue-600" /> Đang trong ca
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side: Duration + Export Excel + Toggle Chevron */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportDayExcel(group);
                      }}
                      className="px-2 sm:px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors flex items-center gap-1 text-xs font-bold shadow-2xs"
                      title={`Tải file Excel điểm danh ngày ${formattedDate} (Mẫu: STT | Mã NV | Họ và tên | Khoa / Phòng | Trạng thái | CA SÁNG | CA CHIỀU)`}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="hidden sm:inline">Tải Excel</span>
                    </button>

                    <div className="text-right hidden sm:block">
                      <span className="text-[11px] text-slate-400 block font-medium">Thời lượng</span>
                      <span className="text-xs sm:text-sm font-bold text-slate-800 font-mono">
                        {formatDuration(group.totalWorkMinutes)}
                      </span>
                    </div>

                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* DAY SUMMARY GRID (MORNING & AFTERNOON BOXES) */}
                <div className="p-4 pt-1 border-t border-slate-100 bg-white">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* CA SÁNG */}
                    <div className={`p-3.5 rounded-2xl border transition-all ${
                      group.morningIn 
                        ? 'bg-slate-50/70 border-slate-200/80' 
                        : 'bg-slate-50/30 border-dashed border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                          Ca Sáng ({appConfig?.morningStart || '07:00'} - {appConfig?.morningEnd || '11:20'})
                        </span>
                        {group.morningIn && group.morningOut && (
                          <span className="text-[11px] font-semibold text-slate-500 font-mono">
                            {formatDuration(Math.max(0, Math.floor((group.morningOut.timestamp - group.morningIn.timestamp) / 60000)))}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {/* Morning Check In */}
                        <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <LogIn className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] text-slate-400 block leading-tight">Vào ca</span>
                            {group.morningIn ? (
                              <div>
                                <span className="font-bold text-slate-800 font-mono text-xs">
                                  {format(parseDateSafe(group.morningIn.timestamp), 'HH:mm')}
                                </span>
                                {group.morningIn.late_minutes > 0 ? (
                                  <span className="text-[10px] text-amber-600 font-bold block leading-none">
                                    +{group.morningIn.late_minutes}p
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-emerald-600 font-semibold block leading-none">
                                    Đúng giờ
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 font-medium italic text-[11px]">--:--</span>
                            )}
                          </div>
                        </div>

                        {/* Morning Check Out */}
                        <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                            <LogOut className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] text-slate-400 block leading-tight">Ra ca</span>
                            {group.morningOut ? (
                              <div>
                                <span className="font-bold text-slate-800 font-mono text-xs">
                                  {format(parseDateSafe(group.morningOut.timestamp), 'HH:mm')}
                                </span>
                                {group.morningOut.early_leave_minutes > 0 ? (
                                  <span className="text-[10px] text-rose-600 font-bold block leading-none">
                                    -{group.morningOut.early_leave_minutes}p
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-emerald-600 font-semibold block leading-none">
                                    Đúng giờ
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 font-medium italic text-[11px]">--:--</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* CA CHIỀU */}
                    <div className={`p-3.5 rounded-2xl border transition-all ${
                      group.afternoonIn 
                        ? 'bg-slate-50/70 border-slate-200/80' 
                        : 'bg-slate-50/30 border-dashed border-slate-200'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          Ca Chiều ({appConfig?.afternoonStart || '13:30'} - {appConfig?.afternoonEnd || '16:50'})
                        </span>
                        {group.afternoonIn && group.afternoonOut && (
                          <span className="text-[11px] font-semibold text-slate-500 font-mono">
                            {formatDuration(Math.max(0, Math.floor((group.afternoonOut.timestamp - group.afternoonIn.timestamp) / 60000)))}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {/* Afternoon Check In */}
                        <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <LogIn className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] text-slate-400 block leading-tight">Vào ca</span>
                            {group.afternoonIn ? (
                              <div>
                                <span className="font-bold text-slate-800 font-mono text-xs">
                                  {format(parseDateSafe(group.afternoonIn.timestamp), 'HH:mm')}
                                </span>
                                {group.afternoonIn.late_minutes > 0 ? (
                                  <span className="text-[10px] text-amber-600 font-bold block leading-none">
                                    +{group.afternoonIn.late_minutes}p
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-emerald-600 font-semibold block leading-none">
                                    Đúng giờ
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 font-medium italic text-[11px]">--:--</span>
                            )}
                          </div>
                        </div>

                        {/* Afternoon Check Out */}
                        <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                            <LogOut className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] text-slate-400 block leading-tight">Ra ca</span>
                            {group.afternoonOut ? (
                              <div>
                                <span className="font-bold text-slate-800 font-mono text-xs">
                                  {format(parseDateSafe(group.afternoonOut.timestamp), 'HH:mm')}
                                </span>
                                {group.afternoonOut.early_leave_minutes > 0 ? (
                                  <span className="text-[10px] text-rose-600 font-bold block leading-none">
                                    -{group.afternoonOut.early_leave_minutes}p
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-emerald-600 font-semibold block leading-none">
                                    Đúng giờ
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 font-medium italic text-[11px]">--:--</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* EXPANDABLE DETAILED TIMELINE OF ALL LOGS FOR THIS DAY */}
                {isExpanded && (
                  <div className="p-4 bg-slate-50/70 border-t border-slate-100 space-y-2.5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600" /> Nhật ký chi tiết ({group.records.length} lượt)
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Tổng làm việc: <b className="text-slate-800">{formatDuration(group.totalWorkMinutes)}</b>
                      </span>
                    </div>

                    <div className="space-y-2">
                      {group.records.map((rec, rIdx) => {
                        const recTime = parseDateSafe(rec.timestamp);
                        const isIn = rec.type === 'in';
                        const late = Number(rec.late_minutes || rec.lateMinutes || 0);
                        const early = Number(rec.early_leave_minutes || rec.earlyLeaveMinutes || 0);

                        return (
                          <div 
                            key={rec.id || rIdx}
                            className="bg-white p-3 rounded-2xl border border-slate-200/70 flex items-center justify-between gap-3 text-xs shadow-2xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                isIn 
                                  ? 'bg-emerald-100 text-emerald-700' 
                                  : 'bg-amber-100 text-amber-700'
                              }`}>
                                {isIn ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-800 font-mono text-sm">
                                    {format(recTime, 'HH:mm:ss')}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    isIn ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                  }`}>
                                    {isIn ? 'GHI NHẬN VÀO' : 'GHI NHẬN RA'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                                  {rec.shift && (
                                    <span>Ca: <b className="text-slate-700">{rec.shift}</b></span>
                                  )}
                                  {rec.device_info?.deviceModel && (
                                    <span className="flex items-center gap-0.5">
                                      <Smartphone className="w-3 h-3 text-slate-400" />
                                      {rec.device_info.deviceModel}
                                    </span>
                                  )}
                                  {rec.location?.lat && (
                                    <span className="flex items-center gap-0.5 text-slate-400">
                                      <MapPin className="w-3 h-3" />
                                      GPS hợp lệ
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              {late > 0 && (
                                <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-md text-[10px] font-bold block">
                                  Muộn {late} phút
                                </span>
                              )}
                              {early > 0 && (
                                <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-[10px] font-bold block">
                                  Về sớm {early} phút
                                </span>
                              )}
                              {late === 0 && early === 0 && (
                                <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-md text-[10px] font-bold block">
                                  Đúng giờ
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: EXPORT EXCEL FOR ANY SELECTED DAY */}
      {showDayPickerModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-100 max-w-md w-full animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Tải Excel Điểm Danh Theo Ngày</h3>
                  <p className="text-xs text-slate-500">Mẫu chuẩn theo danh sách chấm công</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDayPickerModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/70 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Nhân viên:</span>
                  <span className="font-bold text-slate-700">{activeEmpName}</span>
                </div>
                {activeEmpId && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Mã NV:</span>
                    <span className="font-mono font-bold text-slate-700">{activeEmpId}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Khoa / Phòng:</span>
                  <span className="font-semibold text-slate-700">{activeEmpDept || 'Chưa cập nhật'}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Chọn ngày điểm danh cần tải xuống:
                </label>
                <input
                  type="date"
                  value={chosenExportDate}
                  onChange={(e) => setChosenExportDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
                <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-1">
                  Định dạng file Excel xuất:
                </div>
                <div className="text-[11px] text-emerald-900 font-mono bg-white/80 p-2 rounded-lg border border-emerald-200/60 overflow-x-auto whitespace-nowrap">
                  STT | Mã NV | Họ và tên | Khoa / Phòng | Trạng thái | CA SÁNG (Giờ vào, Giờ ra) | CA CHIỀU (Giờ vào, Giờ ra)
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDayPickerModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  disabled={isExportingDay || !chosenExportDate}
                  onClick={() => handleExportChosenDate(chosenExportDate)}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{isExportingDay ? 'Đang xuất...' : 'Tải file Excel'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
