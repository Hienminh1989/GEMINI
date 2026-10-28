import React, { useMemo, useState } from 'react';
import { format, subDays, isSameDay, startOfMonth, parseISO } from 'date-fns';
import { Users, UserCheck, Clock, XCircle, MapPin, RefreshCw, Phone, MessageSquare, Activity, Database, Server, HardDrive, Wifi, Camera, TrendingUp, Calendar, CheckCircle2, AlertTriangle, ArrowUpRight, Zap, Eye, Filter, X, ArrowRight, User } from 'lucide-react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { LocationMap } from './LocationMap';
import { SystemStatusMonitor } from './SystemStatusMonitor';
import { AttendanceRecord, UserData } from '../types';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';
import { getVnTodayDateString } from '../lib/format';

interface AdminDashboardProps {
  records: AttendanceRecord[];
  users: UserData[];
  departments: {id: string, name: string}[];
  config: any;
  timeRange?: number;
  setTimeRange?: (range: number) => void;
}

const CustomTrendTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0]?.payload;
    if (!data) return null;
    return (
      <div className="bg-white/95 backdrop-blur-md p-3.5 rounded-xl shadow-xl border border-slate-200 text-xs min-w-[210px] space-y-2 pointer-events-none">
        <div className="border-b border-slate-100 pb-2">
          <p className="font-extrabold text-slate-800 text-[13px]">{data.fullDate || label}</p>
          <div className="flex items-center justify-between text-slate-500 text-[11px] mt-0.5">
            <span>Tỷ lệ tham gia:</span>
            <span className="font-extrabold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{data.rate}%</span>
          </div>
        </div>
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-700 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block shadow-2xs"></span>
              Đã điểm danh:
            </span>
            <span className="font-extrabold text-blue-700">{data.checkedIn} người</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-700 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-2xs"></span>
              Đúng giờ:
            </span>
            <span className="font-extrabold text-emerald-600">{data.onTime} người</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-700 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-2xs"></span>
              Đi muộn:
            </span>
            <span className="font-extrabold text-amber-600">{data.late} người</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block"></span>
              Chưa điểm danh:
            </span>
            <span className="font-bold text-slate-500">{data.absent} người</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const KpiCard = ({ title, value, icon, iconBg, trend, trendValue, trendColor = 'text-slate-500' }: any) => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start mb-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${iconBg}`}>
        {icon}
      </div>
    </div>
    <div>
      <h4 className="text-sm font-semibold text-slate-500 mb-1">{title}</h4>
      <div className="text-3xl font-black text-slate-800 mb-2">{value}</div>
      <div className={`text-xs font-semibold flex items-center gap-1 ${trendColor}`}>
        {trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''} {trendValue} <span className="text-slate-400 font-medium">so với hôm qua</span>
      </div>
    </div>
  </div>
);

export function AdminDashboard({ records, users, departments, config, timeRange = 7, setTimeRange }: AdminDashboardProps) {

  const today = new Date();
  
  const [chartSeries, setChartSeries] = useState<{ checkedIn: boolean; onTime: boolean; late: boolean }>({
    checkedIn: true,
    onTime: true,
    late: true,
  });

  const trendData = useMemo(() => {
    const totalStaff = users?.length || 1;
    return Array.from({ length: timeRange }).map((_, i) => {
      const d = subDays(today, (timeRange - 1) - i);
      const dStr = format(d, 'yyyy-MM-dd');
      
      const dayRecords = records.filter(r => r.dateStr === dStr && r.status === 'success');
      const uniqueUsers = new Set(dayRecords.map(r => r.userId));
      const lateUsers = new Set(dayRecords.filter(r => r.lateMinutes && r.lateMinutes > 0).map(r => r.userId));
      
      const checkedInCount = uniqueUsers.size;
      const lateCount = lateUsers.size;
      const onTimeCount = Math.max(0, checkedInCount - lateCount);
      const absentCount = Math.max(0, totalStaff - checkedInCount);
      const rate = totalStaff > 0 ? Math.round((checkedInCount / totalStaff) * 100) : 0;
      
      const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
      const fullDayNames = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
      const dayName = dayNames[d.getDay()];
      const fullDayName = fullDayNames[d.getDay()];

      return {
        date: timeRange <= 7 ? `${dayName} ${format(d, 'dd/MM')}` : format(d, 'dd/MM'),
        fullDate: `${fullDayName}, ${format(d, 'dd/MM/yyyy')}`,
        rawDate: dStr,
        checkedIn: checkedInCount,
        onTime: onTimeCount,
        late: lateCount,
        absent: absentCount,
        rate
      };
    });
  }, [records, users, today, timeRange]);

  const trendStats = useMemo(() => {
    if (!trendData.length) return { avgRate: 0, totalCheckedIn: 0, totalOnTime: 0, totalLate: 0, bestDay: null };
    const totalCheckedIn = trendData.reduce((acc, curr) => acc + curr.checkedIn, 0);
    const totalOnTime = trendData.reduce((acc, curr) => acc + curr.onTime, 0);
    const totalLate = trendData.reduce((acc, curr) => acc + curr.late, 0);
    const avgRate = Math.round(trendData.reduce((acc, curr) => acc + curr.rate, 0) / trendData.length);
    const bestDay = [...trendData].sort((a, b) => b.checkedIn - a.checkedIn)[0];
    return { avgRate, totalCheckedIn, totalOnTime, totalLate, bestDay };
  }, [trendData]);


  const [dateMode, setDateMode] = useState<'today' | 'range'>('today');
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | '7days' | '30days' | 'this_month' | 'custom'>('today');
  const [startDate, setStartDate] = useState(format(today, 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));
  const [dateFilter, setDateFilter] = useState('');
  const [showViewAllModal, setShowViewAllModal] = useState(false);
  const [viewAllPage, setViewAllPage] = useState(1);
  const viewAllPerPage = 15;

  const [showRecentActivitiesModal, setShowRecentActivitiesModal] = useState(false);
  const [recentModalPage, setRecentModalPage] = useState(1);
  const [recentSearchQuery, setRecentSearchQuery] = useState('');
  const [recentDeptFilter, setRecentDeptFilter] = useState('');
  const recentModalPerPage = 15;

  const [tablePage, setTablePage] = useState(1);
  const tablePerPage = 5;
  const [tableFilter, setTableFilter] = useState('not_checked_in');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');

  const todayStr = getVnTodayDateString(today);

  const applyDatePreset = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'this_month') => {
    setDatePreset(preset);
    const todayFormatted = format(today, 'yyyy-MM-dd');
    if (preset === 'today') {
      setDateMode('today');
      setStartDate(todayFormatted);
      setEndDate(todayFormatted);
    } else {
      setDateMode('range');
      if (preset === 'yesterday') {
        const yest = format(subDays(today, 1), 'yyyy-MM-dd');
        setStartDate(yest);
        setEndDate(yest);
      } else if (preset === '7days') {
        setStartDate(format(subDays(today, 6), 'yyyy-MM-dd'));
        setEndDate(todayFormatted);
      } else if (preset === '30days') {
        setStartDate(format(subDays(today, 29), 'yyyy-MM-dd'));
        setEndDate(todayFormatted);
      } else if (preset === 'this_month') {
        setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
        setEndDate(todayFormatted);
      }
    }
  };
  
  // Filter todayRecords based on selections
  const baseTodayRecords = useMemo(() => {
    return records.filter(r => {
      if (!r.dateStr) return false;
      if (dateMode === 'range') {
        return r.dateStr >= startDate && r.dateStr <= endDate;
      }
      return r.dateStr === (dateFilter || todayStr);
    });
  }, [records, todayStr, dateFilter, dateMode, startDate, endDate]);
  
  const todayRecords = useMemo(() => {
    const targetUser = userFilter ? users.find(x => x.uid === userFilter) : null;
    const targetName = targetUser?.name?.trim().toLowerCase();
    return baseTodayRecords.filter(r => {
      const u = users.find(x => x.uid === r.userId || (r.userName && x.name && x.name.trim().toLowerCase() === r.userName.trim().toLowerCase()));
      if (departmentFilter && u?.department !== departmentFilter) return false;
      if (shiftFilter && r.shift !== shiftFilter) return false;
      if (roleFilter && u?.role !== roleFilter) return false;
      if (userFilter) {
        const matchesUser = r.userId === userFilter || (targetName && r.userName && r.userName.trim().toLowerCase() === targetName);
        if (!matchesUser) return false;
      }
      return true;
    });
  }, [baseTodayRecords, departmentFilter, shiftFilter, roleFilter, userFilter, users]);

  
  const checkedInUsers = useMemo(() => new Set(todayRecords.map(r => r.userId || r.userName)), [todayRecords]);
  const lateUsers = useMemo(() => new Set(todayRecords.filter(r => r.lateMinutes && r.lateMinutes > 0).map(r => r.userId || r.userName)), [todayRecords]);
  
  const activeUsers = useMemo(() => {
    return users.filter(u => !u.is_hidden && u.status !== 'inactive' && u.status !== 'locked');
  }, [users]);

  const filteredUsers = useMemo(() => {
    const targetUser = userFilter ? users.find(x => x.uid === userFilter) : null;
    const targetName = targetUser?.name?.trim().toLowerCase();
    return activeUsers.filter(u => {
      if (departmentFilter && u.department !== departmentFilter) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (userFilter) {
        const matchesUser = u.uid === userFilter || (targetName && u.name && u.name.trim().toLowerCase() === targetName);
        if (!matchesUser) return false;
      }
      return true;
    });
  }, [activeUsers, departmentFilter, roleFilter, userFilter, users]);

  const checkedInCount = checkedInUsers.size;
  const lateCount = lateUsers.size;
  const totalUsersCount = filteredUsers.length;
  const notCheckedInCount = Math.max(0, totalUsersCount - checkedInCount);
  const gpsErrorCount = todayRecords.filter(r => r.status === 'error' || r.status === 'failed').length;


  const deptData = useMemo(() => {
    if (!departments.length) return [];
    
    const stats = departments.map(d => {
      const deptUsers = activeUsers.filter(u => u.department === d.name);
      const total = deptUsers.length;
      if (total === 0) return { name: d.name, rate: 0, total: 0 };
      
      let checkedIn = 0;
      deptUsers.forEach(u => {
        if (checkedInUsers.has(u.uid)) checkedIn++;
      });
      
      return {
        name: d.name,
        rate: Math.round((checkedIn / total) * 100),
        total
      };
    });
    
    return stats.filter(s => s.total > 0).sort((a, b) => b.rate - a.rate).slice(0, 10);
  }, [departments, activeUsers, checkedInUsers]);

  const tableDataFull = useMemo(() => {
    if (tableFilter === 'not_checked_in') {
      return filteredUsers.filter(u => !checkedInUsers.has(u.uid)).map(u => ({ user: u, status: 'Chưa điểm danh', lateTime: 0, shift: '' }));
    } else {
      const targetShift = tableFilter === 'late_morning' ? 'morning' : 'afternoon';
      const shiftName = targetShift === 'morning' ? 'Sáng' : 'Chiều';
      return todayRecords
        .filter(r => r.lateMinutes && r.lateMinutes > 0 && (r.shift === shiftName || r.shift === targetShift || r.shiftId === targetShift))
        .map(r => ({ user: users.find(x => x.uid === r.userId), status: 'Đi muộn', lateTime: r.lateMinutes, shift: shiftName, record: r }))
        .filter(item => item.user);
    }
  }, [filteredUsers, checkedInUsers, tableFilter, todayRecords, users]);
  
  const tableDataList = useMemo(() => {
    return tableDataFull.slice((tablePage - 1) * tablePerPage, tablePage * tablePerPage);
  }, [tableDataFull, tablePage, tablePerPage]);
    const viewAllDataList = useMemo(() => {
    return tableDataFull.slice((viewAllPage - 1) * viewAllPerPage, viewAllPage * viewAllPerPage);
  }, [tableDataFull, viewAllPage, viewAllPerPage]);

  const exportViewAllToExcel = () => {
    const dataToExport = tableDataFull.map((item, i) => ({
      "STT": i + 1,
      "Mã NV": item.user?.uid || "",
      "Họ và tên": item.user?.name || "",
      "Khoa / Phòng": item.user?.department || "Chưa cập nhật",
      "Trạng thái": item.status,
      "Ca trực": item.shift || "-",
      "Số phút đi muộn": item.lateTime > 0 ? `${item.lateTime} phút` : "-"
    }));
    
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh_sach");
    XLSX.writeFile(wb, `Danh_sach_${tableFilter}_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
  };
  const tableDataCount = tableDataFull.length;

  const recentActivities = useMemo(() => {
    return [...todayRecords].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  }, [todayRecords]);

  // Toàn bộ hoạt động gần đây (không giới hạn 5 bản ghi)
  const allRecentActivities = useMemo(() => {
    return [...records].sort((a, b) => b.timestamp - a.timestamp);
  }, [records]);

  const filteredRecentActivities = useMemo(() => {
    return allRecentActivities.filter(r => {
      const u = users.find(x => x.uid === r.userId);
      const name = (r.userName || u?.name || '').toLowerCase();
      const dept = (r.department || u?.department || '').toLowerCase();
      const uid = (r.userId || u?.uid || '').toLowerCase();
      const q = recentSearchQuery.trim().toLowerCase();

      if (recentDeptFilter && (r.department || u?.department) !== recentDeptFilter) {
        return false;
      }

      if (q) {
        return name.includes(q) || dept.includes(q) || uid.includes(q);
      }
      return true;
    });
  }, [allRecentActivities, users, recentSearchQuery, recentDeptFilter]);

  const paginatedRecentActivities = useMemo(() => {
    return filteredRecentActivities.slice(
      (recentModalPage - 1) * recentModalPerPage,
      recentModalPage * recentModalPerPage
    );
  }, [filteredRecentActivities, recentModalPage, recentModalPerPage]);

  const exportRecentActivitiesToExcel = () => {
    const dataToExport = filteredRecentActivities.map((r, i) => {
      const u = users.find(x => x.uid === r.userId);
      const isCheckIn = r.type === 'in';
      const isLate = r.lateMinutes && r.lateMinutes > 0;
      let actStr = isCheckIn ? 'Vào ca' : 'Ra ca';
      if (isLate) actStr += ` (Đi muộn ${r.lateMinutes}p)`;

      return {
        "STT": i + 1,
        "Thời gian": format(new Date(r.timestamp), 'dd/MM/yyyy HH:mm:ss'),
        "Mã NV": r.userId || u?.uid || '',
        "Họ và tên": r.userName || u?.name || '',
        "Khoa / Phòng": r.department || u?.department || 'Chưa cập nhật',
        "Hoạt động": actStr,
        "Trạng thái": r.status === 'success' ? 'Hợp lệ' : r.status === 'failed' ? 'Sai vị trí' : r.status,
        "Khoảng cách (m)": r.distance !== undefined ? Math.round(r.distance) : '',
        "Ghi chú": r.note || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hoat_dong_gan_day");
    XLSX.writeFile(wb, `Hoat_dong_diem_danh_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
  };

  const inAreaCount = todayRecords.filter(r => r.status === 'success').length;
  const outAreaCount = todayRecords.filter(r => r.status !== 'success').length;
  const onTimeCount = checkedInCount - lateCount;
  const absentCount = notCheckedInCount;
  
  const onTimePct = totalUsersCount ? (onTimeCount / totalUsersCount) * 100 : 0;
  const latePct = totalUsersCount ? (lateCount / totalUsersCount) * 100 : 0;
  const absentPct = totalUsersCount ? (absentCount / totalUsersCount) * 100 : 0;

  const exportToExcel = () => {
    // Sắp xếp người dùng theo Khoa / Phòng trước, sau đó theo Tên và Mã NV
    const sortedUsers = [...filteredUsers].sort((a, b) => {
      const deptA = (a.department || '').trim();
      const deptB = (b.department || '').trim();
      const deptCompare = deptA.localeCompare(deptB, 'vi', { sensitivity: 'base' });
      if (deptCompare !== 0) return deptCompare;

      const nameA = (a.name || '').trim();
      const nameB = (b.name || '').trim();
      const nameCompare = nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
      if (nameCompare !== 0) return nameCompare;

      return String(a.uid || '').localeCompare(String(b.uid || ''), 'vi', { sensitivity: 'base' });
    });

    const dataRows = sortedUsers.map((u, i) => {
      const uRecords = todayRecords.filter(r => r.userId === u.uid);
      const isCheckedIn = uRecords.length > 0;

      let morningInTime = "";
      let morningOutTime = "";
      let afternoonInTime = "";
      let afternoonOutTime = "";

      if (isCheckedIn) {
        uRecords.forEach(r => {
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
      }

      let statusStr = "Chưa điểm danh";
      if (isCheckedIn) {
        const hasLate = uRecords.some(r => r.lateMinutes && r.lateMinutes > 0);
        statusStr = hasLate ? "Đi muộn" : "Đúng giờ";
      }

      return [
        i + 1,
        u.uid,
        u.name,
        u.department || "Chưa cập nhật",
        statusStr,
        morningInTime,
        morningOutTime,
        afternoonInTime,
        afternoonOutTime
      ];
    });

    const headers = [
      ['STT', 'Mã NV', 'Họ và tên', 'Khoa / Phòng', 'Trạng thái', 'CA SÁNG', '', 'CA CHIỀU', ''],
      ['', '', '', '', '', 'Giờ vào', 'Giờ ra', 'Giờ vào', 'Giờ ra']
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([...headers, ...dataRows]);
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
      { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
      { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } },
      { s: { r: 0, c: 5 }, e: { r: 0, c: 6 } },
      { s: { r: 0, c: 7 }, e: { r: 0, c: 8 } },
    ];
    worksheet['!cols'] = [
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

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Báo cáo điểm danh");
    const fileNameSuffix = dateMode === 'range' 
      ? `${startDate}_den_${endDate}` 
      : (dateFilter || todayStr);
    XLSX.writeFile(workbook, `BaoCao_ChamCong_${fileNameSuffix}.xlsx`);
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12 animate-in fade-in duration-500">
      
      {/* Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 flex flex-col gap-4">
        {/* Top Row: Date Mode & Presets & Custom Date Pickers */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mr-1">
              <Calendar className="w-4 h-4 text-blue-600" />
              Thời gian:
            </span>
            <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => applyDatePreset('today')}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  dateMode === 'today' ? 'bg-white text-blue-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateMode('range');
                  if (datePreset === 'today') {
                    applyDatePreset('7days');
                  }
                }}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  dateMode === 'range' ? 'bg-white text-blue-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Khoảng ngày
              </button>
            </div>

            {dateMode === 'range' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyDatePreset('yesterday')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    datePreset === 'yesterday' ? 'bg-blue-100 text-blue-800 font-bold border border-blue-200' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Hôm qua
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('7days')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    datePreset === '7days' ? 'bg-blue-100 text-blue-800 font-bold border border-blue-200' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  7 ngày gần nhất
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('30days')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    datePreset === '30days' ? 'bg-blue-100 text-blue-800 font-bold border border-blue-200' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  30 ngày
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('this_month')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    datePreset === 'this_month' ? 'bg-blue-100 text-blue-800 font-bold border border-blue-200' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Tháng này
                </button>
              </div>
            )}
          </div>

          {/* Date Picker inputs when range mode */}
          {dateMode === 'range' ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
                <span className="text-slate-400 font-medium mr-1.5">Từ:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value);
                    setDatePreset('custom');
                  }}
                  className="bg-transparent font-semibold text-slate-700 outline-none"
                />
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
                <span className="text-slate-400 font-medium mr-1.5">Đến:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => {
                    setEndDate(e.target.value);
                    setDatePreset('custom');
                  }}
                  className="bg-transparent font-semibold text-slate-700 outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 font-medium">
              Ngày: <span className="font-bold text-slate-800">{format(today, 'dd/MM/yyyy')}</span>
            </div>
          )}
        </div>

        {/* Bottom Row: Filters & Action Buttons */}
        <div className="flex flex-wrap gap-3 items-end">
          {/* Department Filter */}
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Khoa phòng</label>
            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-100 outline-none text-slate-700 font-semibold bg-slate-50"
            >
              <option value="">Tất cả khoa phòng</option>
              {departments.map(d => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Shift Filter */}
          <div className="w-28">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Ca trực</label>
            <select
              value={shiftFilter}
              onChange={e => setShiftFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-100 outline-none text-slate-700 font-semibold bg-slate-50"
            >
              <option value="">Tất cả</option>
              <option value="morning">Sáng</option>
              <option value="afternoon">Chiều</option>
              <option value="evening">Đêm</option>
            </select>
          </div>

          {/* Role Filter */}
          <div className="w-32">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Loại nhân sự</label>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-100 outline-none text-slate-700 font-semibold bg-slate-50"
            >
              <option value="">Tất cả</option>
              <option value="employee">Nhân viên</option>
              <option value="admin">Quản lý</option>
            </select>
          </div>

          {/* User / Personal Filter */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider flex items-center justify-between">
              <span>Lọc theo cá nhân</span>
              {userFilter && (
                <button
                  type="button"
                  onClick={() => setUserFilter('')}
                  className="text-[11px] text-red-600 hover:underline font-semibold"
                >
                  Xóa lọc
                </button>
              )}
            </label>
            <div className="flex items-center gap-1.5">
              <select
                value={userFilter}
                onChange={e => setUserFilter(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-blue-100 outline-none ${
                  userFilter ? 'border-blue-400 bg-blue-50/50 text-blue-900' : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
                title="Lọc bảng thống kê theo từng nhân viên cụ thể"
              >
                <option value="">-- Tất cả nhân viên --</option>
                {users
                  .filter(u => !departmentFilter || u.department === departmentFilter)
                  .map(u => (
                    <option key={u.uid} value={u.uid}>
                      {u.name} ({u.uid || 'Không mã'}) {u.department ? ` - ${u.department}` : ''}
                    </option>
                  ))}
              </select>
              {userFilter && (
                <button
                  type="button"
                  onClick={() => setUserFilter('')}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-slate-200 transition-colors"
                  title="Bỏ lọc cá nhân"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportToExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" /> Xuất Excel
            </button>
          </div>
        </div>

        {/* Active Filter Chips */}
        {(dateMode === 'range' || userFilter || departmentFilter || shiftFilter || roleFilter) && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 bg-blue-50/60 border border-blue-200/60 rounded-lg px-3 py-1.5">
            <span className="font-bold text-blue-900 flex items-center gap-1">
              <Filter className="w-3 h-3 text-blue-600" />
              Đang lọc:
            </span>
            {dateMode === 'range' ? (
              <span className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-800 font-medium">
                Khoảng ngày: {format(parseISO(startDate), 'dd/MM/yyyy')} - {format(parseISO(endDate), 'dd/MM/yyyy')}
              </span>
            ) : (
              <span className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-800 font-medium">
                Hôm nay: {format(today, 'dd/MM/yyyy')}
              </span>
            )}
            {userFilter && (
              <span className="inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-blue-300 text-blue-800 font-semibold shadow-xs">
                <User className="w-3 h-3 text-blue-600" />
                Cá nhân: {users.find(u => u.uid === userFilter)?.name || userFilter}
                <button
                  onClick={() => setUserFilter('')}
                  className="ml-1 text-slate-400 hover:text-red-600"
                  title="Bỏ lọc cá nhân"
                >
                  ✕
                </button>
              </span>
            )}
            {departmentFilter && (
              <span className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-800 font-medium">
                Khoa/Phòng: {departmentFilter}
              </span>
            )}
            {shiftFilter && (
              <span className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-800 font-medium">
                Ca: {shiftFilter === 'morning' ? 'Sáng' : shiftFilter === 'afternoon' ? 'Chiều' : 'Đêm'}
              </span>
            )}
            {roleFilter && (
              <span className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-800 font-medium">
                Loại: {roleFilter === 'admin' ? 'Quản lý' : 'Nhân viên'}
              </span>
            )}
            <button
              onClick={() => {
                setDateMode('today');
                applyDatePreset('today');
                setUserFilter('');
                setDepartmentFilter('');
                setShiftFilter('');
                setRoleFilter('');
              }}
              className="ml-auto text-blue-700 hover:text-blue-900 font-bold hover:underline"
            >
              Đặt lại tất cả
            </button>
          </div>
        )}

        {/* Personal Filter Snapshot Strip */}
        {userFilter && (() => {
          const targetUser = users.find(u => u.uid === userFilter);
          const targetName = targetUser?.name?.trim().toLowerCase();
          const userRecords = todayRecords.filter(r => 
            r.userId === userFilter || 
            (targetName && r.userName && r.userName.trim().toLowerCase() === targetName)
          );
          const distinctDays = new Set(userRecords.map(r => r.dateStr)).size;
          const lateCount = userRecords.filter(r => r.lateMinutes && r.lateMinutes > 0).length;
          const earlyCount = userRecords.filter(r => r.earlyLeaveMinutes && r.earlyLeaveMinutes > 0).length;
          return (
            <div className="bg-gradient-to-r from-blue-50 via-indigo-50/50 to-white border border-blue-200/90 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                  {(targetUser?.name || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm">{targetUser?.name || userFilter}</span>
                    <span className="text-[11px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      Mã NV: {targetUser?.uid || userFilter}
                    </span>
                    {targetUser?.department && (
                      <span className="text-[11px] font-semibold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded">
                        {targetUser.department}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    Lịch sử điểm danh {dateMode === 'range' ? `từ ${format(parseISO(startDate), 'dd/MM/yyyy')} đến ${format(parseISO(endDate), 'dd/MM/yyyy')}` : `ngày ${format(today, 'dd/MM/yyyy')}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <div className="text-center px-2.5 py-1 bg-white rounded-lg border border-blue-100 shadow-2xs">
                  <div className="text-sm font-extrabold text-blue-700">{userRecords.length}</div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Lượt ({distinctDays} ngày)</div>
                </div>
                <div className="text-center px-2.5 py-1 bg-white rounded-lg border border-blue-100 shadow-2xs">
                  <div className={`text-sm font-extrabold ${lateCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{lateCount}</div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Đi muộn</div>
                </div>
                <div className="text-center px-2.5 py-1 bg-white rounded-lg border border-blue-100 shadow-2xs">
                  <div className={`text-sm font-extrabold ${earlyCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{earlyCount}</div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Về sớm</div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard title="Tổng nhân viên" value={totalUsersCount} icon={<Users className="w-6 h-6 text-blue-600" />} iconBg="bg-blue-100" trend="" trendValue="" trendColor="text-slate-400" />
        <KpiCard title="Đã điểm danh" value={checkedInCount} icon={<UserCheck className="w-6 h-6 text-green-600" />} iconBg="bg-green-100" trend="" trendValue="" trendColor="text-slate-400" />
        <KpiCard title="Đi muộn" value={lateCount} icon={<Clock className="w-6 h-6 text-orange-600" />} iconBg="bg-orange-100" trend="" trendValue="" trendColor="text-slate-400" />
        <KpiCard title="Chưa điểm danh" value={notCheckedInCount} icon={<XCircle className="w-6 h-6 text-red-600" />} iconBg="bg-red-100" trend="" trendValue="" trendColor="text-slate-400" />
        <KpiCard title="Lỗi GPS" value={gpsErrorCount} icon={<MapPin className="w-6 h-6 text-purple-600" />} iconBg="bg-purple-100" trend="" trendValue="" trendColor="text-slate-400" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-5 sm:p-6 flex flex-col">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-base sm:text-lg">
                  Tình hình điểm danh {timeRange} ngày gần nhất
                </h3>
                <p className="text-xs text-slate-500 font-medium">Theo dõi lượng nhân sự có mặt, đúng giờ và tỷ lệ chuyên cần</p>
              </div>
            </div>
            <div className="flex flex-wrap bg-slate-100 rounded-lg p-1 border border-slate-200">
              {[
                { days: 7, label: '7 ngày' },
                { days: 30, label: '30 ngày' },
                { days: 90, label: '3 tháng' },
                { days: 180, label: '6 tháng' },
                { days: 365, label: '12 tháng' },
              ].map(tab => (
                <button
                  key={tab.days}
                  onClick={() => setTimeRange && setTimeRange(tab.days)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                    timeRange === tab.days
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick summary highlights strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <div className="flex flex-col px-2">
              <span className="text-[10px] uppercase font-bold text-slate-400">Tỷ lệ TB</span>
              <span className="text-sm font-extrabold text-blue-600 mt-0.5">{trendStats.avgRate}%</span>
            </div>
            <div className="flex flex-col px-2 border-l border-slate-200/70">
              <span className="text-[10px] uppercase font-bold text-slate-400">Tổng đúng giờ</span>
              <span className="text-sm font-extrabold text-emerald-600 mt-0.5">{trendStats.totalOnTime} lượt</span>
            </div>
            <div className="flex flex-col px-2 border-l border-slate-200/70">
              <span className="text-[10px] uppercase font-bold text-slate-400">Tổng đi muộn</span>
              <span className="text-sm font-extrabold text-amber-600 mt-0.5">{trendStats.totalLate} lượt</span>
            </div>
            <div className="flex flex-col px-2 border-l border-slate-200/70">
              <span className="text-[10px] uppercase font-bold text-slate-400">Cao điểm nhất</span>
              <span className="text-sm font-extrabold text-slate-700 mt-0.5 truncate" title={trendStats.bestDay?.fullDate}>
                {trendStats.bestDay ? `${trendStats.bestDay.date} (${trendStats.bestDay.checkedIn} ng)` : '--'}
              </span>
            </div>
          </div>

          <div className="h-72 w-full mt-auto">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradientCheckedIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="gradientOnTime" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="gradientLate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748B', fontSize: 11, fontWeight: 500 }} 
                  dy={8} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748B', fontSize: 11, fontWeight: 500 }} 
                  allowDecimals={false}
                />
                <RechartsTooltip content={<CustomTrendTooltip />} />
                {chartSeries.checkedIn && (
                  <Area 
                    type="monotone" 
                    dataKey="checkedIn" 
                    name="Đã điểm danh" 
                    stroke="#2563EB" 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill="url(#gradientCheckedIn)" 
                    dot={{ r: 3.5, fill: '#2563EB', strokeWidth: 2, stroke: '#fff' }} 
                    activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2, fill: '#2563EB' }} 
                  />
                )}
                {chartSeries.onTime && (
                  <Area 
                    type="monotone" 
                    dataKey="onTime" 
                    name="Đúng giờ" 
                    stroke="#10B981" 
                    strokeWidth={2.5} 
                    fillOpacity={1} 
                    fill="url(#gradientOnTime)" 
                    dot={{ r: 3, fill: '#10B981', strokeWidth: 1.5, stroke: '#fff' }} 
                    activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2, fill: '#10B981' }} 
                  />
                )}
                {chartSeries.late && (
                  <Area 
                    type="monotone" 
                    dataKey="late" 
                    name="Đi muộn" 
                    stroke="#F59E0B" 
                    strokeWidth={2.5} 
                    fillOpacity={1} 
                    fill="url(#gradientLate)" 
                    dot={{ r: 3, fill: '#F59E0B', strokeWidth: 1.5, stroke: '#fff' }} 
                    activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2, fill: '#F59E0B' }} 
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setChartSeries(s => ({ ...s, checkedIn: !s.checkedIn }))}
              className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                chartSeries.checkedIn 
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs' 
                  : 'bg-slate-50 text-slate-400 border border-slate-200 line-through opacity-60'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-xs"></div>
              <span>Đã điểm danh ({trendStats.totalCheckedIn})</span>
            </button>

            <button
              type="button"
              onClick={() => setChartSeries(s => ({ ...s, onTime: !s.onTime }))}
              className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                chartSeries.onTime 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs' 
                  : 'bg-slate-50 text-slate-400 border border-slate-200 line-through opacity-60'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs"></div>
              <span>Đúng giờ ({trendStats.totalOnTime})</span>
            </button>

            <button
              type="button"
              onClick={() => setChartSeries(s => ({ ...s, late: !s.late }))}
              className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                chartSeries.late 
                  ? 'bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs' 
                  : 'bg-slate-50 text-slate-400 border border-slate-200 line-through opacity-60'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-xs"></div>
              <span>Đi muộn ({trendStats.totalLate})</span>
            </button>
          </div>
        </div>
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 text-lg">Top 10 khoa phòng</h3>
            <select className="border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none bg-slate-50 font-medium">
              <option>Top 10</option>
            </select>
          </div>
          <div className="h-72 w-full mt-auto">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={deptData} margin={{ top: 0, right: 30, left: 30, bottom: 0 }} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                <XAxis type="number" hide domain={[0, 100]} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 11}} width={120} />
                <RechartsTooltip cursor={{fill: 'transparent'}} />
                <Bar dataKey="rate" name="Tỷ lệ" radius={[0, 4, 4, 0]}>
                   {deptData.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill="#16A34A" />
                   ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
            <h3 className="font-bold text-slate-800 text-lg">Danh sách nhân viên</h3>
            <div className="flex items-center gap-3">
               <select value={tableFilter} onChange={e => {setTableFilter(e.target.value); setTablePage(1);}} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-100 outline-none text-slate-700 font-medium bg-slate-50">
                  <option value="not_checked_in">Chưa điểm danh</option>
                  <option value="late_morning">Đi muộn (Ca sáng)</option>
                  <option value="late_afternoon">Đi muộn (Ca chiều)</option>
               </select>
               <button onClick={() => { setShowViewAllModal(true); setViewAllPage(1); }} className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">Xem tất cả</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-slate-50 text-xs text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                      <th className="px-5 py-4">STT</th>
                      <th className="px-5 py-4">Họ và tên</th>
                      <th className="px-5 py-4">Khoa</th>
                      <th className="px-5 py-4">Ca trực</th>
                      <th className="px-5 py-4">Trạng thái</th>
                      <th className="px-5 py-4">Thời gian đi muộn</th>
                      <th className="px-5 py-4">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                  {tableDataList.map((item, i) => (
                  <tr key={item.user?.uid || i} className="hover:bg-slate-50">
                     <td className="px-5 py-3">{(tablePage - 1) * tablePerPage + i + 1}</td>
                     <td className="px-5 py-3">{item.user?.name}</td>
                     <td className="px-5 py-3">{item.user?.department || 'Chưa cập nhật'}</td>
                     <td className="px-5 py-3">{item.shift || '-'}</td>
                     <td className="px-5 py-3">
                       {item.status === 'Chưa điểm danh' ? (
                         <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded font-bold border border-slate-200">Chưa điểm danh</span>
                       ) : (
                         <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded font-bold border border-orange-100">Đi muộn</span>
                       )}
                     </td>
                     <td className="px-5 py-3">
                       {item.lateTime > 0 ? (
                         <span className="font-bold text-orange-600">{item.lateTime} phút</span>
                       ) : '-'}
                     </td>
                     <td className="px-5 py-3 flex gap-2">
                        <button className="w-8 h-8 rounded bg-green-500 text-white flex items-center justify-center hover:bg-green-600 transition-colors"><Phone className="w-4 h-4" /></button>
                        <button className="w-8 h-8 rounded bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors"><MessageSquare className="w-4 h-4" /></button>
                     </td>
                  </tr>
                  ))}
                  {tableDataList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-500">Không có dữ liệu</td>
                    </tr>
                  )}
                </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <span className="text-xs font-semibold text-slate-500">
              Hiển thị {tableDataCount > 0 ? (tablePage - 1) * tablePerPage + 1 : 0} - {Math.min(tablePage * tablePerPage, tableDataCount)} trong tổng số {tableDataCount} nhân viên
            </span>
            {tableDataCount > 0 && (
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setTablePage(p => Math.max(1, p - 1))}
                  disabled={tablePage === 1}
                  className="px-2 py-1 rounded border border-slate-300 text-xs disabled:opacity-50 hover:bg-slate-100 font-medium"
                >Trước</button>
                
                {Array.from({ length: Math.min(5, Math.ceil(tableDataCount / tablePerPage) || 1) }).map((_, idx) => {
                  const totalPages = Math.ceil(tableDataCount / tablePerPage) || 1;
                  let startPage = Math.max(1, tablePage - 2);
                  let endPage = Math.min(totalPages, startPage + 4);
                  if (endPage - startPage < 4) {
                    startPage = Math.max(1, endPage - 4);
                  }
                  const pageNum = startPage + idx;
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setTablePage(pageNum)}
                      className={`w-7 h-7 flex items-center justify-center rounded border text-xs font-medium transition-colors ${
                        tablePage === pageNum 
                          ? 'bg-blue-600 border-blue-600 text-white' 
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button 
                  onClick={() => setTablePage(p => Math.min(Math.ceil(tableDataCount / tablePerPage) || 1, p + 1))}
                  disabled={tablePage === (Math.ceil(tableDataCount / tablePerPage) || 1)}
                  className="px-2 py-1 rounded border border-slate-300 text-xs disabled:opacity-50 hover:bg-slate-100 font-medium"
                >Sau</button>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
            <h3 className="font-bold text-slate-800 text-lg">Hoạt động gần đây</h3>
            <button 
              onClick={() => { setShowRecentActivitiesModal(true); setRecentModalPage(1); }} 
              className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              Xem tất cả
            </button>
          </div>
          <div className="p-5 flex-1 overflow-y-auto">
             <div className="relative border-l-2 border-slate-100 ml-3 space-y-6">
                {recentActivities.map(r => {
                   const u = users.find(x => x.uid === r.userId);
                   const isCheckIn = r.type === 'in';
                   const isLate = r.lateMinutes && r.lateMinutes > 0;
                   return (
                    <div key={r.id} className="relative pl-6">
                       <div className={`absolute -left-[5px] top-1.5 w-2 h-2 rounded-full ${isLate ? 'bg-orange-500' : isCheckIn ? 'bg-green-500' : 'bg-blue-500'} ring-4 ring-white`}></div>
                       <div className="flex justify-between items-start">
                         <div>
                           <div className="text-sm font-bold text-slate-800">{r.userName || u?.name}</div>
                           <div className={`text-xs font-medium mt-1 ${isLate ? 'text-orange-600' : isCheckIn ? 'text-green-600' : 'text-blue-600'}`}>
                              {isLate ? 'Đi muộn' : isCheckIn ? 'Check-in' : 'Check-out'}
                           </div>
                         </div>
                         <span className="text-xs font-bold text-slate-400">{format(new Date(r.timestamp), 'HH:mm')}</span>
                       </div>
                    </div>
                   );
                })}
                {recentActivities.length === 0 && (
                  <div className="text-sm text-slate-500 text-center py-4">Chưa có hoạt động nào</div>
                )}
             </div>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
          <h3 className="font-bold text-slate-800 text-lg mb-6">Thống kê tình trạng <span className="font-normal text-slate-500 text-sm">(Hôm nay)</span></h3>
          <div className="flex-1 flex flex-col justify-center gap-6">
             {/* Stacked Bar Visual */}
             <div className="w-full h-12 flex rounded-lg overflow-hidden shadow-inner bg-slate-100">
               {onTimePct > 0 && <div className="bg-green-600 h-full flex items-center justify-center text-white font-bold text-xs shadow-sm border-l border-white/20" style={{width: `${onTimePct}%`}}>{onTimeCount}</div>}
               {latePct > 0 && <div className="bg-orange-500 h-full flex items-center justify-center text-white font-bold text-xs shadow-sm border-l border-white/20" style={{width: `${latePct}%`}}>{lateCount}</div>}
               {absentPct > 0 && <div className="bg-red-600 h-full flex items-center justify-center text-white font-bold text-xs shadow-sm border-l border-white/20" style={{width: `${absentPct}%`}}>{absentCount}</div>}
             </div>
             
             <div className="flex flex-wrap gap-4 justify-center">
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-600 rounded-sm shadow-sm"></div><span className="text-xs font-medium text-slate-600">Đúng giờ</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-500 rounded-sm shadow-sm"></div><span className="text-xs font-medium text-slate-600">Đi muộn</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-600 rounded-sm shadow-sm"></div><span className="text-xs font-medium text-slate-600">Nghỉ phép</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-600 rounded-sm shadow-sm"></div><span className="text-xs font-medium text-slate-600">Vắng</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-purple-500 rounded-sm shadow-sm"></div><span className="text-xs font-medium text-slate-600">Làm thêm</span></div>
             </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
          <h3 className="font-bold text-slate-800 text-lg mb-6">Thống kê dữ liệu (Hôm nay)</h3>
          <div className="grid grid-cols-2 gap-4 flex-1 content-start">
             <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex flex-col gap-1"><span className="text-xs font-semibold text-slate-500">Lượt thành công</span></div>
                <span className="text-sm font-bold text-green-700">{todayRecords.filter(r => r.status === 'success').length}</span>
             </div>
             <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex flex-col gap-1"><span className="text-xs font-semibold text-slate-500">Sai vị trí</span></div>
                <span className="text-sm font-bold text-orange-700">{todayRecords.filter(r => r.status === 'failed').length}</span>
             </div>
             <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex flex-col gap-1"><span className="text-xs font-semibold text-slate-500">Lỗi mã QR</span></div>
                <span className="text-sm font-bold text-red-700">{todayRecords.filter(r => r.status === 'invalid_qr').length}</span>
             </div>
             <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex flex-col gap-1"><span className="text-xs font-semibold text-slate-500">Lỗi hệ thống</span></div>
                <span className="text-sm font-bold text-purple-700">{todayRecords.filter(r => r.status === 'error').length}</span>
             </div>
             <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex flex-col gap-1"><span className="text-xs font-semibold text-slate-500">Tổng lượt quét</span></div>
                <span className="text-sm font-bold text-blue-700">{todayRecords.length}</span>
             </div>
             <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex flex-col gap-1"><span className="text-xs font-semibold text-slate-500">Người điểm danh</span></div>
                <span className="text-sm font-bold text-slate-700">{checkedInCount}</span>
             </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col relative overflow-hidden lg:col-span-2">
          <h3 className="font-bold text-slate-800 text-lg mb-4">Bản đồ nhân viên (GPS)</h3>
          <div className="flex-1 bg-slate-100 rounded-lg overflow-hidden relative min-h-[200px] border border-slate-200">
             <LocationMap 
               centerLat={config.targetLat}
               centerLng={config.targetLng}
               radius={config.radius}
             />
          </div>
          <div className="absolute top-16 right-8 bg-white p-3 rounded-lg shadow-lg border border-slate-100 text-xs font-bold flex flex-col gap-2">
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>Trong vùng <span className="text-green-600 ml-auto">{inAreaCount}</span></div>
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div>Ngoài vùng <span className="text-orange-500 ml-auto">{outAreaCount}</span></div>
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>Check-in hôm nay <span className="text-blue-600 ml-auto">{checkedInCount}</span></div>
          </div>
        </div>
      </div>

      {/* Dynamic System Status & Performance Monitor */}
      <SystemStatusMonitor />
    
      {showViewAllModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[120] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">
                Danh sách {tableFilter === 'not_checked_in' ? 'Chưa điểm danh' : 'Đi muộn'} ({tableDataFull.length})
              </h3>
              <div className="flex items-center gap-3">
                <button 
                  onClick={exportViewAllToExcel}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" /> Xuất Excel
                </button>
                <button onClick={() => setShowViewAllModal(false)} className="w-8 h-8 flex items-center justify-center bg-slate-200 text-slate-600 rounded-full hover:bg-slate-300">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-0">
               <table className="w-full text-left whitespace-nowrap">
                  <thead className="bg-slate-50 text-xs text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                        <th className="px-5 py-4">STT</th>
                        <th className="px-5 py-4">Họ và tên</th>
                        <th className="px-5 py-4">Khoa / Phòng</th>
                        <th className="px-5 py-4">Trạng thái</th>
                        <th className="px-5 py-4">Ca trực</th>
                        <th className="px-5 py-4">Số phút đi muộn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                    {viewAllDataList.map((item, i) => (
                    <tr key={item.user?.uid || i} className="hover:bg-slate-50">
                       <td className="px-5 py-3">{(viewAllPage - 1) * viewAllPerPage + i + 1}</td>
                       <td className="px-5 py-3">{item.user?.name}</td>
                       <td className="px-5 py-3">{item.user?.department || 'Chưa cập nhật'}</td>
                       <td className="px-5 py-3">
                         {item.status === 'Chưa điểm danh' ? (
                           <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded font-bold border border-slate-200">Chưa điểm danh</span>
                         ) : (
                           <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded font-bold border border-orange-100">Đi muộn</span>
                         )}
                       </td>
                       <td className="px-5 py-3">{item.shift || '-'}</td>
                       <td className="px-5 py-3">
                         {item.lateTime > 0 ? (
                           <span className="font-bold text-orange-600">{item.lateTime} phút</span>
                         ) : '-'}
                       </td>
                    </tr>
                    ))}
                    {viewAllDataList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-slate-500">Không có dữ liệu</td>
                      </tr>
                    )}
                  </tbody>
               </table>
            </div>
            
            {/* Phân trang */}
            {tableDataFull.length > viewAllPerPage && (
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <span className="text-sm text-slate-500 font-medium">Hiển thị {(viewAllPage - 1) * viewAllPerPage + 1} - {Math.min(viewAllPage * viewAllPerPage, tableDataFull.length)} trong tổng số {tableDataFull.length}</span>
                <div className="flex gap-1">
                   <button 
                     disabled={viewAllPage === 1}
                     onClick={() => setViewAllPage(p => Math.max(1, p - 1))}
                     className="px-3 py-1.5 border border-slate-300 rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed bg-white shadow-sm"
                   >
                     Trước
                   </button>
                   <button 
                     disabled={viewAllPage >= Math.ceil(tableDataFull.length / viewAllPerPage)}
                     onClick={() => setViewAllPage(p => p + 1)}
                     className="px-3 py-1.5 border border-slate-300 rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed bg-white shadow-sm"
                   >
                     Sau
                   </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Xem tất cả hoạt động gần đây */}
      {showRecentActivitiesModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[120] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-5 border-b border-slate-200 flex flex-wrap gap-3 justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800">
                    Tất cả hoạt động gần đây
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Tổng cộng {filteredRecentActivities.length} lượt điểm danh / quét mã
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={exportRecentActivitiesToExcel}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" /> Xuất Excel
                </button>
                <button 
                  onClick={() => setShowRecentActivitiesModal(false)} 
                  className="w-9 h-9 flex items-center justify-center bg-slate-200 text-slate-600 rounded-full hover:bg-slate-300 transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="p-4 border-b border-slate-100 bg-white flex flex-wrap gap-3 items-center justify-between">
              <div className="flex flex-wrap gap-3 items-center flex-1">
                <input 
                  type="text"
                  placeholder="Tìm kiếm theo tên nhân viên, mã NV..."
                  value={recentSearchQuery}
                  onChange={e => { setRecentSearchQuery(e.target.value); setRecentModalPage(1); }}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none w-72 text-slate-700"
                />
                <select
                  value={recentDeptFilter}
                  onChange={e => { setRecentDeptFilter(e.target.value); setRecentModalPage(1); }}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none text-slate-700 bg-slate-50"
                >
                  <option value="">Tất cả khoa / phòng</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Tìm thấy {filteredRecentActivities.length} kết quả
              </span>
            </div>
            
            {/* Table */}
            <div className="flex-1 overflow-auto p-0">
               <table className="w-full text-left whitespace-nowrap">
                  <thead className="bg-slate-50 text-xs text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                        <th className="px-5 py-3.5">STT</th>
                        <th className="px-5 py-3.5">Thời gian</th>
                        <th className="px-5 py-3.5">Mã NV</th>
                        <th className="px-5 py-3.5">Họ và tên</th>
                        <th className="px-5 py-3.5">Khoa / Phòng</th>
                        <th className="px-5 py-3.5">Hoạt động</th>
                        <th className="px-5 py-3.5">Khoảng cách</th>
                        <th className="px-5 py-3.5">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                    {paginatedRecentActivities.map((r, i) => {
                      const u = users.find(x => x.uid === r.userId);
                      const isCheckIn = r.type === 'in';
                      const isLate = r.lateMinutes && r.lateMinutes > 0;
                      return (
                        <tr key={r.id || i} className="hover:bg-slate-50 transition-colors">
                           <td className="px-5 py-3 text-slate-500">{(recentModalPage - 1) * recentModalPerPage + i + 1}</td>
                           <td className="px-5 py-3 font-mono text-xs text-slate-600">
                             {format(new Date(r.timestamp), 'dd/MM/yyyy HH:mm:ss')}
                           </td>
                           <td className="px-5 py-3 font-mono text-xs text-slate-500 font-semibold">{r.userId || u?.uid || '-'}</td>
                           <td className="px-5 py-3 font-bold text-slate-800">{r.userName || u?.name}</td>
                           <td className="px-5 py-3 text-slate-600">{r.department || u?.department || 'Chưa cập nhật'}</td>
                           <td className="px-5 py-3">
                             <div className="flex items-center gap-1.5">
                               <span className={`w-2 h-2 rounded-full ${isLate ? 'bg-orange-500' : isCheckIn ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                               <span className={`text-xs font-bold ${isLate ? 'text-orange-600' : isCheckIn ? 'text-green-700' : 'text-blue-700'}`}>
                                 {isCheckIn ? 'Vào ca' : 'Ra ca'}
                                 {isLate && <span className="ml-1 text-[11px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-normal">(Muộn {r.lateMinutes}p)</span>}
                               </span>
                             </div>
                           </td>
                           <td className="px-5 py-3 text-xs text-slate-500 font-mono">
                             {r.distance !== undefined ? `${Math.round(r.distance)}m` : '-'}
                           </td>
                           <td className="px-5 py-3">
                             {r.status === 'success' ? (
                               <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-bold border border-green-200">
                                 Hợp lệ
                               </span>
                             ) : r.status === 'failed' ? (
                               <span className="text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full font-bold border border-orange-200">
                                 Sai vị trí
                               </span>
                             ) : (
                               <span className="text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full font-bold border border-red-200">
                                 {r.status || 'Lỗi'}
                               </span>
                             )}
                           </td>
                        </tr>
                      );
                    })}
                    {paginatedRecentActivities.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-5 py-10 text-center text-slate-500 font-medium">
                          Không tìm thấy hoạt động nào phù hợp
                        </td>
                      </tr>
                    )}
                  </tbody>
               </table>
            </div>
            
            {/* Phân trang */}
            {filteredRecentActivities.length > recentModalPerPage && (
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <span className="text-sm text-slate-500 font-medium">
                  Hiển thị {(recentModalPage - 1) * recentModalPerPage + 1} - {Math.min(recentModalPage * recentModalPerPage, filteredRecentActivities.length)} trong tổng số {filteredRecentActivities.length}
                </span>
                <div className="flex gap-1">
                   <button 
                     disabled={recentModalPage === 1}
                     onClick={() => setRecentModalPage(p => Math.max(1, p - 1))}
                     className="px-3 py-1.5 border border-slate-300 rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed bg-white shadow-sm"
                   >
                     Trước
                   </button>
                   <button 
                     disabled={recentModalPage >= Math.ceil(filteredRecentActivities.length / recentModalPerPage)}
                     onClick={() => setRecentModalPage(p => p + 1)}
                     className="px-3 py-1.5 border border-slate-300 rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed bg-white shadow-sm"
                   >
                     Sau
                   </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
</div>
  );
}
