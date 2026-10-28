import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building, Calendar, Search, Filter, Download, UserX, CheckCircle, 
  AlertTriangle, Clock, Users, ChevronLeft, ChevronRight, Eye, 
  FileSpreadsheet, Printer, ArrowUpDown, RefreshCw, AlertCircle, Info, CalendarDays
} from 'lucide-react';
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, 
  isFuture, isToday, parseISO, getDaysInMonth, addMonths, subMonths 
} from 'date-fns';
import { vi } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { apiFetch } from '../lib/api';

interface DepartmentMonthlyReportProps {
  users: any[];
  departments: any[];
  canEdit?: boolean;
  canDelete?: boolean;
}

export interface EmployeeMonthlySummary {
  userId: string;
  userName: string;
  department: string;
  position?: string;
  email?: string;
  status?: string;
  is_hidden?: boolean;
  totalDaysInMonth: number;
  pastWorkingDaysCount: number; // Số ngày làm việc đã qua trong tháng (trừ tương lai)
  attendedDaysCount: number; // Số ngày có chấm công
  absentDaysCount: number; // Số ngày KHÔNG chấm công trong các ngày đã qua
  absentDates: string[]; // Danh sách các ngày không chấm công (dd/MM)
  lateTimesCount: number; // Số lần đi muộn
  totalLateMinutes: number; // Tổng số phút muộn
  earlyTimesCount: number; // Số lần về sớm
  attendanceRate: number; // Tỷ lệ chuyên cần %
  dailyStatus: Record<string, { // key: yyyy-MM-dd
    hasRecord: boolean;
    morningIn?: any;
    morningOut?: any;
    afternoonIn?: any;
    afternoonOut?: any;
    isLate: boolean;
    lateMinutes: number;
    isEarly: boolean;
    isSunday: boolean;
    isSaturday: boolean;
    isFutureDay: boolean;
    isTodayDay: boolean;
  }>;
}

export const DepartmentMonthlyReport: React.FC<DepartmentMonthlyReportProps> = ({
  users = [],
  departments = [],
  canEdit = false,
  canDelete = false
}) => {
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => new Date());
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'all_absent' | 'has_absent' | 'full' | 'late'>('all');
  const [viewMode, setViewMode] = useState<'summary' | 'matrix'>('summary');
  const [loading, setLoading] = useState<boolean>(false);
  const [monthRecords, setMonthRecords] = useState<any[]>([]);
  const [selectedEmployeeDetail, setSelectedEmployeeDetail] = useState<EmployeeMonthlySummary | null>(null);

  // Fetch all attendance records for the selected month
  const fetchMonthlyRecords = async (targetMonth: Date) => {
    setLoading(true);
    try {
      const sTimestamp = startOfMonth(targetMonth).getTime();
      const eTimestamp = endOfMonth(targetMonth).getTime();
      
      const res = await apiFetch(`/api/attendance?_t=${Date.now()}&startTimestamp=${sTimestamp}&endTimestamp=${eTimestamp}&orderByStr=asc`);
      if (res.ok && Array.isArray(res.data)) {
        setMonthRecords(res.data);
      } else {
        setMonthRecords([]);
      }
    } catch (err) {
      console.error("Lỗi khi tải dữ liệu chấm công tháng:", err);
      setMonthRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthlyRecords(selectedMonth);
  }, [selectedMonth]);

  // Generate list of days in the selected month
  const daysInMonthList = useMemo(() => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);
    return eachDayOfInterval({ start, end });
  }, [selectedMonth]);

  // Compute monthly summary per employee
  const employeeSummaries: EmployeeMonthlySummary[] = useMemo(() => {
    // Lọc danh sách nhân viên theo trạng thái hoạt động (bỏ các nhân viên bị ẩn hoàn toàn nếu muốn)
    const activeUsers = users.filter(u => !u.is_hidden && u.status !== 'inactive' && u.status !== 'locked');

    // Nhóm records theo userId hoặc userName + dateStr
    const recordsByUserDate: Record<string, Record<string, any[]>> = {};
    
    monthRecords.forEach(r => {
      const uid = (r.userId || r.user_id || '').trim();
      const uName = (r.userName || r.user_name || '').trim().toLowerCase();
      const dateStr = r.dateStr || (r.timestamp ? format(new Date(r.timestamp), 'yyyy-MM-dd') : '');
      if (!dateStr) return;

      const userKey = uid || uName;
      if (!userKey) return;

      if (!recordsByUserDate[userKey]) {
        recordsByUserDate[userKey] = {};
      }
      if (!recordsByUserDate[userKey][dateStr]) {
        recordsByUserDate[userKey][dateStr] = [];
      }
      recordsByUserDate[userKey][dateStr].push(r);
    });

    const todayDateStr = format(new Date(), 'yyyy-MM-dd');
    const isCurrentMonth = format(selectedMonth, 'yyyy-MM') === format(new Date(), 'yyyy-MM');

    return activeUsers.map(emp => {
      const empUid = (emp.uid || '').trim();
      const empName = (emp.name || '').trim();
      const empNameKey = empName.toLowerCase();
      
      // Lấy records của nhân viên này
      const userRecordsByDate = recordsByUserDate[empUid] || recordsByUserDate[empNameKey] || {};

      let attendedDays = 0;
      let pastWorkingDays = 0;
      const absentDatesList: string[] = [];
      let lateCount = 0;
      let totalLateMins = 0;
      let earlyCount = 0;

      const dailyStatus: EmployeeMonthlySummary['dailyStatus'] = {};

      daysInMonthList.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayFormatted = format(day, 'dd/MM');
        const dayRecords = userRecordsByDate[dateStr] || [];
        
        const isSun = day.getDay() === 0;
        const isSat = day.getDay() === 6;
        const isFut = isFuture(day) && !isToday(day);
        const isTod = isToday(day);

        // Phân loại records trong ngày
        let mIn = dayRecords.find((r: any) => r.type === 'in' && (!r.shiftType || r.shiftType === 'morning' || r.shiftType === 'default'));
        let mOut = dayRecords.find((r: any) => r.type === 'out' && (!r.shiftType || r.shiftType === 'morning' || r.shiftType === 'default'));
        let aIn = dayRecords.find((r: any) => r.type === 'in' && r.shiftType === 'afternoon');
        let aOut = dayRecords.find((r: any) => r.type === 'out' && r.shiftType === 'afternoon');

        if (!mIn && dayRecords.length > 0) {
          mIn = dayRecords.find((r: any) => r.type === 'in');
        }
        if (!mOut && dayRecords.length > 0) {
          mOut = dayRecords.find((r: any) => r.type === 'out');
        }

        const hasRec = dayRecords.length > 0;
        let dayIsLate = false;
        let dayLateMins = 0;
        let dayIsEarly = false;

        if (mIn && mIn.lateMinutes && mIn.lateMinutes > 0) {
          dayIsLate = true;
          dayLateMins += mIn.lateMinutes;
        }
        if (aIn && aIn.lateMinutes && aIn.lateMinutes > 0) {
          dayIsLate = true;
          dayLateMins += aIn.lateMinutes;
        }
        if (mOut && mOut.earlyMinutes && mOut.earlyMinutes > 0) {
          dayIsEarly = true;
        }
        if (aOut && aOut.earlyMinutes && aOut.earlyMinutes > 0) {
          dayIsEarly = true;
        }

        dailyStatus[dateStr] = {
          hasRecord: hasRec,
          morningIn: mIn,
          morningOut: mOut,
          afternoonIn: aIn,
          afternoonOut: aOut,
          isLate: dayIsLate,
          lateMinutes: dayLateMins,
          isEarly: dayIsEarly,
          isSunday: isSun,
          isSaturday: isSat,
          isFutureDay: isFut,
          isTodayDay: isTod
        };

        // Chỉ tính toán số ngày vắng / không chấm công cho các ngày đã qua (hoặc hôm nay)
        const isPastOrToday = !isFut;
        if (isPastOrToday) {
          pastWorkingDays++;
          if (hasRec) {
            attendedDays++;
            if (dayIsLate) {
              lateCount++;
              totalLateMins += dayLateMins;
            }
            if (dayIsEarly) {
              earlyCount++;
            }
          } else {
            // Không có lượt chấm công nào trong ngày đã qua
            absentDatesList.push(dayFormatted);
          }
        }
      });

      const absentCount = absentDatesList.length;
      const rate = pastWorkingDays > 0 ? Math.round((attendedDays / pastWorkingDays) * 100) : 0;

      return {
        userId: empUid,
        userName: empName,
        department: emp.department || 'Chưa phân khoa',
        position: emp.position || 'Nhân viên',
        email: emp.email || '',
        status: emp.status || 'active',
        is_hidden: emp.is_hidden || false,
        totalDaysInMonth: daysInMonthList.length,
        pastWorkingDaysCount: pastWorkingDays,
        attendedDaysCount: attendedDays,
        absentDaysCount: absentCount,
        absentDates: absentDatesList,
        lateTimesCount: lateCount,
        totalLateMinutes: totalLateMins,
        earlyTimesCount: earlyCount,
        attendanceRate: rate,
        dailyStatus
      };
    });
  }, [users, monthRecords, daysInMonthList, selectedMonth]);

  // Lọc theo Khoa/Phòng và Tình trạng không chấm công
  const filteredSummaries = useMemo(() => {
    return employeeSummaries.filter(emp => {
      // 1. Lọc Khoa / Phòng
      if (selectedDepartment && emp.department !== selectedDepartment) {
        return false;
      }

      // 2. Tìm kiếm tên hoặc mã NV
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = emp.userName.toLowerCase().includes(query);
        const matchUid = emp.userId.toLowerCase().includes(query);
        const matchDept = emp.department.toLowerCase().includes(query);
        if (!matchName && !matchUid && !matchDept) return false;
      }

      // 3. Lọc theo tình trạng không chấm công
      if (filterMode === 'all_absent') {
        // Vắng 100% (chưa từng chấm công ngày nào trong các ngày đã qua)
        return emp.pastWorkingDaysCount > 0 && emp.attendedDaysCount === 0;
      }
      if (filterMode === 'has_absent') {
        // Có ít nhất 1 ngày không chấm công
        return emp.absentDaysCount > 0;
      }
      if (filterMode === 'full') {
        // Chấm công đầy đủ 100% các ngày đã qua
        return emp.pastWorkingDaysCount > 0 && emp.absentDaysCount === 0;
      }
      if (filterMode === 'late') {
        // Có đi muộn
        return emp.lateTimesCount > 0;
      }

      return true;
    });
  }, [employeeSummaries, selectedDepartment, searchQuery, filterMode]);

  // Thống kê nhanh toàn bộ cho khoa phòng đã chọn
  const statisticsOverview = useMemo(() => {
    const targetList = employeeSummaries.filter(emp => !selectedDepartment || emp.department === selectedDepartment);
    const totalStaff = targetList.length;
    const allAbsentCount = targetList.filter(e => e.pastWorkingDaysCount > 0 && e.attendedDaysCount === 0).length;
    const hasAbsentCount = targetList.filter(e => e.absentDaysCount > 0 && e.attendedDaysCount > 0).length;
    const fullAttendanceCount = targetList.filter(e => e.pastWorkingDaysCount > 0 && e.absentDaysCount === 0).length;
    const totalLateEvents = targetList.reduce((sum, e) => sum + e.lateTimesCount, 0);

    return {
      totalStaff,
      allAbsentCount,
      hasAbsentCount,
      fullAttendanceCount,
      totalLateEvents
    };
  }, [employeeSummaries, selectedDepartment]);

  // Xuất file Excel Báo Cáo Khoa/Phòng Cả Tháng (2 Sheet)
  const exportToExcel = () => {
    const monthStr = format(selectedMonth, 'MM-yyyy');
    const deptTitle = selectedDepartment ? selectedDepartment : 'Toan_Benh_Vien';
    const fileName = `BaoCao_ChuyenCan_KhongChamCong_${deptTitle}_Thang_${monthStr}.xlsx`;

    // Sắp xếp theo Khoa / Phòng, sau đó theo Họ và Tên
    const sortedSummaries = [...filteredSummaries].sort((a, b) => {
      const deptA = (a.department || '').trim();
      const deptB = (b.department || '').trim();
      const deptCompare = deptA.localeCompare(deptB, 'vi', { sensitivity: 'base' });
      if (deptCompare !== 0) return deptCompare;

      const nameA = (a.userName || '').trim();
      const nameB = (b.userName || '').trim();
      return nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
    });

    // Sheet 1: Danh sách tổng hợp & ngày không chấm công
    const summaryData = sortedSummaries.map((emp, index) => {
      let statusText = 'Đầy đủ';
      if (emp.pastWorkingDaysCount > 0 && emp.attendedDaysCount === 0) {
        statusText = 'VẮNG TOÀN BỘ (0 lượt chấm công)';
      } else if (emp.absentDaysCount > 0) {
        statusText = `Vắng ${emp.absentDaysCount} ngày`;
      }

      return {
        'STT': index + 1,
        'Mã NV': emp.userId || '-',
        'Họ và Tên': emp.userName,
        'Khoa / Phòng': emp.department,
        'Chức vụ': emp.position || 'Nhân viên',
        'Tổng ngày đã qua': emp.pastWorkingDaysCount,
        'Số ngày có chấm công': emp.attendedDaysCount,
        'Số ngày KHÔNG chấm công (Vắng)': emp.absentDaysCount,
        'Chi tiết các ngày không chấm công': emp.absentDates.join(', ') || 'Không có',
        'Số lần đi muộn': emp.lateTimesCount,
        'Tổng phút muộn': emp.totalLateMinutes,
        'Tỷ lệ chuyên cần (%)': `${emp.attendanceRate}%`,
        'Trạng thái': statusText
      };
    });

    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary['!cols'] = [
      { wch: 6 },  // STT
      { wch: 12 }, // Mã NV
      { wch: 25 }, // Họ tên
      { wch: 25 }, // Khoa/Phòng
      { wch: 18 }, // Chức vụ
      { wch: 16 }, // Ngày đã qua
      { wch: 20 }, // Có chấm công
      { wch: 26 }, // Không chấm công
      { wch: 35 }, // Danh sách ngày vắng
      { wch: 15 }, // Số lần muộn
      { wch: 15 }, // Phút muộn
      { wch: 18 }, // Tỷ lệ
      { wch: 28 }  // Trạng thái
    ];

    // Sheet 2: Ma trận chấm công từng ngày 1..31
    const matrixData = sortedSummaries.map((emp, index) => {
      const rowObj: any = {
        'STT': index + 1,
        'Mã NV': emp.userId || '-',
        'Họ và Tên': emp.userName,
        'Khoa / Phòng': emp.department
      };

      daysInMonthList.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayNumber = format(day, 'd');
        const status = emp.dailyStatus[dateStr];

        if (!status) {
          rowObj[`Ngày ${dayNumber}`] = '-';
          return;
        }

        if (status.isFutureDay) {
          rowObj[`Ngày ${dayNumber}`] = '';
        } else if (status.hasRecord) {
          if (status.isLate) {
            rowObj[`Ngày ${dayNumber}`] = `M (${status.lateMinutes}p)`;
          } else {
            rowObj[`Ngày ${dayNumber}`] = 'X';
          }
        } else {
          // Không chấm công
          rowObj[`Ngày ${dayNumber}`] = 'V';
        }
      });

      rowObj['Tổng có mặt'] = emp.attendedDaysCount;
      rowObj['Tổng vắng / Không chấm'] = emp.absentDaysCount;
      rowObj['Tổng đi muộn'] = emp.lateTimesCount;
      rowObj['Tỷ lệ %'] = `${emp.attendanceRate}%`;

      return rowObj;
    });

    const wsMatrix = XLSX.utils.json_to_sheet(matrixData);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, "TongHop_KhongChamCong");
    XLSX.utils.book_append_sheet(wb, wsMatrix, "MaTran_ChiTiet_Thang");

    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Thanh Tiêu Đề & Bộ Điều Khiển Chính */}
      <div className="bg-white border-b border-slate-200 p-4 shrink-0 shadow-xs flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Báo cáo Điểm danh & Nhân viên Không Chấm Công Cả Tháng
                <span className="bg-blue-100 text-blue-800 text-[11px] font-extrabold px-2 py-0.5 rounded-full border border-blue-200">
                  Tháng {format(selectedMonth, 'MM/yyyy')}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Thống kê chi tiết chuyên cần, phát hiện nhân viên không chấm công theo từng khoa phòng
              </p>
            </div>
          </div>

          {/* Bộ chọn tháng & Nút xuất file */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Chuyển tháng */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setSelectedMonth(prev => subMonths(prev, 1))}
                className="p-1.5 hover:bg-white hover:text-blue-600 rounded-lg text-slate-600 transition-colors"
                title="Tháng trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-3 py-1 text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Tháng {format(selectedMonth, 'MM/yyyy')}</span>
              </div>
              <button
                onClick={() => setSelectedMonth(prev => addMonths(prev, 1))}
                className="p-1.5 hover:bg-white hover:text-blue-600 rounded-lg text-slate-600 transition-colors"
                title="Tháng sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSelectedMonth(new Date())}
                className="ml-1 px-2 py-1 text-[10px] font-bold bg-white text-blue-600 rounded-lg shadow-xs hover:bg-blue-50 border border-slate-200"
              >
                Hiện tại
              </button>
            </div>

            {/* Nút Xuất Excel */}
            <button
              onClick={exportToExcel}
              disabled={filteredSummaries.length === 0}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Xuất Excel Báo Cáo</span>
            </button>

            {/* Chế độ xem: Tổng hợp vs Ma trận */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                onClick={() => setViewMode('summary')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'summary' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Danh sách tổng hợp
              </button>
              <button
                onClick={() => setViewMode('matrix')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'matrix' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ma trận 1-31 ngày
              </button>
            </div>
          </div>
        </div>

        {/* Thanh Lọc Khoa/Phòng & Tình trạng Vắng */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          {/* Lọc Khoa / Phòng */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Khoa / Phòng
            </label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Tất cả Khoa / Phòng ({departments.length}) --</option>
              {departments.map((d: any) => (
                <option key={d.id || d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc Tình Trạng Điểm Danh */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Phân loại chuyên cần
            </label>
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tất cả nhân viên ({employeeSummaries.length})</option>
              <option value="all_absent">❌ Không chấm công ngày nào (Vắng 100%)</option>
              <option value="has_absent">⚠️ Có ngày không chấm công / Thiếu công</option>
              <option value="full">✅ Chấm công đầy đủ 100%</option>
              <option value="late">⏰ Có đi muộn</option>
            </select>
          </div>

          {/* Ô Tìm Kiếm */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Tìm kiếm nhân viên
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Nhập tên nhân viên, mã nhân viên..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
                >
                  Xóa
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Thẻ Thống Kê Tổng Quan (KPI Cards) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>Tổng nhân sự</span>
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{statisticsOverview.totalStaff}</span>
              <span className="text-[11px] text-slate-500">cán bộ</span>
            </div>
          </div>

          <div className="bg-red-50/70 border border-red-200 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-red-700 text-xs font-bold">
              <span>Không chấm công cả tháng</span>
              <UserX className="w-4 h-4 text-red-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-red-700">{statisticsOverview.allAbsentCount}</span>
              <span className="text-[11px] font-bold text-red-600">vắng 100%</span>
            </div>
          </div>

          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-amber-800 text-xs font-bold">
              <span>Có ngày không chấm công</span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-700">{statisticsOverview.hasAbsentCount}</span>
              <span className="text-[11px] font-bold text-amber-600">nhân viên</span>
            </div>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-emerald-800 text-xs font-bold">
              <span>Chấm công đầy đủ</span>
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-700">{statisticsOverview.fullAttendanceCount}</span>
              <span className="text-[11px] font-bold text-emerald-600">nhân viên</span>
            </div>
          </div>

          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-blue-800 text-xs font-bold">
              <span>Tổng lượt đi muộn</span>
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-blue-700">{statisticsOverview.totalLateEvents}</span>
              <span className="text-[11px] font-bold text-blue-600">lần muộn</span>
            </div>
          </div>
        </div>
      </div>

      {/* Nội Dung Báo Cáo */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-xs font-bold text-slate-500">Đang tổng hợp dữ liệu chấm công cả tháng...</p>
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center flex flex-col items-center justify-center shadow-xs">
            <AlertCircle className="w-12 h-12 text-slate-300 mb-3" />
            <h3 className="text-base font-bold text-slate-800 mb-1">Không tìm thấy nhân viên nào</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              Không có dữ liệu nhân viên phù hợp với bộ lọc Khoa/Phòng hoặc điều kiện chuyên cần đã chọn.
            </p>
          </div>
        ) : viewMode === 'summary' ? (
          /* CHẾ ĐỘ 1: BẢNG DANH SÁCH TỔNG HỢP & DANH SÁCH NGÀY KHÔNG CHẤM CÔNG */
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-[11px] uppercase tracking-wider text-slate-600 font-extrabold border-b border-slate-200">
                    <th className="py-3.5 px-4 w-12 text-center">STT</th>
                    <th className="py-3.5 px-4">Nhân viên</th>
                    <th className="py-3.5 px-4">Khoa / Phòng</th>
                    <th className="py-3.5 px-4 text-center">Có mặt</th>
                    <th className="py-3.5 px-4 text-center">Không chấm (Vắng)</th>
                    <th className="py-3.5 px-4 text-center">Đi muộn</th>
                    <th className="py-3.5 px-4 text-center w-36">Chuyên cần</th>
                    <th className="py-3.5 px-4">Chi tiết các ngày không chấm công</th>
                    <th className="py-3.5 px-4 text-center w-24">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredSummaries.map((emp, index) => {
                    const isAllAbsent = emp.pastWorkingDaysCount > 0 && emp.attendedDaysCount === 0;
                    const hasAbsent = emp.absentDaysCount > 0 && emp.attendedDaysCount > 0;

                    return (
                      <tr 
                        key={emp.userId || index}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isAllAbsent ? 'bg-red-50/40' : hasAbsent ? 'bg-amber-50/20' : ''
                        }`}
                      >
                        <td className="py-3 px-4 text-center font-bold text-slate-400">
                          {index + 1}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              isAllAbsent ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {emp.userName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{emp.userName}</span>
                                {isAllAbsent && (
                                  <span className="bg-red-100 text-red-700 text-[10px] font-extrabold px-1.5 py-0.5 rounded border border-red-200">
                                    Vắng 100%
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-medium">
                                Mã NV: <span className="font-mono">{emp.userId || '-'}</span> | {emp.position}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          {emp.department}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-emerald-700">
                          <span className="bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                            {emp.attendedDaysCount} / {emp.pastWorkingDaysCount} ngày
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-bold">
                          {emp.absentDaysCount > 0 ? (
                            <span className="bg-red-50 text-red-700 px-2.5 py-1 rounded-lg border border-red-200">
                              {emp.absentDaysCount} ngày
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">0 ngày</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-medium">
                          {emp.lateTimesCount > 0 ? (
                            <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              {emp.lateTimesCount} lần ({emp.totalLateMinutes}p)
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex flex-col gap-1 items-center">
                            <span className={`font-black text-xs ${
                              emp.attendanceRate >= 90 ? 'text-emerald-600' :
                              emp.attendanceRate >= 70 ? 'text-amber-600' : 'text-red-600'
                            }`}>
                              {emp.attendanceRate}%
                            </span>
                            <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${
                                  emp.attendanceRate >= 90 ? 'bg-emerald-500' :
                                  emp.attendanceRate >= 70 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${emp.attendanceRate}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {isAllAbsent ? (
                            <div className="text-xs font-bold text-red-600 flex items-center gap-1">
                              <UserX className="w-3.5 h-3.5 shrink-0" />
                              <span>Không có bất kỳ lượt chấm công nào trong tháng</span>
                            </div>
                          ) : emp.absentDates.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-md">
                              {emp.absentDates.slice(0, 8).map((dStr, dIdx) => (
                                <span 
                                  key={dIdx}
                                  className="px-1.5 py-0.5 bg-red-100 text-red-800 rounded font-mono text-[10px] font-bold border border-red-200"
                                >
                                  {dStr}
                                </span>
                              ))}
                              {emp.absentDates.length > 8 && (
                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">
                                  +{emp.absentDates.length - 8} ngày khác...
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-emerald-600 font-bold flex items-center gap-1 text-[11px]">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Chấm công đầy đủ</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setSelectedEmployeeDetail(emp)}
                            className="p-1.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 rounded-lg transition-all"
                            title="Xem lịch chi tiết cả tháng"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* CHẾ ĐỘ 2: MA TRẬN ĐIỂM DANH TỪNG NGÀY 1..31 */
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="font-bold text-slate-700">Chú thích ký hiệu:</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[10px]">X</span>
                  <span className="text-slate-600 font-medium">Có mặt</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-red-100 text-red-800 font-bold flex items-center justify-center text-[10px]">V</span>
                  <span className="text-slate-600 font-medium">Vắng / Không chấm</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-[10px]">M</span>
                  <span className="text-slate-600 font-medium">Đi muộn</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded bg-slate-100 text-slate-400 font-bold flex items-center justify-center text-[10px]">-</span>
                  <span className="text-slate-600 font-medium">Chưa tới ngày</span>
                </span>
              </div>
              <div className="text-slate-500 font-medium">
                Tổng số: <b>{filteredSummaries.length}</b> nhân viên
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead>
                  <tr className="bg-slate-100 text-[10px] uppercase text-slate-700 font-extrabold border-b border-slate-200 sticky top-0 z-10 shadow-xs">
                    <th className="py-2.5 px-2 w-8 text-center sticky left-0 bg-slate-100 z-20">#</th>
                    <th className="py-2.5 px-3 min-w-[160px] sticky left-8 bg-slate-100 z-20">Họ và Tên</th>
                    <th className="py-2.5 px-2 min-w-[120px]">Khoa / Phòng</th>
                    
                    {/* Cột từng ngày trong tháng */}
                    {daysInMonthList.map((d, dIndex) => {
                      const dayNum = format(d, 'd');
                      const isSun = d.getDay() === 0;
                      const isSat = d.getDay() === 6;

                      return (
                        <th 
                          key={dIndex}
                          className={`py-2 px-1 text-center min-w-[28px] border-l border-slate-200 ${
                            isSun ? 'bg-red-50 text-red-700' : isSat ? 'bg-blue-50 text-blue-700' : ''
                          }`}
                        >
                          <div>{dayNum}</div>
                          <div className="text-[8px] font-normal opacity-75">
                            {isSun ? 'CN' : `T${d.getDay() + 1}`}
                          </div>
                        </th>
                      );
                    })}

                    <th className="py-2.5 px-2 text-center min-w-[50px] bg-emerald-50 text-emerald-800 font-extrabold border-l border-slate-200">
                      Có mặt
                    </th>
                    <th className="py-2.5 px-2 text-center min-w-[50px] bg-red-50 text-red-800 font-extrabold border-l border-slate-200">
                      Vắng
                    </th>
                    <th className="py-2.5 px-2 text-center min-w-[50px] bg-amber-50 text-amber-800 font-extrabold border-l border-slate-200">
                      Muộn
                    </th>
                    <th className="py-2.5 px-2 text-center min-w-[50px] bg-slate-200 font-extrabold border-l border-slate-200">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredSummaries.map((emp, index) => {
                    return (
                      <tr key={emp.userId || index} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-2 text-center font-mono font-bold text-slate-400 sticky left-0 bg-white z-10">
                          {index + 1}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900 sticky left-8 bg-white z-10 truncate max-w-[180px]">
                          <span title={emp.userName}>{emp.userName}</span>
                        </td>
                        <td className="py-2 px-2 text-slate-600 font-medium truncate max-w-[130px]" title={emp.department}>
                          {emp.department}
                        </td>

                        {/* Các ô ngày */}
                        {daysInMonthList.map((d, dIdx) => {
                          const dateStr = format(d, 'yyyy-MM-dd');
                          const st = emp.dailyStatus[dateStr];

                          if (!st || st.isFutureDay) {
                            return (
                              <td key={dIdx} className="py-1 px-1 text-center border-l border-slate-100 text-slate-300 font-mono text-[10px]">
                                -
                              </td>
                            );
                          }

                          if (st.hasRecord) {
                            if (st.isLate) {
                              return (
                                <td key={dIdx} className="py-1 px-0.5 text-center border-l border-slate-100 bg-amber-50">
                                  <span 
                                    className="inline-block px-1 py-0.5 rounded bg-amber-200/80 text-amber-900 font-extrabold text-[9px]"
                                    title={`Đi muộn ${st.lateMinutes} phút`}
                                  >
                                    M
                                  </span>
                                </td>
                              );
                            }
                            return (
                              <td key={dIdx} className="py-1 px-0.5 text-center border-l border-slate-100 bg-emerald-50/40">
                                <span className="inline-block px-1 py-0.5 rounded bg-emerald-200/70 text-emerald-900 font-extrabold text-[9px]">
                                  X
                                </span>
                              </td>
                            );
                          }

                          // Vắng / Không chấm công
                          return (
                            <td key={dIdx} className="py-1 px-0.5 text-center border-l border-slate-100 bg-red-50/60">
                              <span 
                                className="inline-block px-1 py-0.5 rounded bg-red-200/80 text-red-900 font-extrabold text-[9px]"
                                title="Không chấm công"
                              >
                                V
                              </span>
                            </td>
                          );
                        })}

                        <td className="py-2 px-2 text-center font-bold text-emerald-700 bg-emerald-50/30 border-l border-slate-200">
                          {emp.attendedDaysCount}
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-red-700 bg-red-50/30 border-l border-slate-200">
                          {emp.absentDaysCount}
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-amber-700 bg-amber-50/30 border-l border-slate-200">
                          {emp.lateTimesCount}
                        </td>
                        <td className="py-2 px-2 text-center font-extrabold text-slate-800 bg-slate-50 border-l border-slate-200">
                          {emp.attendanceRate}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODAL XEM CHI TIẾT ĐIỂM DANH CỦA 1 NHÂN VIÊN */}
      {selectedEmployeeDetail && (
        <div className="fixed inset-0 bg-slate-900/60 z-[120] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            {/* Header Modal */}
            <div className="bg-slate-900 p-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm">
                  {selectedEmployeeDetail.userName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <span>{selectedEmployeeDetail.userName}</span>
                    <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-normal">
                      Mã NV: {selectedEmployeeDetail.userId || '-'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300">
                    Khoa / Phòng: <b>{selectedEmployeeDetail.department}</b> | Chức vụ: {selectedEmployeeDetail.position}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEmployeeDetail(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Thống kê nhanh của nhân viên */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <div className="text-slate-500 font-medium text-[11px]">Số ngày có mặt</div>
                <div className="text-base font-black text-emerald-600 mt-1">
                  {selectedEmployeeDetail.attendedDaysCount} ngày
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <div className="text-slate-500 font-medium text-[11px]">Không chấm công</div>
                <div className="text-base font-black text-red-600 mt-1">
                  {selectedEmployeeDetail.absentDaysCount} ngày
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <div className="text-slate-500 font-medium text-[11px]">Số lần đi muộn</div>
                <div className="text-base font-black text-amber-600 mt-1">
                  {selectedEmployeeDetail.lateTimesCount} lần
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <div className="text-slate-500 font-medium text-[11px]">Tỷ lệ chuyên cần</div>
                <div className="text-base font-black text-blue-600 mt-1">
                  {selectedEmployeeDetail.attendanceRate}%
                </div>
              </div>
            </div>

            {/* Danh sách từng ngày trong tháng */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Chi tiết chấm công từng ngày (Tháng {format(selectedMonth, 'MM/yyyy')}):
              </h4>
              <div className="space-y-1.5">
                {daysInMonthList.map((day, dIdx) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const dayText = format(day, 'dd/MM/yyyy');
                  const dayOfWeek = format(day, 'EEEE', { locale: vi });
                  const st = selectedEmployeeDetail.dailyStatus[dateStr];

                  if (!st || st.isFutureDay) {
                    return (
                      <div key={dIdx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <div className="font-semibold">{dayOfWeek}, {dayText}</div>
                        <div className="italic text-[11px]">Chưa tới ngày</div>
                      </div>
                    );
                  }

                  if (st.hasRecord) {
                    return (
                      <div key={dIdx} className="p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-200 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-900">
                            {dayOfWeek}, {dayText}
                          </div>
                          <div className="text-[11px] text-slate-600 mt-0.5 flex gap-3">
                            {st.morningIn && <span>Vào: <b className="text-emerald-700">{format(new Date(st.morningIn.timestamp), 'HH:mm')}</b></span>}
                            {st.morningOut && <span>Ra: <b className="text-orange-700">{format(new Date(st.morningOut.timestamp), 'HH:mm')}</b></span>}
                          </div>
                        </div>
                        <div>
                          {st.isLate ? (
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                              Đi muộn {st.lateMinutes}p
                            </span>
                          ) : (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                              Đúng giờ
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // Vắng / Không chấm công
                  return (
                    <div key={dIdx} className="p-2.5 bg-red-50 rounded-xl border border-red-200 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-red-900">
                          {dayOfWeek}, {dayText}
                        </div>
                        <div className="text-[11px] text-red-600 font-medium">
                          Không có dữ liệu điểm danh
                        </div>
                      </div>
                      <span className="bg-red-100 text-red-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-red-200">
                        KHÔNG CHẤM CÔNG
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedEmployeeDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
