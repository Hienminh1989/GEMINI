import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, Upload, Download, Plus, Trash2, Edit3, Search, Filter, 
  ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Clock, 
  User, Building, RefreshCw, FileSpreadsheet, Eye, X, Check, ArrowRight,
  Printer, Save, Info, Sparkles
} from 'lucide-react';
import { format, addWeeks, subWeeks, parseISO } from 'date-fns';
import { HospitalDutySchedule, HospitalDutyDayRow, HospitalHolyRow, UserData, Department } from '../types';
import { 
  getWeekDates, 
  getDefaultHospitalSchedule,
  generateHospitalDutyScheduleTemplate, 
  parseHospitalDutyScheduleExcel, 
  exportHospitalDutyScheduleToExcel 
} from '../lib/dutyExcel';
import { apiFetch } from '../lib/api';

interface HospitalDutyScheduleViewProps {
  users?: UserData[];
  departments?: Department[];
  canEdit?: boolean;
  canDelete?: boolean;
  readOnly?: boolean;
  highlightUserName?: string;
}

export function HospitalDutyScheduleView({
  users = [],
  departments = [],
  canEdit = true,
  canDelete = true,
  readOnly = false,
  highlightUserName
}: HospitalDutyScheduleViewProps) {
  const [currentBaseDate, setCurrentBaseDate] = useState<Date>(new Date());
  const [schedule, setSchedule] = useState<HospitalDutySchedule | null>(null);
  const [savedWeeks, setSavedWeeks] = useState<{ id: number; weekNumber: number; year: number; startDate: string; endDate: string; title: string }[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  
  // Upload state
  const [showUploadPreview, setShowUploadPreview] = useState<boolean>(false);
  const [pendingSchedule, setPendingSchedule] = useState<HospitalDutySchedule | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notification / Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const weekInfo = getWeekDates(currentBaseDate);

  // Fetch list of saved schedules
  const fetchSavedWeeksList = async () => {
    try {
      const res = await apiFetch('/api/hospital_duty_schedules');
      if (res.ok && res.data) {
        setSavedWeeks(res.data);
      }
    } catch (err) {
      console.error('Error fetching saved weeks list:', err);
    }
  };

  // Fetch current week schedule from server
  const fetchCurrentWeekSchedule = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<HospitalDutySchedule[]>(`/api/hospital_duty_schedules?weekNumber=${weekInfo.weekNumber}&year=${weekInfo.year}`);
      if (res.ok && Array.isArray(res.data)) {
        const data = res.data;
        if (data && data.length > 0) {
          setSchedule(data[0]);
        } else {
          // If not yet saved in DB, generate default week scaffold
          const defaultScaffold = getDefaultHospitalSchedule(currentBaseDate);
          setSchedule(defaultScaffold);
        }
      } else {
        setSchedule(getDefaultHospitalSchedule(currentBaseDate));
      }
    } catch (err) {
      console.error('Error fetching week schedule:', err);
      setSchedule(getDefaultHospitalSchedule(currentBaseDate));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSavedWeeksList();
  }, []);

  useEffect(() => {
    fetchCurrentWeekSchedule();
  }, [weekInfo.weekNumber, weekInfo.year]);

  // Handle Excel Upload - Automatically reads, fills columns and saves to DB
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSaving(true);
    try {
      const { schedule: parsedSched, errors } = await parseHospitalDutyScheduleExcel(file, currentBaseDate);
      if (errors.length > 0) {
        showToast(errors[0], 'error');
        setIsSaving(false);
        return;
      }

      // Automatically save to database
      const res = await apiFetch('/api/hospital_duty_schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedSched)
      });

      if (res.ok) {
        setSchedule(parsedSched);
        setIsEditing(false);
        setShowUploadPreview(false);
        showToast(`Đã tải lên, điền các cột và lưu Lịch trực Tuần ${parsedSched.weekNumber}/${parsedSched.year} vào CSDL! Đã truyền lên màn hình điểm danh.`);
        fetchSavedWeeksList();
      } else {
        setSchedule(parsedSched);
        showToast(`Đã đọc dữ liệu bảng nhưng lưu CSDL gặp lỗi: ${res.error || 'Lỗi hệ thống'}`, 'error');
      }
    } catch (err: any) {
      showToast('Lỗi khi đọc file Excel: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Save Schedule to PostgreSQL Database
  const handleSaveScheduleToDB = async (schedToSave: HospitalDutySchedule = schedule!) => {
    if (!schedToSave) return;
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/hospital_duty_schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedToSave)
      });

      if (res.ok) {
        showToast(`Đã lưu thành công Lịch trực Tuần ${schedToSave.weekNumber}/${schedToSave.year} vào cơ sở dữ liệu!`);
        setIsEditing(false);
        setShowUploadPreview(false);
        setSchedule(schedToSave);
        fetchSavedWeeksList();
      } else {
        showToast(`Lưu thất bại: ${res.error || 'Lỗi hệ thống'}`, 'error');
      }
    } catch (err: any) {
      showToast(`Lỗi: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete saved week schedule
  const handleDeleteSchedule = async () => {
    if (!schedule?.id) {
      showToast('Lịch trực tuần này chưa được lưu trong cơ sở dữ liệu.', 'error');
      return;
    }
    if (!confirm(`Bạn có chắc chắn muốn xóa Lịch trực Tuần ${schedule.weekNumber}/${schedule.year}?`)) return;

    try {
      const res = await apiFetch(`/api/hospital_duty_schedules/${schedule.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Đã xóa lịch trực tuần khỏi cơ sở dữ liệu');
        fetchCurrentWeekSchedule();
        fetchSavedWeeksList();
      }
    } catch (err) {
      showToast('Lỗi khi xóa lịch', 'error');
    }
  };

  // Update a single cell in the schedule data
  const handleCellChange = (dayIdx: number, field: keyof HospitalDutyDayRow, value: string) => {
    if (!schedule) return;
    const updatedRows = [...schedule.scheduleData];
    updatedRows[dayIdx] = {
      ...updatedRows[dayIdx],
      [field]: value
    };
    setSchedule({
      ...schedule,
      scheduleData: updatedRows
    });
  };

  // Update a single cell in the holy data
  const handleHolyChange = (rowIdx: number, field: keyof HospitalHolyRow, value: string) => {
    if (!schedule || !schedule.holyData) return;
    const updatedHoly = [...schedule.holyData];
    updatedHoly[rowIdx] = {
      ...updatedHoly[rowIdx],
      [field]: value
    };
    setSchedule({
      ...schedule,
      holyData: updatedHoly
    });
  };

  // Helper: check if a text contains highlighted user name
  const isHighlighted = (text: string) => {
    if (!highlightUserName || !text) return false;
    return text.toLowerCase().includes(highlightUserName.trim().toLowerCase());
  };

  const renderCellContent = (text: string, isYellow = false) => {
    const lines = (text || '').split('\n').filter(l => l.trim() !== '');
    const highlighted = isHighlighted(text);

    return (
      <div className={`p-1.5 min-h-[38px] flex flex-col justify-center text-center text-[11px] leading-tight ${
        isYellow ? 'bg-amber-200/90 font-bold text-amber-950 rounded-xs' : ''
      } ${highlighted ? 'bg-blue-600 text-white font-black rounded-md shadow-xs ring-2 ring-blue-400' : ''}`}>
        {lines.length === 0 ? (
          <span className="text-slate-300 font-mono text-[10px]">-</span>
        ) : (
          lines.map((line, i) => (
            <span key={i} className={`${i > 0 ? 'text-[10px] opacity-90' : 'font-semibold'}`}>
              {line}
            </span>
          ))
        )}
      </div>
    );
  };

  const isSavedInDB = schedule?.id !== undefined;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-100 text-slate-800 relative">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[150] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-3 ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Top Action & Navigation Bar */}
      <div className="bg-white border-b border-slate-200 p-3 sm:p-4 shrink-0 shadow-xs flex flex-wrap items-center justify-between gap-3 print:hidden">
        {/* Left: Week Navigation */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setCurrentBaseDate(subWeeks(currentBaseDate, 1))}
              className="p-1.5 hover:bg-white text-slate-700 rounded-lg transition-colors"
              title="Tuần trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => setCurrentBaseDate(new Date())}
              className="px-2.5 py-1 text-xs font-bold bg-white text-blue-700 rounded-md shadow-xs hover:bg-blue-50 transition-colors"
            >
              Tuần này
            </button>

            <div className="px-2 font-black text-xs text-slate-800 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Tuần {weekInfo.weekNumber}/{weekInfo.year}</span>
              <span className="text-slate-400 font-normal">({format(weekInfo.start, 'dd/MM')} - {format(weekInfo.end, 'dd/MM')})</span>
            </div>

            <button
              onClick={() => setCurrentBaseDate(addWeeks(currentBaseDate, 1))}
              className="p-1.5 hover:bg-white text-slate-700 rounded-lg transition-colors"
              title="Tuần sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Status Badge */}
          {isSavedInDB ? (
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Đã lưu CSDL
            </span>
          ) : (
            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1">
              <Info className="w-3.5 h-3.5" /> Chưa lưu CSDL
            </span>
          )}
        </div>

        {/* Right: Actions (Excel, Save, Edit, Print) */}
        {!readOnly && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => generateHospitalDutyScheduleTemplate(currentBaseDate)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1.5 border border-slate-300 transition-colors"
              title="Tải file mẫu Excel chuẩn bệnh viện"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Tải file mẫu Excel</span>
            </button>

            {canEdit && (
              <>
                <label className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors active:scale-95">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Tải lên file trực tuần</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>

                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={`px-3 py-1.5 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
                    isEditing ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-slate-800 hover:bg-slate-900 text-white'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'Đang sửa ô' : 'Sửa trực tiếp'}</span>
                </button>

                <button
                  onClick={() => handleSaveScheduleToDB()}
                  disabled={isSaving}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
                  title="Lưu lịch trực tuần này vào cơ sở dữ liệu"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Đang lưu...' : 'Lưu vào CSDL'}</span>
                </button>
              </>
            )}

            <button
              onClick={() => schedule && exportHospitalDutyScheduleToExcel(schedule)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1.5 border border-slate-300 transition-colors"
              title="Xuất bảng ra Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Xuất Excel</span>
            </button>

            <button
              onClick={() => window.print()}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 transition-colors"
              title="In lịch trực"
            >
              <Printer className="w-4 h-4" />
            </button>

            {canDelete && isSavedInDB && (
              <button
                onClick={handleDeleteSchedule}
                className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200 transition-colors"
                title="Xóa lịch tuần này khỏi CSDL"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Hospital Schedule Paper Document View */}
      <div className="flex-1 overflow-auto p-2 sm:p-4 md:p-6 flex justify-center">
        {loading || !schedule ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-xs font-bold">Đang tải Lịch trực bệnh viện...</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg border border-slate-300 p-4 sm:p-6 md:p-8 max-w-[1400px] w-full flex flex-col font-serif text-slate-900 overflow-x-auto">
            {/* 1. Header Section */}
            <div className="flex justify-between items-start border-b pb-4 mb-4 text-xs font-sans">
              <div className="text-center">
                <p className="font-bold text-xs uppercase text-slate-800">SỞ Y TẾ THANH HÓA</p>
                <p className="font-black text-sm uppercase text-slate-900">BỆNH VIỆN ĐA KHOA THIỆU HÓA</p>
                <p className="text-[11px] text-slate-600 mt-1">Số: {schedule.documentNo || '/LTr-BVĐKTH'}</p>
              </div>

              <div className="text-center">
                <p className="font-black text-xs uppercase text-slate-900">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                <p className="font-bold text-xs underline underline-offset-4 text-slate-800">Độc lập - Tự do - Hạnh phúc</p>
                <p className="text-[11px] italic text-slate-600 mt-1">
                  Thiệu Trung, ngày {format(new Date(), 'dd')} tháng {format(new Date(), 'MM')} năm {format(new Date(), 'yyyy')}
                </p>
              </div>
            </div>

            {/* 2. Main Title */}
            <div className="text-center mb-4">
              <h1 className="text-base sm:text-lg font-black uppercase text-slate-900 tracking-wider">
                {schedule.title || `LỊCH TRỰC TUẦN ${schedule.weekNumber} TỪ NGÀY ${format(weekInfo.start, 'dd')} ĐẾN ${format(weekInfo.end, 'dd/MM/yyyy')}`}
              </h1>
              <p className="text-xs italic text-slate-700 mt-1 font-semibold">
                Thường trực lãnh đạo: <span className="font-bold text-slate-900">{schedule.leaderOnDuty || 'BS CKI Lê Xuân Dũng'}</span>
              </p>
            </div>

            {/* 3. Main Schedule Matrix Table */}
            <div className="overflow-x-auto border-2 border-slate-800 mb-6 font-sans">
              <table className="w-full text-center border-collapse text-[10px] sm:text-[11px]">
                {/* Table Headers */}
                <thead>
                  {/* Category Header Row */}
                  <tr className="bg-slate-200 border-b border-slate-800 font-bold uppercase text-slate-900">
                    <th rowSpan={2} className="border-r border-slate-800 p-1 w-14 bg-slate-100">NGÀY</th>
                    <th rowSpan={2} className="border-r border-slate-800 p-1 w-16 bg-slate-100">LÃNH ĐẠO</th>
                    <th colSpan={13} className="border-r border-slate-800 p-1 bg-blue-100/70 text-blue-950 font-black">
                      TRỰC NỘI VIỆN
                    </th>
                    <th colSpan={2} className="border-r border-slate-800 p-1 bg-amber-100/70 text-amber-950 font-black">
                      TRỰC NGOẠI VIỆN
                    </th>
                    <th rowSpan={2} className="border-r border-slate-800 p-1 min-w-[80px] bg-slate-100 leading-tight">
                      PHÂN LUỒNG, HD-BN TẠI PK
                    </th>
                    <th colSpan={6} className="p-1 bg-emerald-100/70 text-emerald-950 font-black">
                      ĐI LÀM PHÒNG KHÁM
                    </th>
                  </tr>

                  {/* Sub Header Row */}
                  <tr className="bg-slate-100 border-b-2 border-slate-800 font-bold text-slate-800">
                    <th className="border-r border-slate-800 p-1 min-w-[70px]">BÁC SỸ</th>
                    <th className="border-r border-slate-800 p-1 min-w-[70px] bg-yellow-200 text-yellow-950 font-black">
                      BS Trực nhà 9 tầng
                    </th>
                    <th className="border-r border-slate-800 p-1 min-w-[80px] leading-tight">
                      ĐIỀU DƯỠNG TRỰC CHUNG CẤP CỨU
                    </th>
                    <th className="border-r border-slate-800 p-1 min-w-[65px]">NHI + LCK</th>
                    <th className="border-r border-slate-800 p-1 min-w-[65px]">NỘI - LÃO</th>
                    <th className="border-r border-slate-800 p-1 min-w-[60px]">TRUYỀN NHIỄM</th>
                    <th className="border-r border-slate-800 p-1 min-w-[60px]">NGOẠI</th>
                    <th className="border-r border-slate-800 p-1 min-w-[60px]">ĐÔNG Y</th>
                    <th className="border-r border-slate-800 p-1 min-w-[60px]">HỘ SINH</th>
                    <th className="border-r border-slate-800 p-1 min-w-[60px]">S.ÂM X. QUANG</th>
                    <th className="border-r border-slate-800 p-1 min-w-[60px]">ĐÁNH MÁY SA</th>
                    <th className="border-r border-slate-800 p-1 min-w-[55px]">XÉT NGHIỆM</th>
                    <th className="border-r border-slate-800 p-1 min-w-[50px]">LÁI XE</th>
                    <th className="border-r border-slate-800 p-1 min-w-[65px]">P. THUẬT (Kèm PT)</th>
                    <th className="border-r border-slate-800 p-1 min-w-[50px]">G. MÊ</th>
                    <th className="border-r border-slate-800 p-1 min-w-[55px]">CẢ NGÀY</th>
                    <th className="border-r border-slate-800 p-1 min-w-[55px]">CẢ NGÀY</th>
                    <th className="border-r border-slate-800 p-1 min-w-[55px]">CẢ NGÀY</th>
                    <th className="border-r border-slate-800 p-1 min-w-[55px]">CẢ NGÀY</th>
                    <th className="border-r border-slate-800 p-1 min-w-[65px] leading-tight">T7 1/2, CN cả ngày</th>
                    <th className="p-1 min-w-[55px]">PK Sản</th>
                  </tr>
                </thead>

                {/* Table Data (7 Days: T2 -> CN) */}
                <tbody className="divide-y divide-slate-400">
                  {schedule.scheduleData.map((row, dayIdx) => (
                    <tr key={dayIdx} className="hover:bg-blue-50/40 transition-colors">
                      {/* Ngày */}
                      <td className="border-r border-slate-800 p-1 font-bold bg-slate-50 text-slate-900">
                        <div>{row.dayLabel}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{row.dateStr}</div>
                      </td>

                      {/* Lãnh đạo */}
                      <td className="border-r border-slate-800 p-1 font-bold text-slate-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={row.leader}
                            onChange={(e) => handleCellChange(dayIdx, 'leader', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.leader)
                        )}
                      </td>

                      {/* Bác sỹ */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.doctor1}
                            onChange={(e) => handleCellChange(dayIdx, 'doctor1', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.doctor1)
                        )}
                      </td>

                      {/* BS Trực nhà 9 tầng (Bôi Vàng) */}
                      <td className="border-r border-slate-800 p-0.5 bg-yellow-100/50">
                        {isEditing ? (
                          <input
                            type="text"
                            value={row.doctor9Floor}
                            onChange={(e) => handleCellChange(dayIdx, 'doctor9Floor', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px] bg-yellow-100 font-bold"
                          />
                        ) : (
                          renderCellContent(row.doctor9Floor, true)
                        )}
                      </td>

                      {/* Điều dưỡng CC */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.nurse1}
                            onChange={(e) => handleCellChange(dayIdx, 'nurse1', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.nurse1)
                        )}
                      </td>

                      {/* Nhi + LCK */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.nhi_lck1}
                            onChange={(e) => handleCellChange(dayIdx, 'nhi_lck1', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.nhi_lck1)
                        )}
                      </td>

                      {/* Nội - Lão */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.noi_lao1}
                            onChange={(e) => handleCellChange(dayIdx, 'noi_lao1', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.noi_lao1)
                        )}
                      </td>

                      {/* Truyền nhiễm */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.truyen_nhiem}
                            onChange={(e) => handleCellChange(dayIdx, 'truyen_nhiem', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.truyen_nhiem)
                        )}
                      </td>

                      {/* Ngoại */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.ngoai1}
                            onChange={(e) => handleCellChange(dayIdx, 'ngoai1', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.ngoai1)
                        )}
                      </td>

                      {/* Đông y */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.dong_y1}
                            onChange={(e) => handleCellChange(dayIdx, 'dong_y1', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.dong_y1)
                        )}
                      </td>

                      {/* Hộ sinh */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.ho_sinh1}
                            onChange={(e) => handleCellChange(dayIdx, 'ho_sinh1', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.ho_sinh1)
                        )}
                      </td>

                      {/* Siêu âm X.Quang */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.sa_xquang1}
                            onChange={(e) => handleCellChange(dayIdx, 'sa_xquang1', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.sa_xquang1)
                        )}
                      </td>

                      {/* Đánh máy SA */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.danh_may1}
                            onChange={(e) => handleCellChange(dayIdx, 'danh_may1', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.danh_may1)
                        )}
                      </td>

                      {/* Xét nghiệm */}
                      <td className="border-r border-slate-800 p-0.5 font-medium">
                        {isEditing ? (
                          <input
                            type="text"
                            value={row.xet_nghiem}
                            onChange={(e) => handleCellChange(dayIdx, 'xet_nghiem', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.xet_nghiem)
                        )}
                      </td>

                      {/* Lái xe */}
                      <td className="border-r border-slate-800 p-0.5 font-medium">
                        {isEditing ? (
                          <input
                            type="text"
                            value={row.lai_xe}
                            onChange={(e) => handleCellChange(dayIdx, 'lai_xe', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.lai_xe)
                        )}
                      </td>

                      {/* Phẫu thuật */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.phau_thuat}
                            onChange={(e) => handleCellChange(dayIdx, 'phau_thuat', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.phau_thuat)
                        )}
                      </td>

                      {/* Gây mê */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <input
                            type="text"
                            value={row.gay_me}
                            onChange={(e) => handleCellChange(dayIdx, 'gay_me', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.gay_me)
                        )}
                      </td>

                      {/* Phân luồng PK */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.phan_luong1}
                            onChange={(e) => handleCellChange(dayIdx, 'phan_luong1', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.phan_luong1)
                        )}
                      </td>

                      {/* Cả ngày 1 */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.pk_ca_ngay1}
                            onChange={(e) => handleCellChange(dayIdx, 'pk_ca_ngay1', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.pk_ca_ngay1)
                        )}
                      </td>

                      {/* Cả ngày 2 */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.pk_ca_ngay2}
                            onChange={(e) => handleCellChange(dayIdx, 'pk_ca_ngay2', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.pk_ca_ngay2)
                        )}
                      </td>

                      {/* Cả ngày 3 */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.pk_ca_ngay3}
                            onChange={(e) => handleCellChange(dayIdx, 'pk_ca_ngay3', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.pk_ca_ngay3)
                        )}
                      </td>

                      {/* Cả ngày 4 */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.pk_ca_ngay4}
                            onChange={(e) => handleCellChange(dayIdx, 'pk_ca_ngay4', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.pk_ca_ngay4)
                        )}
                      </td>

                      {/* T7 1/2 CN */}
                      <td className="border-r border-slate-800 p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.pk_t7_cn}
                            onChange={(e) => handleCellChange(dayIdx, 'pk_t7_cn', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.pk_t7_cn)
                        )}
                      </td>

                      {/* PK Sản */}
                      <td className="p-0.5">
                        {isEditing ? (
                          <textarea
                            rows={2}
                            value={row.pk_san}
                            onChange={(e) => handleCellChange(dayIdx, 'pk_san', e.target.value)}
                            className="w-full text-center p-0.5 border rounded text-[10px]"
                          />
                        ) : (
                          renderCellContent(row.pk_san)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 4. Bottom Section: Secondary Table (Đi làm hộ lý) + Notes + Signature */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start font-sans text-xs">
              {/* Left Column: Notes & Regulations */}
              <div className="lg:col-span-7 space-y-1.5 text-slate-800 text-[11px] leading-relaxed">
                <p className="font-bold text-slate-950">Ghi chú:</p>
                <ul className="list-disc pl-4 space-y-1 text-slate-700">
                  {schedule.notes?.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>

              {/* Middle/Right: Hộ lý table & Giám đốc signature */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                {/* Bảng đi làm hộ lý các khoa */}
                <div>
                  <p className="font-bold text-xs uppercase text-slate-900 mb-1 text-center">
                    ĐI LÀM HỘ LÝ CÁC KHOA
                  </p>
                  <table className="w-full border border-slate-800 text-center text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-800 font-bold">
                        <th className="border-r border-slate-800 p-1">Thứ</th>
                        <th className="border-r border-slate-800 p-1">Tầng 1-2</th>
                        <th className="border-r border-slate-800 p-1">Tầng 3-4</th>
                        <th className="border-r border-slate-800 p-1">Tầng 5-6</th>
                        <th className="border-r border-slate-800 p-1">Tầng 7-8</th>
                        <th className="p-1">PK-HSCC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-300">
                      {schedule.holyData?.map((hRow, hIdx) => (
                        <tr key={hIdx}>
                          <td className="border-r border-slate-800 p-1 font-bold bg-slate-50">{hRow.dayLabel}</td>
                          <td className="border-r border-slate-800 p-1">{hRow.tang1_2}</td>
                          <td className="border-r border-slate-800 p-1">{hRow.tang3_4}</td>
                          <td className="border-r border-slate-800 p-1">{hRow.tang5_6}</td>
                          <td className="border-r border-slate-800 p-1">{hRow.tang7_8}</td>
                          <td className="p-1">{hRow.pk_hscc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Signature Box */}
                <div className="text-center pt-2 font-serif">
                  <p className="font-bold text-xs uppercase text-slate-900">GIÁM ĐỐC</p>
                  <div className="h-14"></div>
                  <p className="font-bold text-sm text-slate-900">Nguyễn Lê Lâm</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* POPUP MODAL: Upload Preview & Confirmation */}
      {showUploadPreview && pendingSchedule && (
        <div className="fixed inset-0 bg-slate-900/60 z-[150] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-800">Xác nhận tải lên Lịch trực tuần từ Excel</h3>
              </div>
              <button onClick={() => setShowUploadPreview(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs space-y-1 text-blue-900">
              <p className="font-bold text-sm">Tuần phát hiện: Tuần {pendingSchedule.weekNumber}/{pendingSchedule.year}</p>
              <p className="text-blue-700">Thời gian: {pendingSchedule.startDate} đến {pendingSchedule.endDate}</p>
              <p className="text-blue-700">Thường trực lãnh đạo: {pendingSchedule.leaderOnDuty}</p>
              <p className="text-blue-700">Số ngày có dữ liệu trực: {pendingSchedule.scheduleData.length} ngày (Thứ 2 đến Chủ nhật)</p>
            </div>

            <p className="text-xs text-slate-500">
              Dữ liệu sau khi lưu sẽ được lưu vào cơ sở dữ liệu để xem lại lịch sử bất kỳ lúc nào, đồng thời tự động truyền lên màn hình điểm danh của từng nhân viên.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowUploadPreview(false)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                HỦY
              </button>
              <button
                onClick={() => handleSaveScheduleToDB(pendingSchedule)}
                disabled={isSaving}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>LƯU VÀO CƠ SỞ DỮ LIỆU</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
