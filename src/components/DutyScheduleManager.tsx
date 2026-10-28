import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, Upload, Download, Plus, Trash2, Edit3, Search, Filter, 
  ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Clock, 
  User, Building, RefreshCw, FileSpreadsheet, Eye, X, Check, ArrowRight
} from 'lucide-react';
import { format, addWeeks, subWeeks, parseISO, isSameDay } from 'date-fns';
import { DutyShift, UserData, Department } from '../types';
import { 
  getWeekDates, 
  generateDutyScheduleExcelTemplate, 
  parseDutyScheduleExcel, 
  exportDutyScheduleToExcel,
  DAY_NAMES_VI,
  DUTY_ROLES,
  SHIFT_TYPES
} from '../lib/dutyExcel';
import { apiFetch } from '../lib/api';

interface DutyScheduleManagerProps {
  users: UserData[];
  departments: Department[];
  canEdit: boolean;
  canDelete: boolean;
}

export function DutyScheduleManager({ users, departments, canEdit, canDelete }: DutyScheduleManagerProps) {
  const [currentBaseDate, setCurrentBaseDate] = useState<Date>(new Date());
  const [shifts, setShifts] = useState<DutyShift[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterDept, setFilterDept] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'matrix' | 'list' | 'daily'>('matrix');

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [parsedPreview, setParsedPreview] = useState<{
    shifts: DutyShift[];
    errors: string[];
    warnings: string[];
    weekStartDate: string;
    weekEndDate: string;
    weekNumber: number;
    year: number;
    totalParsed: number;
  } | null>(null);
  const [overwriteWeek, setOverwriteWeek] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual Add / Edit Modal state
  const [showShiftModal, setShowShiftModal] = useState<boolean>(false);
  const [editingShift, setEditingShift] = useState<DutyShift | null>(null);
  const [modalForm, setModalForm] = useState<{
    userId: string;
    userName: string;
    department: string;
    dutyRole: string;
    shiftName: string;
    dateStr: string;
    startTime: string;
    endTime: string;
    note: string;
  }>({
    userId: '',
    userName: '',
    department: '',
    dutyRole: 'Trực Bác sĩ',
    shiftName: 'Trực 24/24',
    dateStr: format(new Date(), 'yyyy-MM-dd'),
    startTime: '07:30',
    endTime: '07:30',
    note: ''
  });

  // Notification / Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const weekInfo = getWeekDates(currentBaseDate);

  // Fetch shifts for current week
  const fetchShifts = async () => {
    setLoading(true);
    try {
      const url = `/api/duty_shifts?startDate=${weekInfo.weekStartDateStr}&endDate=${weekInfo.weekEndDateStr}`;
      const res = await apiFetch<DutyShift[]>(url);
      if (res.ok && Array.isArray(res.data)) {
        setShifts(res.data);
      }
    } catch (err) {
      console.error('Error fetching duty shifts:', err);
      showToast('Lỗi khi tải dữ liệu lịch trực', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
  }, [weekInfo.weekStartDateStr, weekInfo.weekEndDateStr]);

  const handlePrevWeek = () => {
    setCurrentBaseDate(subWeeks(currentBaseDate, 1));
  };

  const handleNextWeek = () => {
    setCurrentBaseDate(addWeeks(currentBaseDate, 1));
  };

  const handleCurrentWeek = () => {
    setCurrentBaseDate(new Date());
  };

  // Filtered shifts
  const filteredShifts = shifts.filter(s => {
    const matchDept = filterDept === 'ALL' || s.department === filterDept;
    const matchSearch = !searchQuery || 
      s.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.userId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.dutyRole?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.shiftName?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchDept && matchSearch;
  });

  // Handle Excel File Upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await parseDutyScheduleExcel(file, currentBaseDate, users);
      setParsedPreview(result);
      setShowUploadModal(true);
    } catch (err: any) {
      showToast('Lỗi khi đọc file Excel: ' + err.message, 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Save parsed shifts to backend
  const handleSaveParsedShifts = async () => {
    if (!parsedPreview || parsedPreview.shifts.length === 0) return;

    setLoading(true);
    try {
      const res = await apiFetch('/api/duty_shifts/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shifts: parsedPreview.shifts,
          overwriteWeek,
          weekStartDate: parsedPreview.weekStartDate || weekInfo.weekStartDateStr,
          weekEndDate: parsedPreview.weekEndDate || weekInfo.weekEndDateStr,
          department: filterDept !== 'ALL' ? filterDept : undefined
        })
      });

      if (res.ok) {
        showToast(`Đã lưu thành công ${res.data?.count || parsedPreview.shifts.length} ca trực vào hệ thống!`);
        setShowUploadModal(false);
        setParsedPreview(null);
        fetchShifts();
      } else {
        showToast(`Lưu thất bại: ${res.error || 'Lỗi hệ thống'}`, 'error');
      }
    } catch (err: any) {
      showToast(`Lỗi: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle single shift add/edit save
  const handleSaveShift = async () => {
    if (!modalForm.userName || !modalForm.dateStr) {
      showToast('Vui lòng nhập đầy đủ tên nhân viên và ngày trực', 'error');
      return;
    }

    try {
      const dayIdx = (parseISO(modalForm.dateStr).getDay() + 6) % 7; // Monday = 0
      const dayOfWeek = DAY_NAMES_VI[dayIdx] || 'Thứ 2';
      const shiftData: Partial<DutyShift> = {
        ...modalForm,
        dayOfWeek,
        weekNumber: weekInfo.weekNumber,
        year: weekInfo.year,
        weekStartDate: weekInfo.weekStartDateStr,
        weekEndDate: weekInfo.weekEndDateStr
      };

      let res;
      if (editingShift && editingShift.id) {
        res = await apiFetch(`/api/duty_shifts/${editingShift.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shiftData)
        });
      } else {
        res = await apiFetch('/api/duty_shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shiftData)
        });
      }

      if (res.ok) {
        showToast(editingShift ? 'Đã cập nhật ca trực!' : 'Đã thêm ca trực mới!');
        setShowShiftModal(false);
        setEditingShift(null);
        fetchShifts();
      } else {
        showToast('Không thể lưu ca trực: ' + (res.error || 'Lỗi'), 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Handle single shift delete
  const handleDeleteShift = async (id: number | string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa ca trực này?')) return;
    try {
      const res = await apiFetch(`/api/duty_shifts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Đã xóa ca trực');
        fetchShifts();
      }
    } catch (err) {
      showToast('Lỗi khi xóa ca trực', 'error');
    }
  };

  // Handle clear entire week schedule
  const handleClearWeek = async () => {
    const confirmMsg = filterDept === 'ALL' 
      ? `Bạn có chắc chắn muốn xóa TOÀN BỘ lịch trực của Tuần ${weekInfo.weekNumber} (${weekInfo.weekStartDateStr} - ${weekInfo.weekEndDateStr})?`
      : `Bạn có chắc chắn muốn xóa lịch trực Tuần ${weekInfo.weekNumber} của khoa [${filterDept}]?`;
    
    if (!confirm(confirmMsg)) return;

    try {
      const url = `/api/duty_shifts/week/clear?weekStartDate=${weekInfo.weekStartDateStr}&weekEndDate=${weekInfo.weekEndDateStr}&department=${encodeURIComponent(filterDept)}`;
      const res = await apiFetch(url, { method: 'DELETE' });
      if (res.ok) {
        showToast('Đã xóa sạch lịch trực của tuần');
        fetchShifts();
      }
    } catch (err) {
      showToast('Lỗi khi xóa lịch tuần', 'error');
    }
  };

  // Prepare Matrix structure (Group by user)
  const userMatrixMap = new Map<string, {
    userName: string;
    userId: string;
    department: string;
    dutyRole: string;
    shiftsByDate: Record<string, DutyShift>;
  }>();

  filteredShifts.forEach(shift => {
    const key = `${shift.userName}_${shift.department || ''}`;
    if (!userMatrixMap.has(key)) {
      userMatrixMap.set(key, {
        userName: shift.userName,
        userId: shift.userId || '',
        department: shift.department || '',
        dutyRole: shift.dutyRole || 'Trực chuyên môn',
        shiftsByDate: {}
      });
    }
    const userRow = userMatrixMap.get(key)!;
    userRow.shiftsByDate[shift.dateStr] = shift;
  });

  const matrixRows = Array.from(userMatrixMap.values());

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50 relative">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[100] px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-bold animate-in fade-in slide-in-from-top-3 ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.message}
        </div>
      )}

      {/* Top Header / Action Bar */}
      <div className="bg-white border-b border-slate-200 p-4 shrink-0 shadow-sm flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" /> Quản lý Lịch trực tuần
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Nhập từ file Excel, phân ca trực tự động và đồng bộ trực tiếp lên màn hình điểm danh nhân viên
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => generateDutyScheduleExcelTemplate(users, departments, currentBaseDate)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors border border-slate-300"
              title="Tải file mẫu Excel chuẩn bệnh viện"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>Tải file mẫu Excel</span>
            </button>

            {canEdit && (
              <>
                <label className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm active:scale-95">
                  <Upload className="w-4 h-4" />
                  <span>Tải lên file trực tuần</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>

                <button
                  onClick={() => {
                    setEditingShift(null);
                    setModalForm({
                      userId: '',
                      userName: '',
                      department: filterDept !== 'ALL' ? filterDept : (departments[0]?.name || ''),
                      dutyRole: 'Trực Bác sĩ',
                      shiftName: 'Trực 24/24',
                      dateStr: format(currentBaseDate, 'yyyy-MM-dd'),
                      startTime: '07:30',
                      endTime: '07:30',
                      note: ''
                    });
                    setShowShiftModal(true);
                  }}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm ca trực</span>
                </button>
              </>
            )}

            <button
              onClick={() => exportDutyScheduleToExcel(shifts, weekInfo.weekStartDateStr, weekInfo.weekEndDateStr, filterDept)}
              disabled={shifts.length === 0}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-sm"
              title="Xuất dữ liệu lịch trực hiện tại ra file Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Xuất Excel</span>
            </button>
          </div>
        </div>

        {/* Week Navigator & Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          {/* Week Navigation */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={handlePrevWeek}
              className="p-1.5 hover:bg-white text-slate-700 rounded-lg transition-colors"
              title="Tuần trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={handleCurrentWeek}
              className="px-2 py-1 text-xs font-bold bg-white text-blue-700 rounded-md shadow-xs hover:bg-blue-50 transition-colors"
            >
              Tuần này
            </button>

            <div className="px-2 flex items-center gap-1.5 font-bold text-xs text-slate-800">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Tuần {weekInfo.weekNumber}/{weekInfo.year}:</span>
              <span className="text-blue-700">{format(weekInfo.start, 'dd/MM/yyyy')}</span>
              <ArrowRight className="w-3 h-3 text-slate-400 inline" />
              <span className="text-blue-700">{format(weekInfo.end, 'dd/MM/yyyy')}</span>
            </div>

            <button
              onClick={handleNextWeek}
              className="p-1.5 hover:bg-white text-slate-700 rounded-lg transition-colors"
              title="Tuần sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Filters: Department & Search */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Department Filter */}
            <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-slate-300">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="text-xs font-bold text-slate-700 outline-none bg-transparent"
              >
                <option value="ALL">Tất cả khoa phòng</option>
                {departments.map(d => (
                  <option key={d.id || d.name} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* Search query */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm tên, mã NV, vị trí..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none w-44"
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold">
              <button
                onClick={() => setViewMode('matrix')}
                className={`px-2.5 py-1 rounded-md transition-all ${viewMode === 'matrix' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Ma trận tuần
              </button>
              <button
                onClick={() => setViewMode('daily')}
                className={`px-2.5 py-1 rounded-md transition-all ${viewMode === 'daily' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Theo từng ngày
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Danh sách
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={fetchShifts}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg border border-slate-200 transition-colors"
              title="Tải lại dữ liệu"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            {canDelete && shifts.length > 0 && (
              <button
                onClick={handleClearWeek}
                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200 transition-colors"
                title="Xóa toàn bộ lịch tuần này"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium">Đang tải lịch trực...</p>
          </div>
        ) : filteredShifts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto shadow-sm my-8">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
              <Calendar className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">Chưa có lịch trực cho Tuần {weekInfo.weekNumber}</h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Bạn có thể tải lên file Excel lịch trực của tuần này hoặc tải file mẫu Excel chuẩn để điền và đưa vào hệ thống.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => generateDutyScheduleExcelTemplate(users, departments, currentBaseDate)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-2 border border-slate-300 transition-colors"
              >
                <Download className="w-4 h-4" /> Tải file mẫu Excel
              </button>
              {canEdit && (
                <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-md transition-colors">
                  <Upload className="w-4 h-4" /> Tải lên file trực tuần
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>
          </div>
        ) : viewMode === 'matrix' ? (
          /* MATRIX VIEW */
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3 w-12 text-center">STT</th>
                    <th className="p-3 min-w-[140px]">Khoa / Phòng</th>
                    <th className="p-3 min-w-[80px]">Mã NV</th>
                    <th className="p-3 min-w-[160px]">Họ và tên</th>
                    <th className="p-3 min-w-[130px]">Vị trí trực</th>
                    {weekInfo.days.map((d) => {
                      const isToday = isSameDay(d.date, new Date());
                      return (
                        <th
                          key={d.dateStr}
                          className={`p-3 min-w-[120px] text-center border-l border-slate-200 ${
                            isToday ? 'bg-blue-50 text-blue-800' : ''
                          }`}
                        >
                          <div className="font-bold">{d.dayName}</div>
                          <div className="text-[10px] font-medium text-slate-500">{format(d.date, 'dd/MM')}</div>
                          {isToday && (
                            <span className="inline-block px-1.5 py-0.2 bg-blue-600 text-white text-[9px] font-bold rounded mt-0.5">
                              Hôm nay
                            </span>
                          )}
                        </th>
                      );
                    })}
                    <th className="p-3 w-20 text-center border-l border-slate-200">Tổng ca</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matrixRows.map((row, idx) => {
                    let totalShifts = 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 text-center text-slate-500 font-medium">{idx + 1}</td>
                        <td className="p-3 font-semibold text-slate-700">{row.department || '-'}</td>
                        <td className="p-3 font-mono text-slate-600">{row.userId || '-'}</td>
                        <td className="p-3 font-bold text-slate-900">{row.userName}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium text-[11px] border border-slate-200">
                            {row.dutyRole}
                          </span>
                        </td>
                        {weekInfo.days.map((d) => {
                          const shift = row.shiftsByDate[d.dateStr];
                          const isToday = isSameDay(d.date, new Date());
                          if (shift) totalShifts++;

                          return (
                            <td
                              key={d.dateStr}
                              className={`p-2 text-center border-l border-slate-100 relative group ${
                                isToday ? 'bg-blue-50/40' : ''
                              }`}
                            >
                              {shift ? (
                                <div className="p-1.5 bg-blue-100/70 border border-blue-200 text-blue-900 rounded-lg text-center font-bold text-[11px] shadow-xs flex flex-col gap-0.5">
                                  <span>{shift.shiftName || 'Trực 24/24'}</span>
                                  {shift.startTime && (
                                    <span className="text-[9px] text-blue-600 font-normal">
                                      {shift.startTime} - {shift.endTime}
                                    </span>
                                  )}
                                  {canEdit && (
                                    <div className="absolute inset-0 bg-slate-900/60 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 transition-opacity">
                                      <button
                                        onClick={() => {
                                          setEditingShift(shift);
                                          setModalForm({
                                            userId: shift.userId || '',
                                            userName: shift.userName || '',
                                            department: shift.department || '',
                                            dutyRole: shift.dutyRole || 'Trực Bác sĩ',
                                            shiftName: shift.shiftName || 'Trực 24/24',
                                            dateStr: shift.dateStr,
                                            startTime: shift.startTime || '07:30',
                                            endTime: shift.endTime || '07:30',
                                            note: shift.note || ''
                                          });
                                          setShowShiftModal(true);
                                        }}
                                        className="p-1 bg-white text-blue-600 rounded hover:bg-blue-50"
                                        title="Chỉnh sửa"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                      </button>
                                      {canDelete && (
                                        <button
                                          onClick={() => handleDeleteShift(shift.id!)}
                                          className="p-1 bg-white text-red-600 rounded hover:bg-red-50"
                                          title="Xóa"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ) : canEdit ? (
                                <button
                                  onClick={() => {
                                    setEditingShift(null);
                                    setModalForm({
                                      userId: row.userId,
                                      userName: row.userName,
                                      department: row.department,
                                      dutyRole: row.dutyRole,
                                      shiftName: 'Trực 24/24',
                                      dateStr: d.dateStr,
                                      startTime: '07:30',
                                      endTime: '07:30',
                                      note: ''
                                    });
                                    setShowShiftModal(true);
                                  }}
                                  className="w-full h-8 border border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-300 hover:text-blue-600 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                                  title="Gán ca trực ngày này"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-slate-300 font-mono">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-3 text-center font-bold text-blue-700 border-l border-slate-100">
                          {totalShifts}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : viewMode === 'daily' ? (
          /* DAILY BREAKDOWN VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {weekInfo.days.map((d) => {
              const dayShifts = filteredShifts.filter(s => s.dateStr === d.dateStr);
              const isToday = isSameDay(d.date, new Date());

              return (
                <div
                  key={d.dateStr}
                  className={`bg-white rounded-2xl border ${
                    isToday ? 'border-blue-300 shadow-md ring-2 ring-blue-100' : 'border-slate-200 shadow-sm'
                  } p-4 flex flex-col`}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-sm text-slate-800">{d.dayName}</span>
                        {isToday && (
                          <span className="px-2 py-0.5 bg-blue-600 text-white text-[9px] font-black rounded-full">
                            Hôm nay
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 font-medium">{format(d.date, 'dd/MM/yyyy')}</span>
                    </div>
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-bold text-xs rounded-lg">
                      {dayShifts.length} người trực
                    </span>
                  </div>

                  <div className="flex-1 space-y-2 overflow-y-auto max-h-72 pr-1">
                    {dayShifts.length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-6">Không có ca trực</p>
                    ) : (
                      dayShifts.map((shift) => (
                        <div
                          key={shift.id}
                          className="p-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-100 flex items-start justify-between gap-2 transition-colors"
                        >
                          <div>
                            <p className="font-bold text-xs text-slate-800">{shift.userName}</p>
                            <p className="text-[11px] text-slate-500">{shift.department} • {shift.dutyRole}</p>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
                                {shift.shiftName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {shift.startTime} - {shift.endTime}
                              </span>
                            </div>
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setEditingShift(shift);
                                  setModalForm({
                                    userId: shift.userId || '',
                                    userName: shift.userName || '',
                                    department: shift.department || '',
                                    dutyRole: shift.dutyRole || 'Trực Bác sĩ',
                                    shiftName: shift.shiftName || 'Trực 24/24',
                                    dateStr: shift.dateStr,
                                    startTime: shift.startTime || '07:30',
                                    endTime: shift.endTime || '07:30',
                                    note: shift.note || ''
                                  });
                                  setShowShiftModal(true);
                                }}
                                className="p-1 text-slate-400 hover:text-blue-600 rounded"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {canDelete && (
                                <button
                                  onClick={() => handleDeleteShift(shift.id!)}
                                  className="p-1 text-slate-400 hover:text-red-600 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* LIST VIEW */
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">STT</th>
                  <th className="p-3">Ngày trực</th>
                  <th className="p-3">Thứ</th>
                  <th className="p-3">Khoa / Phòng</th>
                  <th className="p-3">Mã NV</th>
                  <th className="p-3">Họ và tên</th>
                  <th className="p-3">Vị trí trực</th>
                  <th className="p-3">Ca trực</th>
                  <th className="p-3">Giờ trực</th>
                  <th className="p-3">Ghi chú</th>
                  {canEdit && <th className="p-3 text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredShifts.map((shift, idx) => (
                  <tr key={shift.id || idx} className="hover:bg-slate-50">
                    <td className="p-3 text-slate-500 font-medium">{idx + 1}</td>
                    <td className="p-3 font-bold text-slate-800">{format(parseISO(shift.dateStr), 'dd/MM/yyyy')}</td>
                    <td className="p-3 text-slate-600">{shift.dayOfWeek}</td>
                    <td className="p-3 font-medium text-slate-700">{shift.department || '-'}</td>
                    <td className="p-3 font-mono text-slate-600">{shift.userId || '-'}</td>
                    <td className="p-3 font-bold text-slate-900">{shift.userName}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium text-[11px]">
                        {shift.dutyRole}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md font-bold text-[11px]">
                        {shift.shiftName}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-500 text-[11px]">{shift.startTime} - {shift.endTime}</td>
                    <td className="p-3 text-slate-500">{shift.note || '-'}</td>
                    {canEdit && (
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditingShift(shift);
                              setModalForm({
                                userId: shift.userId || '',
                                userName: shift.userName || '',
                                department: shift.department || '',
                                dutyRole: shift.dutyRole || 'Trực Bác sĩ',
                                shiftName: shift.shiftName || 'Trực 24/24',
                                dateStr: shift.dateStr,
                                startTime: shift.startTime || '07:30',
                                endTime: shift.endTime || '07:30',
                                note: shift.note || ''
                              });
                              setShowShiftModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => handleDeleteShift(shift.id!)}
                              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Excel Upload Preview & Confirmation */}
      {showUploadModal && parsedPreview && (
        <div className="fixed inset-0 bg-slate-900/60 z-[120] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">Xác nhận nhập Lịch trực tuần từ Excel</h3>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {/* Summary Banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-bold text-blue-900">
                    Tuần phát hiện: Tuần {parsedPreview.weekNumber}/{parsedPreview.year} ({parsedPreview.weekStartDate} đến {parsedPreview.weekEndDate})
                  </p>
                  <p className="text-blue-700 mt-0.5">
                    Tổng số ca trực hợp lệ được trích xuất: <strong className="text-blue-900 text-sm">{parsedPreview.totalParsed}</strong> ca
                  </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-blue-300 font-bold text-blue-900">
                  <input
                    type="checkbox"
                    checked={overwriteWeek}
                    onChange={(e) => setOverwriteWeek(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>Ghi đè lịch trực cũ của tuần này</span>
                </label>
              </div>

              {/* Warnings / Errors */}
              {parsedPreview.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    {parsedPreview.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">STT</th>
                      <th className="p-2.5">Khoa / Phòng</th>
                      <th className="p-2.5">Mã NV</th>
                      <th className="p-2.5">Họ và tên</th>
                      <th className="p-2.5">Vị trí trực</th>
                      <th className="p-2.5">Ca trực</th>
                      <th className="p-2.5">Ngày trực</th>
                      <th className="p-2.5">Thứ</th>
                      <th className="p-2.5">Giờ trực</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedPreview.shifts.map((s, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 text-slate-500 font-medium">{idx + 1}</td>
                        <td className="p-2 font-medium text-slate-700">{s.department}</td>
                        <td className="p-2 font-mono text-slate-600">{s.userId || '-'}</td>
                        <td className="p-2 font-bold text-slate-900">{s.userName}</td>
                        <td className="p-2 text-slate-700">{s.dutyRole}</td>
                        <td className="p-2">
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[10px]">
                            {s.shiftName}
                          </span>
                        </td>
                        <td className="p-2 font-bold text-slate-800">{s.dateStr}</td>
                        <td className="p-2 text-slate-600">{s.dayOfWeek}</td>
                        <td className="p-2 font-mono text-slate-500 text-[10px]">{s.startTime} - {s.endTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-100 transition-colors"
              >
                HỦY BỎ
              </button>
              <button
                onClick={handleSaveParsedShifts}
                disabled={loading || parsedPreview.shifts.length === 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>LƯU LỊCH TRỰC VÀO HỆ THỐNG</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add / Edit Single Duty Shift */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[120] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="p-4 bg-blue-700 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {editingShift ? 'Chỉnh sửa ca trực' : 'Thêm ca trực mới'}
              </h3>
              <button
                onClick={() => setShowShiftModal(false)}
                className="p-1 hover:bg-blue-600 rounded-lg text-blue-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Họ và tên nhân viên *</label>
                <input
                  type="text"
                  list="employee-suggestions"
                  value={modalForm.userName}
                  onChange={(e) => {
                    const val = e.target.value;
                    const matched = users.find(u => u.name?.toLowerCase() === val.toLowerCase());
                    setModalForm({
                      ...modalForm,
                      userName: val,
                      userId: matched?.uid || modalForm.userId,
                      department: matched?.department || modalForm.department
                    });
                  }}
                  placeholder="Nhập hoặc chọn tên nhân viên..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
                <datalist id="employee-suggestions">
                  {users.map(u => (
                    <option key={u.uid} value={u.name}>{u.department} ({u.uid})</option>
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mã nhân viên</label>
                  <input
                    type="text"
                    value={modalForm.userId}
                    onChange={(e) => setModalForm({ ...modalForm, userId: e.target.value })}
                    placeholder="Mã NV"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Khoa / Phòng</label>
                  <select
                    value={modalForm.department}
                    onChange={(e) => setModalForm({ ...modalForm, department: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none bg-white"
                  >
                    <option value="">Chọn khoa phòng</option>
                    {departments.map(d => (
                      <option key={d.id || d.name} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Vị trí trực</label>
                  <select
                    value={modalForm.dutyRole}
                    onChange={(e) => setModalForm({ ...modalForm, dutyRole: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none bg-white"
                  >
                    {DUTY_ROLES.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ca trực</label>
                  <select
                    value={modalForm.shiftName}
                    onChange={(e) => {
                      const sName = e.target.value;
                      const matched = SHIFT_TYPES.find(st => st.name === sName);
                      setModalForm({
                        ...modalForm,
                        shiftName: sName,
                        startTime: matched?.startTime || modalForm.startTime,
                        endTime: matched?.endTime || modalForm.endTime
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none bg-white"
                  >
                    {SHIFT_TYPES.map(st => (
                      <option key={st.name} value={st.name}>{st.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ngày trực *</label>
                <input
                  type="date"
                  value={modalForm.dateStr}
                  onChange={(e) => setModalForm({ ...modalForm, dateStr: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Giờ bắt đầu</label>
                  <input
                    type="time"
                    value={modalForm.startTime}
                    onChange={(e) => setModalForm({ ...modalForm, startTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Giờ kết thúc</label>
                  <input
                    type="time"
                    value={modalForm.endTime}
                    onChange={(e) => setModalForm({ ...modalForm, endTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ghi chú</label>
                <input
                  type="text"
                  value={modalForm.note}
                  onChange={(e) => setModalForm({ ...modalForm, note: e.target.value })}
                  placeholder="Địa điểm trực, nhiệm vụ..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setShowShiftModal(false)}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-100 transition-colors"
              >
                HỦY
              </button>
              <button
                onClick={handleSaveShift}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition-colors"
              >
                LƯU CA TRỰC
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
