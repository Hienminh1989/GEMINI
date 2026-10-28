import React, { useState, useEffect, useMemo } from 'react';
import { 
  format, parseISO, subDays, startOfMonth, endOfMonth, subMonths, eachDayOfInterval, isWeekend, isToday, isValid
} from 'date-fns';
import { vi } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { 
  Search, Calendar, Clock, Download, RefreshCw, Plus, Edit2, Trash2, 
  MapPin, CheckCircle2, AlertCircle, AlertTriangle, User, Building,
  ArrowRight, ShieldCheck, FileSpreadsheet, Eye, X, Check, Filter, ChevronLeft, ChevronRight
} from 'lucide-react';
import { AttendanceRecord, UserData, AppConfig } from '../types';
import { apiFetch } from '../lib/api';

interface AttendanceHistoryProps {
  users: UserData[];
  departments: { id: string; name: string }[];
  config: AppConfig;
  canEdit: boolean;
  canDelete: boolean;
  initialUserId?: string;
}

type TimeRangePreset = 'today' | '7days' | '1month' | 'this_month' | 'last_month' | '3months' | 'custom';

interface DaySummary {
  dateStr: string;
  dateObj: Date;
  dayOfWeek: string;
  isWeekendDay: boolean;
  isTodayDay: boolean;
  morningIn?: AttendanceRecord;
  morningOut?: AttendanceRecord;
  afternoonIn?: AttendanceRecord;
  afternoonOut?: AttendanceRecord;
  eveningIn?: AttendanceRecord;
  eveningOut?: AttendanceRecord;
  otherRecords: AttendanceRecord[];
  allRecords: AttendanceRecord[];
  totalLateMinutes: number;
  totalEarlyLeaveMinutes: number;
  statusLabel: 'du_ca' | 'mot_ca' | 'muon_som' | 'vang' | 'cuoi_tuan';
}

export const AttendanceHistory: React.FC<AttendanceHistoryProps> = ({
  users,
  departments,
  config,
  canEdit,
  canDelete,
  initialUserId,
}) => {
  // Staff Selection State
  const [selectedUserId, setSelectedUserId] = useState<string>(initialUserId || (users[0]?.uid || ''));
  const [userSearchText, setUserSearchText] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');

  // Time Range State
  const [timePreset, setTimePreset] = useState<TimeRangePreset>('1month');
  const [startDateStr, setStartDateStr] = useState<string>(
    format(subDays(new Date(), 29), 'yyyy-MM-dd')
  );
  const [endDateStr, setEndDateStr] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );

  // Filter Table State
  const [tableFilter, setTableFilter] = useState<'all' | 'attended' | 'late_early' | 'missing' | 'weekend'>('all');

  // Attendance Records State
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');

  // Modals State
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<AttendanceRecord | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);
  const [manualForm, setManualForm] = useState<{
    id?: string;
    dateStr: string;
    timeStr: string;
    shift: string;
    type: 'in' | 'out';
    shiftId: string;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    reason: string;
  }>({
    dateStr: format(new Date(), 'yyyy-MM-dd'),
    timeStr: format(new Date(), 'HH:mm'),
    shift: 'Sáng',
    type: 'in',
    shiftId: 'morning',
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    reason: 'Admin bổ sung công tác'
  });
  const [isSavingManual, setIsSavingManual] = useState<boolean>(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Set default user if none selected and users change
  useEffect(() => {
    if (!selectedUserId && users.length > 0) {
      setSelectedUserId(users[0].uid);
    }
  }, [users, selectedUserId]);

  // Handle Preset Changes
  const applyPreset = (preset: TimeRangePreset) => {
    setTimePreset(preset);
    const today = new Date();
    if (preset === 'today') {
      setStartDateStr(format(today, 'yyyy-MM-dd'));
      setEndDateStr(format(today, 'yyyy-MM-dd'));
    } else if (preset === '7days') {
      setStartDateStr(format(subDays(today, 6), 'yyyy-MM-dd'));
      setEndDateStr(format(today, 'yyyy-MM-dd'));
    } else if (preset === '1month') {
      setStartDateStr(format(subDays(today, 29), 'yyyy-MM-dd'));
      setEndDateStr(format(today, 'yyyy-MM-dd'));
    } else if (preset === 'this_month') {
      setStartDateStr(format(startOfMonth(today), 'yyyy-MM-dd'));
      setEndDateStr(format(today, 'yyyy-MM-dd'));
    } else if (preset === 'last_month') {
      const prevMonth = subMonths(today, 1);
      setStartDateStr(format(startOfMonth(prevMonth), 'yyyy-MM-dd'));
      setEndDateStr(format(endOfMonth(prevMonth), 'yyyy-MM-dd'));
    } else if (preset === '3months') {
      setStartDateStr(format(subDays(today, 89), 'yyyy-MM-dd'));
      setEndDateStr(format(today, 'yyyy-MM-dd'));
    }
  };

  // Selected User Object
  const selectedUser = useMemo(() => {
    return users.find(u => u.uid === selectedUserId) || null;
  }, [users, selectedUserId]);

  // Filtered Users list for selection
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesDept = !departmentFilter || u.department === departmentFilter;
      const matchesSearch = !userSearchText || 
        u.name.toLowerCase().includes(userSearchText.toLowerCase()) ||
        u.uid.toLowerCase().includes(userSearchText.toLowerCase()) ||
        (u.department && u.department.toLowerCase().includes(userSearchText.toLowerCase())) ||
        (u.email && u.email.toLowerCase().includes(userSearchText.toLowerCase()));
      return matchesDept && matchesSearch;
    });
  }, [users, departmentFilter, userSearchText]);

  // When searching, auto-select first matching user if current selected is filtered out
  useEffect(() => {
    if (userSearchText && filteredUsers.length > 0) {
      const exists = filteredUsers.some(u => u.uid === selectedUserId);
      if (!exists) {
        setSelectedUserId(filteredUsers[0].uid);
      }
    }
  }, [userSearchText, filteredUsers, selectedUserId]);

  // Fetch Attendance Records for Selected User in Time Range
  const fetchAttendance = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    setActionError('');
    try {
      // Query by userId, startDate and endDate
      const params = new URLSearchParams({
        userId: selectedUserId,
        startDate: startDateStr,
        endDate: endDateStr,
        orderByStr: 'desc',
        _t: Date.now().toString()
      });
      if (selectedUser?.name) {
        params.append('userName', selectedUser.name);
      }

      const res = await apiFetch<AttendanceRecord[]>(`/api/attendance?${params.toString()}`);
      if (res.ok && Array.isArray(res.data)) {
        setRecords(res.data);
      } else {
        throw new Error(res.error || 'Không thể tải dữ liệu điểm danh');
      }
    } catch (err: any) {
      console.error('Lỗi tải lịch sử:', err);
      setActionError(err.message || 'Lỗi khi tải lịch sử điểm danh');
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch on user or date changes
  useEffect(() => {
    if (selectedUserId) {
      fetchAttendance();
    }
  }, [selectedUserId, startDateStr, endDateStr]);

  // Calculate day-by-day mapping
  const dailySummaries = useMemo<DaySummary[]>(() => {
    if (!startDateStr || !endDateStr) return [];
    
    let startD = parseISO(startDateStr);
    let endD = parseISO(endDateStr);

    if (!isValid(startD) || !isValid(endD) || startD > endD) {
      return [];
    }

    const daysInterval = eachDayOfInterval({ start: startD, end: endD });
    // Sort descending (newest day first)
    daysInterval.sort((a, b) => b.getTime() - a.getTime());

    // Map records to dateStr
    const recordsByDate: Record<string, AttendanceRecord[]> = {};
    records.forEach(r => {
      if (!recordsByDate[r.dateStr]) {
        recordsByDate[r.dateStr] = [];
      }
      recordsByDate[r.dateStr].push(r);
    });

    return daysInterval.map(d => {
      const dStr = format(d, 'yyyy-MM-dd');
      const dayRecs = recordsByDate[dStr] || [];
      const dayOfWeek = format(d, 'EEEE', { locale: vi });
      const isWeekendDay = isWeekend(d);
      const isTodayDay = isToday(d);

      // Separate shifts
      let morningIn: AttendanceRecord | undefined;
      let morningOut: AttendanceRecord | undefined;
      let afternoonIn: AttendanceRecord | undefined;
      let afternoonOut: AttendanceRecord | undefined;
      let eveningIn: AttendanceRecord | undefined;
      let eveningOut: AttendanceRecord | undefined;
      const otherRecords: AttendanceRecord[] = [];

      dayRecs.forEach(r => {
        const timeH = new Date(r.timestamp).getHours();
        const isMorning = r.shiftId === 'morning' || (r.shift && r.shift.includes('Sáng')) || (!r.shiftId && timeH < 12);
        const isAfternoon = r.shiftId === 'afternoon' || (r.shift && r.shift.includes('Chiều')) || (!r.shiftId && timeH >= 12 && timeH < 18);
        const isEvening = r.shiftId === 'evening' || (r.shift && r.shift.includes('Tối')) || (!r.shiftId && timeH >= 18);

        if (isMorning) {
          if (r.type === 'in' && !morningIn) morningIn = r;
          else if (r.type === 'out' && !morningOut) morningOut = r;
          else otherRecords.push(r);
        } else if (isAfternoon) {
          if (r.type === 'in' && !afternoonIn) afternoonIn = r;
          else if (r.type === 'out' && !afternoonOut) afternoonOut = r;
          else otherRecords.push(r);
        } else if (isEvening) {
          if (r.type === 'in' && !eveningIn) eveningIn = r;
          else if (r.type === 'out' && !eveningOut) eveningOut = r;
          else otherRecords.push(r);
        } else {
          otherRecords.push(r);
        }
      });

      let totalLate = 0;
      let totalEarly = 0;
      dayRecs.forEach(r => {
        if (r.lateMinutes && r.lateMinutes > 0) totalLate += r.lateMinutes;
        if (r.earlyLeaveMinutes && r.earlyLeaveMinutes > 0) totalEarly += r.earlyLeaveMinutes;
      });

      // Determine day status
      let statusLabel: 'du_ca' | 'mot_ca' | 'muon_som' | 'vang' | 'cuoi_tuan' = 'vang';
      const hasMorning = !!(morningIn || morningOut);
      const hasAfternoon = !!(afternoonIn || afternoonOut);
      const hasEvening = !!(eveningIn || eveningOut);

      if (hasMorning && hasAfternoon) {
        if (totalLate > 0 || totalEarly > 0) {
          statusLabel = 'muon_som';
        } else {
          statusLabel = 'du_ca';
        }
      } else if (hasMorning || hasAfternoon || hasEvening) {
        if (totalLate > 0 || totalEarly > 0) {
          statusLabel = 'muon_som';
        } else {
          statusLabel = 'mot_ca';
        }
      } else {
        statusLabel = isWeekendDay ? 'cuoi_tuan' : 'vang';
      }

      return {
        dateStr: dStr,
        dateObj: d,
        dayOfWeek,
        isWeekendDay,
        isTodayDay,
        morningIn,
        morningOut,
        afternoonIn,
        afternoonOut,
        eveningIn,
        eveningOut,
        otherRecords,
        allRecords: dayRecs,
        totalLateMinutes: totalLate,
        totalEarlyLeaveMinutes: totalEarly,
        statusLabel
      };
    });
  }, [startDateStr, endDateStr, records]);

  // Overall Statistics for Period
  const stats = useMemo(() => {
    const totalDaysInRange = dailySummaries.length;
    const attendedDays = dailySummaries.filter(d => d.allRecords.length > 0).length;
    const fullShiftsDays = dailySummaries.filter(d => d.statusLabel === 'du_ca').length;
    const totalRecordsCount = records.length;
    
    let totalLateCount = 0;
    let totalLateMinutes = 0;
    let totalEarlyCount = 0;
    let totalEarlyMinutes = 0;
    let totalInScans = 0;
    let onTimeInScans = 0;

    records.forEach(r => {
      if (r.type === 'in') {
        totalInScans++;
        if (r.lateMinutes && r.lateMinutes > 0) {
          totalLateCount++;
          totalLateMinutes += r.lateMinutes;
        } else {
          onTimeInScans++;
        }
      }
      if (r.type === 'out' && r.earlyLeaveMinutes && r.earlyLeaveMinutes > 0) {
        totalEarlyCount++;
        totalEarlyMinutes += r.earlyLeaveMinutes;
      }
    });

    const onTimeRate = totalInScans > 0 ? Math.round((onTimeInScans / totalInScans) * 100) : 100;

    return {
      totalDaysInRange,
      attendedDays,
      fullShiftsDays,
      totalRecordsCount,
      totalLateCount,
      totalLateMinutes,
      totalEarlyCount,
      totalEarlyMinutes,
      totalInScans,
      onTimeRate
    };
  }, [dailySummaries, records]);

  // Filtered daily summaries by tableFilter
  const displayedSummaries = useMemo(() => {
    if (tableFilter === 'all') return dailySummaries;
    if (tableFilter === 'attended') return dailySummaries.filter(d => d.allRecords.length > 0);
    if (tableFilter === 'late_early') return dailySummaries.filter(d => d.totalLateMinutes > 0 || d.totalEarlyLeaveMinutes > 0);
    if (tableFilter === 'missing') return dailySummaries.filter(d => d.allRecords.length === 0 && !d.isWeekendDay);
    if (tableFilter === 'weekend') return dailySummaries.filter(d => d.isWeekendDay);
    return dailySummaries;
  }, [dailySummaries, tableFilter]);

  // Handle Save Manual / Adjusted Attendance Record
  const handleSaveManualAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setIsSavingManual(true);
    setActionError('');
    setActionSuccess('');

    try {
      // Build timestamp from dateStr and timeStr
      const [hours, minutes] = manualForm.timeStr.split(':').map(Number);
      const targetDate = parseISO(manualForm.dateStr);
      targetDate.setHours(hours || 0, minutes || 0, 0, 0);
      const recordTimestamp = targetDate.getTime();

      const payload = {
        id: manualForm.id,
        userId: selectedUser.uid,
        userName: selectedUser.name,
        department: selectedUser.department || '',
        timestamp: recordTimestamp,
        dateStr: manualForm.dateStr,
        status: 'success',
        type: manualForm.type,
        shift: manualForm.shift,
        shiftId: manualForm.shiftId,
        lateMinutes: Number(manualForm.lateMinutes) || 0,
        earlyLeaveMinutes: Number(manualForm.earlyLeaveMinutes) || 0,
        reason: manualForm.reason || 'Admin bổ sung / điều chỉnh',
        location: { lat: config.targetLat, lng: config.targetLng },
        deviceInfo: { source: 'admin_manual_history' }
      };

      const res = await apiFetch('/api/attendance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(res.error || 'Lỗi lưu bản ghi điểm danh');
      }

      setIsManualModalOpen(false);
      setActionSuccess(manualForm.id ? 'Đã cập nhật bản ghi thành công và lưu vào CSDL!' : 'Đã bổ sung bản ghi điểm danh thành công lên CSDL!');
      setTimeout(() => setActionSuccess(''), 4000);
      fetchAttendance();
    } catch (err: any) {
      console.error('Lỗi lưu bản ghi thủ công:', err);
      setActionError(err.message || 'Lỗi khi lưu bản ghi');
    } finally {
      setIsSavingManual(false);
    }
  };

  // Open Edit Modal for a specific record
  const handleOpenEditRecord = (rec: AttendanceRecord) => {
    const recDate = new Date(rec.timestamp);
    setManualForm({
      id: rec.id,
      dateStr: rec.dateStr,
      timeStr: format(recDate, 'HH:mm'),
      shift: rec.shift || (rec.shiftId === 'morning' ? 'Sáng' : (rec.shiftId === 'afternoon' ? 'Chiều' : 'Tối')),
      type: rec.type,
      shiftId: rec.shiftId || (rec.shift?.includes('Sáng') ? 'morning' : 'afternoon'),
      lateMinutes: rec.lateMinutes || 0,
      earlyLeaveMinutes: rec.earlyLeaveMinutes || 0,
      reason: rec.reason || 'Admin điều chỉnh'
    });
    setIsManualModalOpen(true);
  };

  // Open Add Modal for a specific date
  const handleOpenAddForDate = (dateStr: string, defaultShift: 'morning' | 'afternoon' | 'evening' = 'morning', defaultType: 'in' | 'out' = 'in') => {
    const shiftName = defaultShift === 'morning' ? 'Sáng' : (defaultShift === 'afternoon' ? 'Chiều' : 'Tối');
    const defaultTime = defaultShift === 'morning' ? (defaultType === 'in' ? config.morningStart || '07:30' : config.morningEnd || '11:20') : (defaultType === 'in' ? config.afternoonStart || '13:30' : config.afternoonEnd || '17:00');

    setManualForm({
      id: undefined,
      dateStr: dateStr,
      timeStr: defaultTime,
      shift: shiftName,
      type: defaultType,
      shiftId: defaultShift,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      reason: 'Admin bổ sung điểm danh'
    });
    setIsManualModalOpen(true);
  };

  // Handle Delete a record
  const handleDeleteRecord = async (id: string) => {
    setActionError('');
    try {
      const res = await apiFetch(`/api/attendance/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(res.error || 'Không thể xóa bản ghi');
      setRecords(prev => prev.filter(r => r.id !== id));
      setActionSuccess('Đã xóa bản ghi thành công khỏi cơ sở dữ liệu!');
      setTimeout(() => setActionSuccess(''), 3000);
      setDeleteConfirmId(null);
    } catch (err: any) {
      setActionError(err.message || 'Lỗi khi xóa bản ghi');
    }
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    if (!selectedUser) return;

    const dataRows = dailySummaries.map((day, idx) => {
      const morningInTime = day.morningIn ? format(new Date(day.morningIn.timestamp), 'HH:mm:ss') : '';
      const morningOutTime = day.morningOut ? format(new Date(day.morningOut.timestamp), 'HH:mm:ss') : '';
      const afternoonInTime = day.afternoonIn ? format(new Date(day.afternoonIn.timestamp), 'HH:mm:ss') : '';
      const afternoonOutTime = day.afternoonOut ? format(new Date(day.afternoonOut.timestamp), 'HH:mm:ss') : '';
      const eveningInTime = day.eveningIn ? format(new Date(day.eveningIn.timestamp), 'HH:mm:ss') : '';
      const eveningOutTime = day.eveningOut ? format(new Date(day.eveningOut.timestamp), 'HH:mm:ss') : '';

      let dayEval = 'Vắng';
      if (day.statusLabel === 'du_ca') dayEval = 'Đủ 2 ca';
      else if (day.statusLabel === 'mot_ca') dayEval = '1 ca';
      else if (day.statusLabel === 'muon_som') dayEval = 'Đi muộn / Về sớm';
      else if (day.isWeekendDay) dayEval = 'Nghỉ cuối tuần';

      const notes = [
        ...day.allRecords.filter(r => r.reason).map(r => r.reason),
      ].filter(Boolean).join('; ');

      return {
        'STT': idx + 1,
        'Ngày': format(day.dateObj, 'dd/MM/yyyy'),
        'Thứ': day.dayOfWeek,
        'Sáng Vào': morningInTime,
        'Muộn Sáng (phút)': day.morningIn?.lateMinutes || 0,
        'Sáng Ra': morningOutTime,
        'Sớm Sáng (phút)': day.morningOut?.earlyLeaveMinutes || 0,
        'Chiều Vào': afternoonInTime,
        'Muộn Chiều (phút)': day.afternoonIn?.lateMinutes || 0,
        'Chiều Ra': afternoonOutTime,
        'Sớm Chiều (phút)': day.afternoonOut?.earlyLeaveMinutes || 0,
        'Trực Tối Vào': eveningInTime,
        'Trực Tối Ra': eveningOutTime,
        'Đánh Giá Ngày': dayEval,
        'Ghi Chú': notes
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    
    // Auto-fit column widths
    const colWidths = [
      { wch: 6 },  // STT
      { wch: 14 }, // Ngày
      { wch: 12 }, // Thứ
      { wch: 12 }, // Sáng Vào
      { wch: 16 }, // Muộn Sáng
      { wch: 12 }, // Sáng Ra
      { wch: 16 }, // Sớm Sáng
      { wch: 12 }, // Chiều Vào
      { wch: 16 }, // Muộn Chiều
      { wch: 12 }, // Chiều Ra
      { wch: 16 }, // Sớm Chiều
      { wch: 14 }, // Trực Tối Vào
      { wch: 14 }, // Trực Tối Ra
      { wch: 18 }, // Đánh Giá Ngày
      { wch: 30 }, // Ghi Chú
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Lịch sử điểm danh');

    const fileName = `Lich_Su_Diem_Danh_${selectedUser.name.replace(/\s+/g, '_')}_${startDateStr}_den_${endDateStr}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Quick next / prev employee
  const currentFilteredIndex = filteredUsers.findIndex(u => u.uid === selectedUserId);
  const handlePrevUser = () => {
    if (currentFilteredIndex > 0) {
      setSelectedUserId(filteredUsers[currentFilteredIndex - 1].uid);
    }
  };
  const handleNextUser = () => {
    if (currentFilteredIndex >= 0 && currentFilteredIndex < filteredUsers.length - 1) {
      setSelectedUserId(filteredUsers[currentFilteredIndex + 1].uid);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-slate-50 p-4 md:p-6 gap-6">
      {/* Toast Alert Notifications */}
      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-4 py-3 rounded-xl shadow-md flex items-center justify-between animate-fade-in shrink-0">
          <div className="flex items-center gap-2 font-medium text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess('')} className="text-emerald-500 hover:text-emerald-800 font-bold ml-4">✕</button>
        </div>
      )}

      {actionError && (
        <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded-xl shadow-md flex items-center justify-between animate-fade-in shrink-0">
          <div className="flex items-center gap-2 font-medium text-sm">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError('')} className="text-red-500 hover:text-red-800 font-bold ml-4">✕</button>
        </div>
      )}

      {/* Control Bar: Person Selection & Time Range */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col lg:flex-row gap-5 justify-between items-stretch shrink-0">
        {/* Left: Staff Selector */}
        <div className="flex-1 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <User className="w-4 h-4 text-blue-600" />
              Chọn nhân viên theo dõi
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevUser}
                disabled={currentFilteredIndex <= 0}
                className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 rounded hover:bg-slate-100 transition-colors"
                title="Nhân viên trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px] text-slate-400 font-mono">
                {currentFilteredIndex >= 0 ? `${currentFilteredIndex + 1}/${filteredUsers.length}` : '-'}
              </span>
              <button
                onClick={handleNextUser}
                disabled={currentFilteredIndex < 0 || currentFilteredIndex >= filteredUsers.length - 1}
                className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 rounded hover:bg-slate-100 transition-colors"
                title="Nhân viên kế tiếp"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Department Filter */}
            <div className="relative">
              <Building className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
              >
                <option value="">-- Tất cả Khoa / Phòng ({departments.length}) --</option>
                {departments.map(d => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* Free Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Tìm tên hoặc mã NV..."
                value={userSearchText}
                onChange={(e) => setUserSearchText(e.target.value)}
                className="w-full pl-9 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
              />
              {userSearchText && (
                <button
                  type="button"
                  onClick={() => setUserSearchText('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Employee Dropdown */}
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-blue-50/50 border border-blue-200 rounded-xl text-xs sm:text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
              >
                {filteredUsers.length === 0 ? (
                  <option value="">Không tìm thấy nhân viên</option>
                ) : (
                  filteredUsers.map(u => (
                    <option key={u.uid} value={u.uid}>
                      {u.name} - [{u.department || 'Chưa phân khoa'}] ({u.position || 'Nhân viên'}) {(u.is_hidden || u.status === 'inactive' || u.status === 'locked') ? `[🔒 Đã khóa: ${u.lock_reason || 'Tạm dừng'}]` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Right: Time Range Selector */}
        <div className="flex-1 flex flex-col gap-3 lg:border-l lg:border-slate-200 lg:pl-5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-blue-600" />
            Khoảng thời gian tra cứu
          </label>

          {/* Presets Button Row */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <button
              onClick={() => applyPreset('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                timePreset === 'today' 
                  ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Hôm nay
            </button>
            <button
              onClick={() => applyPreset('7days')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                timePreset === '7days' 
                  ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              7 ngày gần nhất
            </button>
            <button
              onClick={() => applyPreset('1month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                timePreset === '1month' 
                  ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              1 Tháng gần nhất
            </button>
            <button
              onClick={() => applyPreset('this_month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                timePreset === 'this_month' 
                  ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tháng này
            </button>
            <button
              onClick={() => applyPreset('last_month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                timePreset === 'last_month' 
                  ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tháng trước
            </button>
            <button
              onClick={() => applyPreset('3months')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                timePreset === '3months' 
                  ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              3 Tháng gần nhất
            </button>
          </div>

          {/* Date Picker Range Inputs */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
              <span className="text-slate-400 font-semibold mr-1.5">Từ:</span>
              <input
                type="date"
                value={startDateStr}
                onChange={(e) => {
                  setStartDateStr(e.target.value);
                  setTimePreset('custom');
                }}
                className="w-full bg-transparent font-medium text-slate-700 outline-none"
              />
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
              <span className="text-slate-400 font-semibold mr-1.5">Đến:</span>
              <input
                type="date"
                value={endDateStr}
                onChange={(e) => {
                  setEndDateStr(e.target.value);
                  setTimePreset('custom');
                }}
                className="w-full bg-transparent font-medium text-slate-700 outline-none"
              />
            </div>
            <button
              onClick={fetchAttendance}
              disabled={loading}
              title="Làm mới dữ liệu từ CSDL"
              className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl border border-blue-200 transition-colors shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Selected Person Card + Analytics KPI Widgets */}
      {selectedUser && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 shrink-0">
          {/* User Profile Info Card (4 cols) */}
          <div className="lg:col-span-4 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 rounded-2xl p-5 text-white shadow-md flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
            
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-lg font-bold text-blue-300 shrink-0 shadow-inner">
                    {selectedUser.name.split(' ').slice(-2).map(n => n[0]).join('')}
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-white leading-tight">{selectedUser.name}</h3>
                    <p className="text-xs text-blue-200 font-medium mt-0.5">{selectedUser.department || 'Chưa cập nhật khoa'}</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded-full">
                  ID: {selectedUser.uid}
                </span>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-700/60 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 text-[11px] block">Chức vụ</span>
                  <span className="font-semibold text-slate-200">{selectedUser.position || 'Nhân viên'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Vai trò</span>
                  <span className="font-semibold text-slate-200 capitalize">{selectedUser.role === 'admin' ? 'Quản trị' : (selectedUser.role === 'super_admin' ? 'Quản trị cấp cao' : 'Nhân sự')}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-300 font-medium">
                Khoảng: <strong className="text-white">{format(parseISO(startDateStr), 'dd/MM/yyyy')}</strong> - <strong className="text-white">{format(parseISO(endDateStr), 'dd/MM/yyyy')}</strong>
              </span>
              <button
                onClick={handleExportExcel}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-sm shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Xuất Excel
              </button>
            </div>
          </div>

          {/* 4 KPI Metrics Cards (8 cols) */}
          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {/* Metric 1: Attended Days */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Ngày có mặt</span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-slate-800">
                  {stats.attendedDays} <span className="text-xs font-semibold text-slate-400">/ {stats.totalDaysInRange} ngày</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-medium">
                  {stats.fullShiftsDays} ngày đủ 2 ca
                </div>
              </div>
            </div>

            {/* Metric 2: Total Scans */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Lượt điểm danh</span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-indigo-700">
                  {stats.totalRecordsCount} <span className="text-xs font-semibold text-slate-400">lượt</span>
                </div>
                <div className="text-[11px] text-indigo-600 font-bold mt-1">
                  Đúng giờ: {stats.onTimeRate}%
                </div>
              </div>
            </div>

            {/* Metric 3: Late Check-ins */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Đi muộn</span>
                <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-red-600">
                  {stats.totalLateCount} <span className="text-xs font-semibold text-slate-400">lần</span>
                </div>
                <div className="text-[11px] text-red-500 font-bold mt-1">
                  Tổng {stats.totalLateMinutes} phút muộn
                </div>
              </div>
            </div>

            {/* Metric 4: Early Leaves */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Về sớm</span>
                <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-orange-600">
                  {stats.totalEarlyCount} <span className="text-xs font-semibold text-slate-400">lần</span>
                </div>
                <div className="text-[11px] text-orange-500 font-bold mt-1">
                  Tổng {stats.totalEarlyMinutes} phút sớm
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Table: Detailed Daily Breakdown */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden flex-1">
        {/* Table Header Controls */}
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              Chi tiết điểm danh từng ngày ({displayedSummaries.length} ngày)
            </h3>

            {/* Filter Tabs for table */}
            <div className="flex items-center bg-slate-200/70 p-0.5 rounded-xl text-xs font-semibold ml-2">
              <button
                onClick={() => setTableFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-all ${tableFilter === 'all' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Tất cả ({dailySummaries.length})
              </button>
              <button
                onClick={() => setTableFilter('attended')}
                className={`px-2.5 py-1 rounded-lg transition-all ${tableFilter === 'attended' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Có đi làm ({stats.attendedDays})
              </button>
              <button
                onClick={() => setTableFilter('late_early')}
                className={`px-2.5 py-1 rounded-lg transition-all ${tableFilter === 'late_early' ? 'bg-white text-red-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Muộn / Sớm ({dailySummaries.filter(d => d.totalLateMinutes > 0 || d.totalEarlyLeaveMinutes > 0).length})
              </button>
              <button
                onClick={() => setTableFilter('missing')}
                className={`px-2.5 py-1 rounded-lg transition-all ${tableFilter === 'missing' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Chưa điểm danh ({dailySummaries.filter(d => d.allRecords.length === 0 && !d.isWeekendDay).length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && selectedUser && (
              <button
                onClick={() => handleOpenAddForDate(format(new Date(), 'yyyy-MM-dd'))}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Bổ sung công (Lưu CSDL)
              </button>
            )}
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-x-auto overflow-y-auto min-h-[380px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="text-xs font-medium">Đang tải lịch sử điểm danh từ cơ sở dữ liệu...</span>
            </div>
          ) : displayedSummaries.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-2">
              <Calendar className="w-10 h-10 text-slate-300" />
              <span className="text-sm font-medium">Không có dữ liệu trong khoảng thời gian đã chọn.</span>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase tracking-wider text-[11px] sticky top-0 z-10 border-b border-slate-200 shadow-xs">
                <tr>
                  <th className="px-3.5 py-3 border-r border-slate-200 w-32">Ngày & Thứ</th>
                  <th className="px-3 py-3 border-r border-slate-200 text-center bg-blue-50/70 text-blue-900 w-36">
                    Ca Sáng Vào
                  </th>
                  <th className="px-3 py-3 border-r border-slate-200 text-center bg-blue-50/40 text-blue-900 w-36">
                    Ca Sáng Ra
                  </th>
                  <th className="px-3 py-3 border-r border-slate-200 text-center bg-indigo-50/70 text-indigo-900 w-36">
                    Ca Chiều Vào
                  </th>
                  <th className="px-3 py-3 border-r border-slate-200 text-center bg-indigo-50/40 text-indigo-900 w-36">
                    Ca Chiều Ra
                  </th>
                  <th className="px-3 py-3 border-r border-slate-200 text-center w-28">Trực Tối</th>
                  <th className="px-3 py-3 border-r border-slate-200 text-center w-28">Tổng kết</th>
                  <th className="px-3 py-3 text-right w-24">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white font-medium text-slate-700">
                {displayedSummaries.map((day) => {
                  return (
                    <tr 
                      key={day.dateStr} 
                      className={`hover:bg-blue-50/30 transition-colors ${
                        day.isTodayDay ? 'bg-amber-50/40 font-semibold' : (day.isWeekendDay ? 'bg-slate-50/70' : '')
                      }`}
                    >
                      {/* Column 1: Date & Day */}
                      <td className="px-3.5 py-2.5 border-r border-slate-100 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-slate-900 text-sm">
                            {format(day.dateObj, 'dd/MM/yyyy')}
                          </span>
                          {day.isTodayDay && (
                            <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded-full">
                              Hôm nay
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium capitalize">
                          {day.dayOfWeek} {day.isWeekendDay && <span className="text-slate-400">(Cuối tuần)</span>}
                        </div>
                      </td>

                      {/* Column 2: Morning In */}
                      <td className="px-2 py-2 border-r border-slate-100 text-center align-middle">
                        {day.morningIn ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-bold text-slate-900 text-xs font-mono">
                              {format(new Date(day.morningIn.timestamp), 'HH:mm:ss')}
                            </span>
                            {day.morningIn.lateMinutes && day.morningIn.lateMinutes > 0 ? (
                              <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.2 rounded">
                                Muộn {day.morningIn.lateMinutes}p
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                                Đúng giờ
                              </span>
                            )}
                            <button
                              onClick={() => setSelectedRecordForDetail(day.morningIn!)}
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5"
                            >
                              <MapPin className="w-2.5 h-2.5" /> Chi tiết
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <span className="text-slate-300 italic text-[11px]">-</span>
                            {canEdit && (
                              <button
                                onClick={() => handleOpenAddForDate(day.dateStr, 'morning', 'in')}
                                className="text-[10px] text-blue-500 hover:text-blue-700 font-bold opacity-0 hover:opacity-100 transition-opacity"
                              >
                                + Bổ sung
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Column 3: Morning Out */}
                      <td className="px-2 py-2 border-r border-slate-100 text-center align-middle">
                        {day.morningOut ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-bold text-slate-900 text-xs font-mono">
                              {format(new Date(day.morningOut.timestamp), 'HH:mm:ss')}
                            </span>
                            {day.morningOut.earlyLeaveMinutes && day.morningOut.earlyLeaveMinutes > 0 ? (
                              <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.2 rounded">
                                Sớm {day.morningOut.earlyLeaveMinutes}p
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                                Đủ giờ
                              </span>
                            )}
                            <button
                              onClick={() => setSelectedRecordForDetail(day.morningOut!)}
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5"
                            >
                              <MapPin className="w-2.5 h-2.5" /> Chi tiết
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <span className="text-slate-300 italic text-[11px]">-</span>
                            {canEdit && (
                              <button
                                onClick={() => handleOpenAddForDate(day.dateStr, 'morning', 'out')}
                                className="text-[10px] text-blue-500 hover:text-blue-700 font-bold opacity-0 hover:opacity-100 transition-opacity"
                              >
                                + Bổ sung
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Column 4: Afternoon In */}
                      <td className="px-2 py-2 border-r border-slate-100 text-center align-middle">
                        {day.afternoonIn ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-bold text-slate-900 text-xs font-mono">
                              {format(new Date(day.afternoonIn.timestamp), 'HH:mm:ss')}
                            </span>
                            {day.afternoonIn.lateMinutes && day.afternoonIn.lateMinutes > 0 ? (
                              <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.2 rounded">
                                Muộn {day.afternoonIn.lateMinutes}p
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                                Đúng giờ
                              </span>
                            )}
                            <button
                              onClick={() => setSelectedRecordForDetail(day.afternoonIn!)}
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5"
                            >
                              <MapPin className="w-2.5 h-2.5" /> Chi tiết
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <span className="text-slate-300 italic text-[11px]">-</span>
                            {canEdit && (
                              <button
                                onClick={() => handleOpenAddForDate(day.dateStr, 'afternoon', 'in')}
                                className="text-[10px] text-blue-500 hover:text-blue-700 font-bold opacity-0 hover:opacity-100 transition-opacity"
                              >
                                + Bổ sung
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Column 5: Afternoon Out */}
                      <td className="px-2 py-2 border-r border-slate-100 text-center align-middle">
                        {day.afternoonOut ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-bold text-slate-900 text-xs font-mono">
                              {format(new Date(day.afternoonOut.timestamp), 'HH:mm:ss')}
                            </span>
                            {day.afternoonOut.earlyLeaveMinutes && day.afternoonOut.earlyLeaveMinutes > 0 ? (
                              <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.2 rounded">
                                Sớm {day.afternoonOut.earlyLeaveMinutes}p
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                                Đủ giờ
                              </span>
                            )}
                            <button
                              onClick={() => setSelectedRecordForDetail(day.afternoonOut!)}
                              className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5"
                            >
                              <MapPin className="w-2.5 h-2.5" /> Chi tiết
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <span className="text-slate-300 italic text-[11px]">-</span>
                            {canEdit && (
                              <button
                                onClick={() => handleOpenAddForDate(day.dateStr, 'afternoon', 'out')}
                                className="text-[10px] text-blue-500 hover:text-blue-700 font-bold opacity-0 hover:opacity-100 transition-opacity"
                              >
                                + Bổ sung
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Column 6: Evening Shift */}
                      <td className="px-2 py-2 border-r border-slate-100 text-center align-middle">
                        {day.eveningIn || day.eveningOut ? (
                          <div className="flex flex-col items-center text-[10px]">
                            {day.eveningIn && (
                              <span className="font-bold text-purple-700">Vào: {format(new Date(day.eveningIn.timestamp), 'HH:mm')}</span>
                            )}
                            {day.eveningOut && (
                              <span className="font-bold text-purple-700">Ra: {format(new Date(day.eveningOut.timestamp), 'HH:mm')}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 italic text-[11px]">-</span>
                        )}
                      </td>

                      {/* Column 7: Day Summary Status */}
                      <td className="px-2 py-2 border-r border-slate-100 text-center align-middle whitespace-nowrap">
                        {day.statusLabel === 'du_ca' && (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" /> Đủ 2 ca
                          </span>
                        )}
                        {day.statusLabel === 'mot_ca' && (
                          <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            1 ca (Nửa ngày)
                          </span>
                        )}
                        {day.statusLabel === 'muon_som' && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            Muộn / Sớm
                          </span>
                        )}
                        {day.statusLabel === 'vang' && (
                          <span className="bg-slate-100 text-slate-500 text-[10px] font-medium px-2 py-0.5 rounded-full">
                            Vắng
                          </span>
                        )}
                        {day.statusLabel === 'cuoi_tuan' && (
                          <span className="bg-slate-100 text-slate-400 text-[10px] font-medium px-2 py-0.5 rounded-full">
                            Nghỉ cuối tuần
                          </span>
                        )}
                      </td>

                      {/* Column 8: Actions */}
                      <td className="px-3 py-2 text-right whitespace-nowrap align-middle">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <button
                              onClick={() => handleOpenAddForDate(day.dateStr)}
                              title="Bổ sung bản ghi cho ngày này"
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {day.allRecords.length > 0 && canEdit && (
                            <button
                              onClick={() => handleOpenEditRecord(day.allRecords[0])}
                              title="Sửa bản ghi điểm danh"
                              className="p-1 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {day.allRecords.length > 0 && canDelete && (
                            deleteConfirmId === day.allRecords[0]?.id ? (
                              <button
                                onClick={() => handleDeleteRecord(day.allRecords[0].id)}
                                className="text-[10px] bg-red-600 text-white font-bold px-1.5 py-0.5 rounded animate-pulse"
                              >
                                Xóa?
                              </button>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(day.allRecords[0].id)}
                                title="Xóa bản ghi"
                                className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL 1: Detail Location / GPS / Device Modal */}
      {selectedRecordForDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                Chi tiết bản ghi điểm danh
              </h3>
              <button
                onClick={() => setSelectedRecordForDetail(null)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl">
                <div>
                  <span className="text-slate-400 block text-[11px]">Họ tên</span>
                  <span className="font-bold text-slate-800 text-sm">{selectedRecordForDetail.userName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Mã NV</span>
                  <span className="font-mono font-bold text-blue-600">{selectedRecordForDetail.userId}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl">
                <div>
                  <span className="text-slate-400 block text-[11px]">Thời gian điểm danh</span>
                  <span className="font-bold text-slate-800">
                    {format(new Date(selectedRecordForDetail.timestamp), 'HH:mm:ss - dd/MM/yyyy')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Ca & Loại</span>
                  <span className="font-bold text-slate-800">
                    {selectedRecordForDetail.shift || '-'} ({selectedRecordForDetail.type === 'in' ? 'Vào ca' : 'Ra ca'})
                  </span>
                </div>
              </div>

              <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-100">
                <span className="text-blue-600 font-bold block text-[11px] mb-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Tọa độ GPS ghi nhận
                </span>
                <div className="font-mono text-slate-700 text-xs">
                  Lat: {selectedRecordForDetail.location?.lat || 'N/A'}, Lng: {selectedRecordForDetail.location?.lng || 'N/A'}
                </div>
                {selectedRecordForDetail.reason && (
                  <div className="mt-1 text-slate-600 text-[11px]">
                    <strong>Ghi chú:</strong> {selectedRecordForDetail.reason}
                  </div>
                )}
              </div>

              <div className="bg-slate-50 p-3 rounded-xl">
                <span className="text-slate-400 block text-[11px] mb-1">Thông tin thiết bị</span>
                <div className="text-[11px] text-slate-600 font-mono break-all">
                  {selectedRecordForDetail.deviceInfo ? JSON.stringify(selectedRecordForDetail.deviceInfo) : 'Không có'}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button
                onClick={() => setSelectedRecordForDetail(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Add / Edit Manual Attendance Modal (Direct DB Save) */}
      {isManualModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-blue-600" />
                  {manualForm.id ? 'Chỉnh sửa bản ghi điểm danh' : 'Bổ sung điểm danh lưu CSDL'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nhân viên: <strong className="text-slate-800">{selectedUser.name}</strong> ({selectedUser.department})
                </p>
              </div>
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManualAttendance} className="py-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Ngày điểm danh</label>
                  <input
                    type="date"
                    required
                    value={manualForm.dateStr}
                    onChange={(e) => setManualForm({ ...manualForm, dateStr: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Giờ điểm danh (HH:mm)</label>
                  <input
                    type="time"
                    required
                    value={manualForm.timeStr}
                    onChange={(e) => setManualForm({ ...manualForm, timeStr: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Khung Ca</label>
                  <select
                    value={manualForm.shiftId}
                    onChange={(e) => {
                      const sid = e.target.value;
                      const sName = sid === 'morning' ? 'Sáng' : (sid === 'afternoon' ? 'Chiều' : 'Tối');
                      setManualForm({ ...manualForm, shiftId: sid, shift: sName });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                  >
                    <option value="morning">Ca Sáng (07:30 - 11:20)</option>
                    <option value="afternoon">Ca Chiều (13:30 - 17:00)</option>
                    <option value="evening">Ca Tối / Trực</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Loại điểm danh</label>
                  <select
                    value={manualForm.type}
                    onChange={(e) => setManualForm({ ...manualForm, type: e.target.value as 'in' | 'out' })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                  >
                    <option value="in">Vào ca (Check-in)</option>
                    <option value="out">Ra ca (Check-out)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Phút đi muộn</label>
                  <input
                    type="number"
                    min="0"
                    value={manualForm.lateMinutes}
                    onChange={(e) => setManualForm({ ...manualForm, lateMinutes: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Phút về sớm</label>
                  <input
                    type="number"
                    min="0"
                    value={manualForm.earlyLeaveMinutes}
                    onChange={(e) => setManualForm({ ...manualForm, earlyLeaveMinutes: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Lý do điều chỉnh / Ghi chú</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Quên điểm danh / Đi công tác / Đề nghị bổ sung..."
                  value={manualForm.reason}
                  onChange={(e) => setManualForm({ ...manualForm, reason: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSavingManual}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                >
                  {isSavingManual ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Đang lưu vào CSDL...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {manualForm.id ? 'Cập nhật CSDL' : 'Lưu vào CSDL'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
