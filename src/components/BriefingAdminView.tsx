import React, { useState, useEffect, useMemo } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { QRCodeCanvas } from 'qrcode.react';
import { format, subDays, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import {
  QrCode,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  Download,
  RefreshCw,
  Plus,
  Trash2,
  UserCheck,
  Users,
  Calendar,
  Building,
  CheckSquare,
  Printer,
  Scissors,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  FileText,
} from 'lucide-react';
import {
  BriefingRosterItem,
  BriefingAttendanceRecord,
  DEFAULT_BRIEFING_ROSTER,
  BRIEFING_DEPARTMENTS_ORDER,
  BRIEFING_POSTER_IMAGE_URL,
  buildOfficialBriefingQrUrl,
  normalizeVietnameseText,
} from '../lib/briefingRoster';
import { apiFetch } from '../lib/api';
import { BriefingQrStickerModal } from './BriefingQrStickerModal';
import { downloadBriefingWordGuide } from '../lib/briefingWordGuide';

interface BriefingDeviceLockInfo {
  rosterId: number;
  deviceId: string;
  staffName: string;
  lockedAt: number;
  unlockedAt: number;
  isLocked: boolean;
}

interface BriefingAdminViewProps {
  canEdit?: boolean;
  canDelete?: boolean;
}

export const BriefingAdminView: React.FC<BriefingAdminViewProps> = ({
  canEdit = true,
  canDelete = true,
}) => {
  const [dateStr, setDateStr] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [roster, setRoster] = useState<BriefingRosterItem[]>(DEFAULT_BRIEFING_ROSTER);
  const [attendanceMap, setAttendanceMap] = useState<Record<number, BriefingAttendanceRecord>>({});
  const [deviceLocks, setDeviceLocks] = useState<Record<number, BriefingDeviceLockInfo>>({});
  const [expectedQrPayload, setExpectedQrPayload] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [unlockingId, setUnlockingId] = useState<number | null>(null);
  const [unlockingAll, setUnlockingAll] = useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PRESENT' | 'ABSENT' | 'LOCKED'>('ALL');

  // Modals & Banner visibility
  const [showQrBanner, setShowQrBanner] = useState<boolean>(false);
  const [showQrPosterModal, setShowQrPosterModal] = useState<boolean>(false);
  const [showAddStaffModal, setShowAddStaffModal] = useState<boolean>(false);
  const [newStaffForm, setNewStaffForm] = useState<{
    name: string;
    department: string;
    specialty: string;
    position: string;
  }>({
    name: '',
    department: BRIEFING_DEPARTMENTS_ORDER[0],
    specialty: 'Bác sĩ',
    position: '',
  });
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [downloadingGuide, setDownloadingGuide] = useState<boolean>(false);

  const showToastMsg = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleDownloadWordGuide = async () => {
    try {
      setDownloadingGuide(true);
      await downloadBriefingWordGuide(roster);
      showToastMsg('Đã tải file Word hướng dẫn điểm danh Giao ban!', 'success');
    } catch (err: any) {
      showToastMsg(err?.message || 'Không thể tạo file Word hướng dẫn', 'error');
    } finally {
      setDownloadingGuide(false);
    }
  };

  const fetchBriefingData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch(`/api/briefing/data?date=${encodeURIComponent(dateStr)}&_t=${Date.now()}`);
      if (res.ok && res.data) {
        if (Array.isArray(res.data.roster) && res.data.roster.length > 0) {
          setRoster(res.data.roster);
        }
        if (Array.isArray(res.data.attendance)) {
          const map: Record<number, BriefingAttendanceRecord> = {};
          res.data.attendance.forEach((rec: BriefingAttendanceRecord) => {
            if (rec.rosterId) {
              map[Number(rec.rosterId)] = rec;
            }
          });
          setAttendanceMap(map);
        }
        if (res.data.deviceLocks && typeof res.data.deviceLocks === 'object') {
          setDeviceLocks(res.data.deviceLocks);
        }
        if (res.data.expectedQrPayload) {
          setExpectedQrPayload(res.data.expectedQrPayload);
        }
      }
    } catch (err) {
      console.warn('Error fetching admin briefing data:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchBriefingData();
    const timer = setInterval(() => fetchBriefingData(true), 5000);
    return () => clearInterval(timer);
  }, [dateStr]);

  // Auto-decode QR poster once so expectedQrPayload is stored
  useEffect(() => {
    let cancelled = false;
    const decodeOfficialPoster = async () => {
      try {
        const res = await fetch(BRIEFING_POSTER_IMAGE_URL);
        if (!res.ok) return;
        const blob = await res.blob();
        const file = new File([blob], 'briefing_poster.jpg', { type: blob.type || 'image/jpeg' });
        const tempId = 'admin-briefing-qr-decoder';
        let el = document.getElementById(tempId);
        if (!el) {
          el = document.createElement('div');
          el.id = tempId;
          el.style.display = 'none';
          document.body.appendChild(el);
        }
        const reader = new Html5Qrcode(tempId);
        const decoded = await reader.scanFile(file, false);
        reader.clear();
        if (!cancelled && decoded && decoded.trim()) {
          setExpectedQrPayload(decoded.trim());
          await apiFetch('/api/briefing/qr-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expectedQrPayload: decoded.trim() }),
          });
        }
      } catch (e) {}
    };
    decodeOfficialPoster();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleAttendance = async (person: BriefingRosterItem) => {
    if (!canEdit) return;
    setTogglingId(person.id);
    const isCurrentlyPresent = !!attendanceMap[person.id];
    try {
      const res = await apiFetch('/api/briefing/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rosterId: person.id,
          name: person.name,
          department: person.department,
          dateStr,
          present: !isCurrentlyPresent,
        }),
      });
      if (res.ok && res.data?.success) {
        if (!isCurrentlyPresent && res.data.record) {
          setAttendanceMap(prev => ({
            ...prev,
            [person.id]: res.data.record,
          }));
          showToastMsg(`Đã ghi nhận điểm danh Giao ban cho "${person.name}" (${person.department}).`);
        } else {
          setAttendanceMap(prev => {
            const next = { ...prev };
            delete next[person.id];
            return next;
          });
          showToastMsg(`Đã hủy điểm danh Giao ban ngày ${dateStr} của "${person.name}".`);
        }
      } else {
        showToastMsg(res.data?.error || 'Không thể cập nhật trạng thái điểm danh.', 'error');
      }
    } catch (err: any) {
      showToastMsg(err.message || 'Lỗi kết nối máy chủ.', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleUnlockDevice = async (person: BriefingRosterItem) => {
    if (!canEdit) return;
    setUnlockingId(person.id);
    try {
      const res = await apiFetch('/api/briefing/unlock-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rosterId: person.id,
        }),
      });
      if (res.ok && res.data?.success) {
        const nowTs = Number(res.data.unlockedAt || Date.now());
        setDeviceLocks(prev => ({
          ...prev,
          [person.id]: {
            rosterId: person.id,
            deviceId: '',
            staffName: person.name,
            lockedAt: 0,
            unlockedAt: nowTs,
            isLocked: false,
          },
        }));
        showToastMsg(`Đã mở khóa thiết bị Giao ban cho "${person.name}". Cán bộ có thể chọn lại tên trên điện thoại!`);
      } else {
        showToastMsg(res.data?.error || 'Không thể mở khóa thiết bị.', 'error');
      }
    } catch (err: any) {
      showToastMsg(err.message || 'Lỗi kết nối máy chủ khi mở khóa thiết bị.', 'error');
    } finally {
      setUnlockingId(null);
    }
  };

  const handleUnlockAllDevices = async () => {
    if (!canEdit) return;
    setUnlockingAll(true);
    try {
      const res = await apiFetch('/api/briefing/unlock-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unlockAll: true,
        }),
      });
      if (res.ok && res.data?.success) {
        const nowTs = Number(res.data.unlockedAt || Date.now());
        setDeviceLocks(prev => {
          const next: Record<number, BriefingDeviceLockInfo> = {};
          Object.keys(prev).forEach(k => {
            const id = Number(k);
            next[id] = {
              ...prev[id],
              unlockedAt: nowTs,
              isLocked: false,
            };
          });
          return next;
        });
        showToastMsg('Đã mở khóa tất cả thiết bị trong mục Giao ban để cán bộ có thể chọn lại tên!');
      } else {
        showToastMsg(res.data?.error || 'Không thể mở khóa tất cả thiết bị.', 'error');
      }
    } catch (err: any) {
      showToastMsg(err.message || 'Lỗi kết nối máy chủ.', 'error');
    } finally {
      setUnlockingAll(false);
    }
  };

  const handleAddRosterStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffForm.name.trim() || !newStaffForm.department.trim()) return;
    try {
      const res = await apiFetch('/api/briefing/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStaffForm.name.trim(),
          department: newStaffForm.department.trim(),
          specialty: newStaffForm.specialty.trim(),
          position: newStaffForm.position.trim(),
        }),
      });
      if (res.ok && res.data?.staff) {
        setRoster(prev => [...prev, res.data.staff]);
        setShowAddStaffModal(false);
        setNewStaffForm({
          name: '',
          department: BRIEFING_DEPARTMENTS_ORDER[0],
          specialty: 'Bác sĩ',
          position: '',
        });
        showToastMsg(`Đã thêm "${res.data.staff.name}" vào danh sách điểm danh Giao ban!`);
      } else {
        showToastMsg(res.data?.error || 'Lỗi khi thêm nhân sự.', 'error');
      }
    } catch (err: any) {
      showToastMsg(err.message || 'Lỗi kết nối máy chủ.', 'error');
    }
  };

  const handleDeleteRosterStaff = async (person: BriefingRosterItem) => {
    if (!canDelete) return;
    try {
      const res = await apiFetch(`/api/briefing/roster/${person.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setRoster(prev => prev.filter(r => r.id !== person.id));
        showToastMsg(`Đã xóa "${person.name}" khỏi danh sách Giao ban.`);
      }
    } catch (err: any) {
      showToastMsg('Lỗi khi xóa nhân sự khỏi danh sách Giao ban.', 'error');
    }
  };

  const groupedDepartments = useMemo(() => {
    const normSearch = normalizeVietnameseText(searchQuery);

    const filtered = roster.filter(item => {
      if (deptFilter !== 'ALL' && item.department !== deptFilter) return false;
      const isPresent = !!attendanceMap[item.id];
      const isLocked = !!deviceLocks[item.id]?.isLocked;
      if (statusFilter === 'PRESENT' && !isPresent) return false;
      if (statusFilter === 'ABSENT' && isPresent) return false;
      if (statusFilter === 'LOCKED' && !isLocked) return false;

      if (normSearch) {
        const matchName = normalizeVietnameseText(item.name).includes(normSearch);
        const matchSpec = normalizeVietnameseText(item.specialty).includes(normSearch);
        const matchPos = normalizeVietnameseText(item.position).includes(normSearch);
        const matchDept = normalizeVietnameseText(item.department).includes(normSearch);
        return matchName || matchSpec || matchPos || matchDept;
      }
      return true;
    });

    const groupsMap = new Map<string, BriefingRosterItem[]>();
    filtered.forEach(item => {
      if (!groupsMap.has(item.department)) {
        groupsMap.set(item.department, []);
      }
      groupsMap.get(item.department)!.push(item);
    });

    const result: { department: string; items: BriefingRosterItem[] }[] = [];
    BRIEFING_DEPARTMENTS_ORDER.forEach(deptName => {
      if (groupsMap.has(deptName)) {
        result.push({
          department: deptName,
          items: groupsMap.get(deptName)!.sort((a, b) => a.staffOrder - b.staffOrder),
        });
        groupsMap.delete(deptName);
      }
    });
    groupsMap.forEach((items, department) => {
      result.push({ department, items });
    });

    return result;
  }, [roster, attendanceMap, deviceLocks, deptFilter, statusFilter, searchQuery]);

  const totalRosterCount = roster.length;
  const totalPresentCount = Object.keys(attendanceMap).length;
  const totalAbsentCount = Math.max(0, totalRosterCount - totalPresentCount);
  const totalLockedDevicesCount = Object.values(deviceLocks).filter((d: BriefingDeviceLockInfo) => d.isLocked).length;
  const attendanceRate = totalRosterCount > 0 ? Math.round((totalPresentCount / totalRosterCount) * 100) : 0;

  const handleExportExcel = () => {
    const rows: any[] = [];
    let stt = 1;

    groupedDepartments.forEach(group => {
      // Group header row
      rows.push({
        STT: '',
        'Khoa / Phòng': group.department.toUpperCase(),
        'Họ và tên': `--- ${group.department.toUpperCase()} (${group.items.length} nhân sự) ---`,
        'Chuyên môn': '',
        'Chức vụ': '',
        'Trạng thái': '',
        'Giờ điểm danh': '',
        Ngày: format(parseISO(dateStr), 'dd/MM/yyyy'),
      });

      group.items.forEach(person => {
        const att = attendanceMap[person.id];
        rows.push({
          STT: stt++,
          'Khoa / Phòng': person.department,
          'Họ và tên': person.name,
          'Chuyên môn': person.specialty || '',
          'Chức vụ': person.position || '',
          'Trạng thái': att ? 'Đã điểm danh' : 'Vắng mặt',
          'Giờ điểm danh': att ? att.timeStr : '-',
          Ngày: format(parseISO(dateStr), 'dd/MM/yyyy'),
        });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 28 },
      { wch: 26 },
      { wch: 15 },
      { wch: 18 },
      { wch: 16 },
      { wch: 15 },
      { wch: 14 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `GiaoBan_${dateStr}`);
    XLSX.writeFile(workbook, `Danh_Sach_Diem_Danh_Giao_Ban_${dateStr}.xlsx`);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-xl border flex items-center gap-2.5 text-xs font-bold ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* TOP HEADER & TOOLBAR */}
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col gap-3.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <CheckSquare className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-black text-slate-900 text-sm sm:text-base uppercase tracking-tight">
                  Quản Lý Điểm Danh Giao Ban Bệnh Viện
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Danh sách cố định 17 Khoa/Phòng ({totalRosterCount} cán bộ/nhân viên)
                </p>
              </div>
            </div>

            {/* Date Picker */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <input
                type="date"
                value={dateStr}
                onChange={e => setDateStr(e.target.value)}
                className="text-xs font-bold text-slate-800 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setDateStr(format(new Date(), 'yyyy-MM-dd'))}
                className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-colors ${
                  dateStr === format(new Date(), 'yyyy-MM-dd')
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => setDateStr(format(subDays(new Date(), 1), 'yyyy-MM-dd'))}
                className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-colors ${
                  dateStr === format(subDays(new Date(), 1), 'yyyy-MM-dd')
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Hôm qua
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fetchBriefingData()}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
              <span>Đồng bộ</span>
            </button>

            <button
              type="button"
              onClick={() => setShowQrPosterModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Mã QR Riêng (In Dán Đè Lên Mã Cũ)</span>
            </button>

            {canEdit && (
              <button
                type="button"
                disabled={unlockingAll}
                onClick={handleUnlockAllDevices}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                title="Mở khóa tất cả thiết bị Giao ban để nhân viên có thể chọn lại tên"
              >
                <Unlock className={`w-3.5 h-3.5 ${unlockingAll ? 'animate-pulse' : ''}`} />
                <span>{unlockingAll ? 'Đang mở khóa...' : 'Mở khóa tất cả TB'}</span>
              </button>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={() => setShowAddStaffModal(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm nhân sự</span>
              </button>
            )}

            <button
              type="button"
              disabled={downloadingGuide}
              onClick={handleDownloadWordGuide}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              title="Tải tài liệu Word (.docx) hướng dẫn các bước quét mã QR điểm danh Giao ban có hình minh họa"
            >
              <FileText className={`w-3.5 h-3.5 ${downloadingGuide ? 'animate-pulse' : ''}`} />
              <span>{downloadingGuide ? 'Đang tạo Word...' : 'Tải Hướng Dẫn (.docx)'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel Giao ban</span>
            </button>
          </div>
        </div>

        {/* 4 KPI CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-3 border border-slate-200/90 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase">Tổng quân số Giao ban</p>
              <p className="text-xl font-black text-slate-900 mt-0.5">{totalRosterCount}</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-emerald-50/70 rounded-xl p-3 border border-emerald-200 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-emerald-800 uppercase">Đã điểm danh</p>
              <p className="text-xl font-black text-emerald-700 mt-0.5">{totalPresentCount}</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-amber-50/70 rounded-xl p-3 border border-amber-200 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-amber-800 uppercase">Chưa điểm danh</p>
              <p className="text-xl font-black text-amber-700 mt-0.5">{totalAbsentCount}</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-blue-50/70 rounded-xl p-3 border border-blue-200 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-blue-800 uppercase">Tỷ lệ tham gia</p>
              <p className="text-xl font-black text-blue-700 mt-0.5">{attendanceRate}%</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* FILTER BAR */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Tìm theo Họ và tên, Chuyên môn, Chức vụ..."
              className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="ALL">Tất cả 17 Khoa / Phòng</option>
            {BRIEFING_DEPARTMENTS_ORDER.map(dept => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                statusFilter === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả ({totalRosterCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PRESENT')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                statusFilter === 'PRESENT' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Đã điểm danh ({totalPresentCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ABSENT')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                statusFilter === 'ABSENT' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vắng mặt ({totalAbsentCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('LOCKED')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${
                statusFilter === 'LOCKED' ? 'bg-rose-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Lock className="w-3 h-3" />
              <span>Đã khóa TB ({totalLockedDevicesCount})</span>
            </button>
          </div>
        </div>
      </div>

      {/* MAIN TABLE: EXACT 17-DEPARTMENT HOSPITAL ROSTER TABLE */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {/* COLLAPSIBLE STANDALONE QR STICKER BANNER FOR PASTING OVER OLD POSTER */}
        <div className="max-w-5xl mx-auto">
          {!showQrBanner ? (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowQrBanner(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                title="Bấm để hiện hộp thông tin & Mã QR riêng dán đè lên bảng hội nghị cũ"
              >
                <QrCode className="w-3.5 h-3.5 text-blue-600" />
                <span>Hiện Mã QR riêng dán đè bảng hội nghị cũ</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-blue-50 via-indigo-50/70 to-emerald-50/70 border-2 border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs relative">
              <div className="flex items-center gap-4">
                <div
                  onClick={() => setShowQrPosterModal(true)}
                  className="bg-white p-2 rounded-xl border-2 border-dashed border-blue-400 shadow-sm shrink-0 cursor-pointer hover:scale-105 transition-transform relative"
                  title="Bấm để phóng to / Tải ảnh PNG / In mã QR dán đè"
                >
                  <QRCodeCanvas
                    value={buildOfficialBriefingQrUrl()}
                    size={84}
                    level="H"
                    marginSize={1}
                    bgColor="#FFFFFF"
                    fgColor="#0F172A"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-black uppercase">
                      <Scissors className="w-3 h-3" />
                      <span>Mã QR Riêng Để Dán Đè Lên Bảng Hội Nghị Cũ</span>
                    </div>
                  </div>
                  <h3 className="text-sm font-black text-slate-900">
                    Mã QR Điểm Danh Giao Ban (Tích hợp trực tiếp với danh sách 99 cán bộ)
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                    In hoặc tải ảnh mã QR vuông này để <b>dán đè lên ô mã QR cũ</b> trên bảng hội nghị. Khi cán bộ quét bằng <b>Camera điện thoại, Zalo</b> hoặc <b>mục Giao ban trong ứng dụng</b>, hệ thống sẽ tự động ghi nhận có mặt vào bảng dưới đây.
                  </p>
                </div>
              </div>

              <div className="flex sm:flex-col items-stretch sm:items-end gap-2 shrink-0 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setShowQrBanner(false)}
                  className="px-3 py-1.5 rounded-lg bg-white/90 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  title="Ẩn khung hướng dẫn Mã QR này đi"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Ẩn khung QR</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowQrPosterModal(true)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-4 h-4" />
                  <span>Tải Ảnh & In Tem QR Dán Đè</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="max-w-5xl mx-auto border-2 border-slate-300 rounded-xl overflow-hidden shadow-xs bg-white">
          <table className="w-full border-collapse text-left">
            <thead className="bg-slate-100 border-b-2 border-slate-300 sticky top-0 z-10">
              <tr className="text-xs font-black text-slate-800 uppercase">
                <th className="py-3 px-3 border-r border-slate-300 w-14 text-center">STT</th>
                <th className="py-3 px-4 border-r border-slate-300">Họ và tên</th>
                <th className="py-3 px-3 border-r border-slate-300 w-36 text-center">Chuyên môn</th>
                <th className="py-3 px-3 border-r border-slate-300 w-44 text-center">Chức vụ</th>
                <th className="py-3 px-3 border-r border-slate-300 w-40 text-center">Trạng thái</th>
                <th className="py-3 px-3 border-r border-slate-300 w-28 text-center">Giờ quét</th>
                {canEdit && <th className="py-3 px-3 w-52 text-center">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 text-xs sm:text-sm">
              {groupedDepartments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500 font-medium">
                    Không có nhân sự nào khớp với điều kiện lọc hiện tại.
                  </td>
                </tr>
              ) : (
                (() => {
                  let globalIndex = 1;
                  return groupedDepartments.map(group => {
                    const presentInDept = group.items.filter(i => !!attendanceMap[i.id]).length;
                    return (
                      <React.Fragment key={group.department}>
                        {/* Yellow Department Header Row matching official sheet */}
                        <tr className="bg-[#FFF59D] border-y-2 border-slate-400">
                          <td
                            colSpan={canEdit ? 7 : 6}
                            className="py-2 px-4 font-black text-slate-900 text-center uppercase tracking-wide text-xs sm:text-sm"
                          >
                            <div className="flex items-center justify-between">
                              <span className="w-24"></span>
                              <span className="text-slate-950 font-black">{group.department}</span>
                              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/90 text-slate-800 border border-amber-400">
                                {presentInDept}/{group.items.length} có mặt
                              </span>
                            </div>
                          </td>
                        </tr>

                        {group.items.map(person => {
                          const att = attendanceMap[person.id];
                          const lockInfo = deviceLocks[person.id];
                          const isLockedDevice = !!lockInfo?.isLocked;
                          const currentStt = globalIndex++;
                          return (
                            <tr
                              key={person.id}
                              className={`transition-colors ${
                                att ? 'bg-emerald-50/40 hover:bg-emerald-50/80' : 'bg-white hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-2.5 px-3 border-r border-slate-300 text-center font-mono font-bold text-slate-500 text-xs">
                                {currentStt}
                              </td>
                              <td className="py-2.5 px-4 border-r border-slate-300 font-bold text-slate-900">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span>{person.name}</span>
                                  {isLockedDevice && (
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-extrabold uppercase"
                                      title="Thiết bị đã khóa tên cố định cho cán bộ này"
                                    >
                                      <Lock className="w-2.5 h-2.5" />
                                      <span>Đã khóa TB</span>
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 border-r border-slate-300 text-center font-semibold text-slate-800">
                                {person.specialty || ''}
                              </td>
                              <td className="py-2.5 px-3 border-r border-slate-300 text-center font-bold text-slate-900">
                                {person.position || ''}
                              </td>
                              <td className="py-2.5 px-3 border-r border-slate-300 text-center">
                                {att ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs">
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Đã điểm danh</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-semibold text-xs">
                                    <span>Chưa điểm danh</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 border-r border-slate-300 text-center font-mono font-bold text-slate-800 text-xs">
                                {att ? att.timeStr : '-'}
                              </td>
                              {canEdit && (
                                <td className="py-2 px-2.5 text-center">
                                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                    <button
                                      type="button"
                                      disabled={togglingId === person.id}
                                      onClick={() => handleToggleAttendance(person)}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                        att
                                          ? 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-2xs'
                                      }`}
                                    >
                                      {togglingId === person.id
                                        ? '...'
                                        : att
                                        ? 'Hủy'
                                        : 'Điểm danh'}
                                    </button>

                                    <button
                                      type="button"
                                      disabled={unlockingId === person.id}
                                      onClick={() => handleUnlockDevice(person)}
                                      className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                                        isLockedDevice
                                          ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-2xs'
                                          : 'bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200'
                                      }`}
                                      title="Mở khóa thiết bị trong Giao ban để cán bộ có thể chọn lại tên"
                                    >
                                      <Unlock className="w-3 h-3" />
                                      <span>{unlockingId === person.id ? '...' : 'Mở khóa TB'}</span>
                                    </button>

                                    {canDelete && person.id > 99 && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteRosterStaff(person)}
                                        className="p-1 rounded-lg text-red-500 hover:bg-red-50"
                                        title="Xóa khỏi danh sách Giao ban"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  });
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL TẠO / TẢI / IN MÃ QR RIÊNG DÁN ĐÈ LÊN BẢNG CŨ */}
      <BriefingQrStickerModal
        isOpen={showQrPosterModal}
        onClose={() => setShowQrPosterModal(false)}
      />

      {/* MODAL THÊM NHÂN SỰ VÀO DANH SÁCH GIAO BAN */}
      {showAddStaffModal && (
        <div className="fixed inset-0 bg-slate-900/75 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
              <h3 className="font-black text-sm uppercase">Thêm Cán Bộ Vào Danh Sách Giao Ban</h3>
              <button
                type="button"
                onClick={() => setShowAddStaffModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white font-bold"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddRosterStaff} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Khoa / Phòng:</label>
                <select
                  value={newStaffForm.department}
                  onChange={e => setNewStaffForm({ ...newStaffForm, department: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-800"
                >
                  {BRIEFING_DEPARTMENTS_ORDER.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Họ và tên cán bộ:</label>
                <input
                  type="text"
                  required
                  value={newStaffForm.name}
                  onChange={e => setNewStaffForm({ ...newStaffForm, name: e.target.value })}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-semibold text-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Chuyên môn:</label>
                  <input
                    type="text"
                    value={newStaffForm.specialty}
                    onChange={e => setNewStaffForm({ ...newStaffForm, specialty: e.target.value })}
                    placeholder="BSCKI, Ths, CNĐD..."
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Chức vụ (nếu có):</label>
                  <input
                    type="text"
                    value={newStaffForm.position}
                    onChange={e => setNewStaffForm({ ...newStaffForm, position: e.target.value })}
                    placeholder="TK, ĐDT, Phó Khoa..."
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-semibold text-slate-800"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm"
                >
                  Lưu vào danh sách
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
