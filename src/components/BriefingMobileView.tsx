import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { format } from 'date-fns';
import {
  QrCode,
  CheckCircle,
  XCircle,
  Clock,
  Camera,
  RefreshCw,
  UserCheck,
  Sparkles,
  Upload,
  Lock,
  Unlock,
  History,
  Calendar,
  ChevronDown,
  Search,
  Check,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';
import {
  BriefingRosterItem,
  BriefingAttendanceRecord,
  DEFAULT_BRIEFING_ROSTER,
  BRIEFING_POSTER_IMAGE_URL,
  findMatchingRosterStaff,
  formatCleanBriefingName,
  normalizeVietnameseText,
} from '../lib/briefingRoster';
import { apiFetch } from '../lib/api';
import { playCheckInSuccessSound, triggerAttendanceAudio, unlockAudio } from '../lib/audio';
import { useAuth } from '../context/AuthContext';

interface BriefingMobileViewProps {
  currentName: string;
  currentDepartment: string;
  isDeviceLocked?: boolean;
  boundUser?: any;
  scannedQrToken?: string;
  onClearScannedQrToken?: () => void;
  onSelectIdentity?: (name: string, department: string) => void;
  onBackToHome?: () => void;
}

const BRIEFING_LOCKED_ID_KEY = 'briefing_locked_roster_id';
const BRIEFING_LOCKED_NAME_KEY = 'briefing_locked_name';
const BRIEFING_LOCKED_AT_KEY = 'briefing_locked_at';
const BRIEFING_DEVICE_ID_KEY = 'briefing_device_id';

function getOrCreateBriefingDeviceId(): string {
  try {
    let devId = window.localStorage.getItem(BRIEFING_DEVICE_ID_KEY);
    if (!devId) {
      devId = `brf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      window.localStorage.setItem(BRIEFING_DEVICE_ID_KEY, devId);
    }
    return devId;
  } catch (e) {
    return `brf_${Date.now()}`;
  }
}

function getVietnameseDayOfWeek(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return '';
    const dateObj = new Date(y, m - 1, d);
    const day = dateObj.getDay();
    const map: Record<number, string> = {
      0: 'Chủ Nhật',
      1: 'Thứ Hai',
      2: 'Thứ Ba',
      3: 'Thứ Tư',
      4: 'Thứ Năm',
      5: 'Thứ Sáu',
      6: 'Thứ Bảy',
    };
    return map[day] || '';
  } catch (e) {
    return '';
  }
}

export const BriefingMobileView: React.FC<BriefingMobileViewProps> = ({
  currentName,
  currentDepartment,
  isDeviceLocked,
  boundUser,
  scannedQrToken,
  onClearScannedQrToken,
  onSelectIdentity,
}) => {
  const { userData } = useAuth();
  const isAdminSession = userData?.role === 'admin' || userData?.role === 'super_admin';

  const [dateStr] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [roster, setRoster] = useState<BriefingRosterItem[]>(DEFAULT_BRIEFING_ROSTER);
  const [attendanceMap, setAttendanceMap] = useState<Record<number, BriefingAttendanceRecord>>({});
  const [myHistory, setMyHistory] = useState<BriefingAttendanceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Permanent locked roster ID in localStorage (only set after user explicitly confirms)
  const [lockedRosterId, setLockedRosterId] = useState<number | null>(() => {
    try {
      const savedLocked = window.localStorage.getItem(BRIEFING_LOCKED_ID_KEY);
      if (savedLocked) return Number(savedLocked);
      return null;
    } catch (e) {
      return null;
    }
  });

  // Dropdown selection & confirmation state (when not locked yet)
  const [pendingRosterId, setPendingRosterId] = useState<number | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [dropdownSearch, setDropdownSearch] = useState<string>('');
  const [showConfirmStep, setShowConfirmStep] = useState<boolean>(false);
  const [unlockedNotice, setUnlockedNotice] = useState<string | null>(null);

  // Admin unlock modal states on mobile
  const [showAdminUnlockModal, setShowAdminUnlockModal] = useState<boolean>(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('');
  const [adminUnlockError, setAdminUnlockError] = useState<string | null>(null);
  const [adminUnlockLoading, setAdminUnlockLoading] = useState<boolean>(false);

  // History filters (by Month YYYY-MM and by Date YYYY-MM-DD)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => format(new Date(), 'yyyy-MM'));
  const [selectedFilterDate, setSelectedFilterDate] = useState<string>('ALL');

  // Scanner modal states
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scanResultBanner, setScanResultBanner] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoCheckedInRef = useRef<boolean>(false);
  const dropdownContainerRef = useRef<HTMLDivElement | null>(null);
  const lockedRosterIdRef = useRef<number | null>(lockedRosterId);

  useEffect(() => {
    lockedRosterIdRef.current = lockedRosterId;
  }, [lockedRosterId]);

  // Cleanly formatted roster list (only clean names, keeping original 1..99 order)
  const cleanRoster = useMemo(() => {
    return roster.map((item, idx) => ({
      ...item,
      cleanName: formatCleanBriefingName(item.name),
      orderNumber: idx + 1,
    }));
  }, [roster]);

  // Filtered dropdown items when searching inside dropdown
  const filteredDropdownRoster = useMemo(() => {
    const q = normalizeVietnameseText(dropdownSearch);
    if (!q) return cleanRoster;
    return cleanRoster.filter(
      item =>
        normalizeVietnameseText(item.cleanName).includes(q) ||
        String(item.orderNumber).padStart(2, '0').includes(q)
    );
  }, [cleanRoster, dropdownSearch]);

  // Resolve locked staff member
  const selectedStaff = useMemo(
    () => (lockedRosterId ? cleanRoster.find(r => Number(r.id) === Number(lockedRosterId)) || null : null),
    [cleanRoster, lockedRosterId]
  );

  // Resolve pending selected staff member in dropdown before confirmation
  const pendingStaff = useMemo(
    () => (pendingRosterId ? cleanRoster.find(r => Number(r.id) === Number(pendingRosterId)) || null : null),
    [cleanRoster, pendingRosterId]
  );

  // Pre-select matching name in dropdown (without auto-locking) if user has a name on device
  useEffect(() => {
    if (lockedRosterId || pendingRosterId) return;
    const targetName = (boundUser?.name || currentName || '').trim();
    const targetDept = (boundUser?.department || currentDepartment || '').trim();
    if (targetName && cleanRoster.length > 0) {
      const matched = findMatchingRosterStaff(cleanRoster, targetName, targetDept);
      if (matched) {
        setPendingRosterId(matched.id);
      }
    }
  }, [boundUser, currentName, currentDepartment, cleanRoster, lockedRosterId, pendingRosterId]);

  // Close custom dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const clearLocalDeviceLock = (noticeMsg?: string) => {
    try {
      window.localStorage.removeItem(BRIEFING_LOCKED_ID_KEY);
      window.localStorage.removeItem(BRIEFING_LOCKED_NAME_KEY);
      window.localStorage.removeItem(BRIEFING_LOCKED_AT_KEY);
      window.localStorage.removeItem('briefing_selected_roster_id');
    } catch (e) {}
    lockedRosterIdRef.current = null;
    setLockedRosterId(null);
    setPendingRosterId(null);
    setShowConfirmStep(false);
    setShowAdminUnlockModal(false);
    setAdminPasswordInput('');
    setAdminUnlockError(null);
    if (noticeMsg) {
      setUnlockedNotice(noticeMsg);
    }
  };

  const loadBriefingData = async (silent = false) => {
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

        // Check if Admin remotely unlocked this device
        const activeLockedId = lockedRosterIdRef.current;
        if (activeLockedId && res.data.deviceLocks && typeof res.data.deviceLocks === 'object') {
          const serverLock = res.data.deviceLocks[activeLockedId];
          let localLockedAt = 0;
          try {
            localLockedAt = Number(window.localStorage.getItem(BRIEFING_LOCKED_AT_KEY) || '0');
          } catch (e) {}

          if (serverLock) {
            const serverUnlockedAt = Number(serverLock.unlockedAt || 0);
            if (!serverLock.isLocked && serverUnlockedAt > 0 && serverUnlockedAt >= localLockedAt) {
              clearLocalDeviceLock(
                'Quản trị viên (Admin) đã mở khóa thiết bị Giao ban. Bạn có thể chọn lại Họ và tên ở bên dưới!'
              );
              return;
            }
          } else {
            // Register existing local lock with server so Admin sees "Đã khóa TB" on dashboard
            const ts = localLockedAt || Date.now();
            try {
              if (!localLockedAt) {
                window.localStorage.setItem(BRIEFING_LOCKED_AT_KEY, String(ts));
              }
            } catch (e) {}
            const lockedName = window.localStorage.getItem(BRIEFING_LOCKED_NAME_KEY) || '';
            apiFetch('/api/briefing/lock-device', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                rosterId: activeLockedId,
                deviceId: getOrCreateBriefingDeviceId(),
                staffName: lockedName,
                lockedAt: ts,
              }),
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('Error loading briefing data:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadPersonalHistory = async (rosterId: number, silent = false) => {
    if (!silent) setLoadingHistory(true);
    try {
      const res = await apiFetch(`/api/briefing/my-history?rosterId=${encodeURIComponent(rosterId)}&_t=${Date.now()}`);
      if (res.ok && Array.isArray(res.data?.history)) {
        setMyHistory(res.data.history);
      }
    } catch (err) {
      console.warn('Error loading personal briefing history:', err);
    } finally {
      if (!silent) setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadBriefingData();
    const timer = setInterval(() => loadBriefingData(true), 5000);
    return () => clearInterval(timer);
  }, [dateStr]);

  useEffect(() => {
    if (selectedStaff?.id) {
      loadPersonalHistory(selectedStaff.id);
    } else {
      setMyHistory([]);
    }
  }, [selectedStaff?.id]);

  // Auto-decode hospital poster QR once in background
  useEffect(() => {
    let cancelled = false;
    const syncPosterQrPayload = async () => {
      try {
        const res = await fetch(BRIEFING_POSTER_IMAGE_URL);
        if (!res.ok) return;
        const blob = await res.blob();
        const file = new File([blob], 'briefing_qr.jpg', { type: blob.type || 'image/jpeg' });
        const tempDivId = 'briefing-hidden-qr-reader';
        let el = document.getElementById(tempDivId);
        if (!el) {
          el = document.createElement('div');
          el.id = tempDivId;
          el.style.display = 'none';
          document.body.appendChild(el);
        }
        const reader = new Html5Qrcode(tempDivId);
        const decodedText = await reader.scanFile(file, false);
        reader.clear();
        if (!cancelled && decodedText && decodedText.trim()) {
          await apiFetch('/api/briefing/qr-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expectedQrPayload: decodedText.trim() }),
          });
        }
      } catch (e) {}
    };
    syncPosterQrPayload();
    return () => {
      cancelled = true;
    };
  }, []);

  const myAttendanceToday = selectedStaff ? attendanceMap[selectedStaff.id] : undefined;

  // Available months for history filtering (always includes current month + past 11 months + any month in myHistory)
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthSet.add(format(d, 'yyyy-MM'));
    }
    myHistory.forEach(rec => {
      if (rec.dateStr && rec.dateStr.length >= 7) {
        monthSet.add(rec.dateStr.slice(0, 7));
      }
    });
    return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
  }, [myHistory]);

  // History filtered by selected Month
  const monthFilteredHistory = useMemo(() => {
    if (selectedMonth === 'ALL') return myHistory;
    return myHistory.filter(rec => rec.dateStr && rec.dateStr.startsWith(selectedMonth));
  }, [myHistory, selectedMonth]);

  // Available dates within the selected Month
  const availableDatesInMonth = useMemo(() => {
    const dateSet = new Set<string>();
    monthFilteredHistory.forEach(rec => {
      if (rec.dateStr) dateSet.add(rec.dateStr);
    });
    return Array.from(dateSet).sort((a, b) => b.localeCompare(a));
  }, [monthFilteredHistory]);

  // Final filtered history by Month and Date
  const displayedHistory = useMemo(() => {
    if (selectedFilterDate === 'ALL') return monthFilteredHistory;
    return monthFilteredHistory.filter(rec => rec.dateStr === selectedFilterDate);
  }, [monthFilteredHistory, selectedFilterDate]);

  const stopCameraScanner = async () => {
    if (html5QrCodeRef.current && isScanningRef.current) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (e) {}
      try {
        html5QrCodeRef.current.clear();
      } catch (e) {}
    }
    isScanningRef.current = false;
    html5QrCodeRef.current = null;
  };

  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, []);

  const handleOpenScanner = async (staffOverride?: BriefingRosterItem) => {
    const activeStaff = staffOverride || selectedStaff;
    if (!activeStaff) return;

    unlockAudio();
    setScanResultBanner(null);
    setScannerError(null);
    setIsScannerOpen(true);

    setTimeout(async () => {
      try {
        await stopCameraScanner();
        const containerEl = document.getElementById('briefing-qr-video-container');
        if (!containerEl) return;

        const scanner = new Html5Qrcode('briefing-qr-video-container');
        html5QrCodeRef.current = scanner;
        isScanningRef.current = true;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 12,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1.0,
          },
          async decodedText => {
            if (!isScanningRef.current) return;
            isScanningRef.current = false;
            await stopCameraScanner();
            setIsScannerOpen(false);
            await handleSubmitQrCheckIn(decodedText, activeStaff);
          },
          () => {}
        );
      } catch (err: any) {
        isScanningRef.current = false;
        setScannerError(
          'Không thể mở camera trực tiếp (có thể do trình duyệt Zalo hoặc chưa cấp quyền Camera). Bạn hãy bấm nút "Chụp ảnh / Chọn ảnh mã QR" bên dưới để điểm danh ngay!'
        );
      }
    }, 250);
  };

  const handleCloseScanner = async () => {
    await stopCameraScanner();
    setIsScannerOpen(false);
    setScannerError(null);
  };

  const handleScanFromImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScannerError(null);
    try {
      await stopCameraScanner();
      const tempId = 'briefing-file-qr-reader';
      let el = document.getElementById(tempId);
      if (!el) {
        el = document.createElement('div');
        el.id = tempId;
        el.style.display = 'none';
        document.body.appendChild(el);
      }
      const reader = new Html5Qrcode(tempId);
      const decodedText = await reader.scanFile(file, false);
      reader.clear();
      setIsScannerOpen(false);
      await handleSubmitQrCheckIn(decodedText);
    } catch (err) {
      setScannerError('Không nhận diện được mã QR trong ảnh. Vui lòng chụp rõ nét mã QR Điểm danh Giao ban.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmitQrCheckIn = async (qrPayload: string, targetStaffOverride?: BriefingRosterItem) => {
    const staffToRecord = targetStaffOverride || selectedStaff;
    if (!staffToRecord) return;
    setSubmitting(true);
    setScanResultBanner(null);

    const cleanName = formatCleanBriefingName(staffToRecord.name);

    try {
      const res = await apiFetch('/api/briefing/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rosterId: staffToRecord.id,
          name: cleanName,
          department: staffToRecord.department,
          qrPayload: qrPayload.trim(),
          dateStr,
        }),
      });

      if (res.ok && res.data?.success) {
        const rec: BriefingAttendanceRecord = res.data.record;
        setAttendanceMap(prev => ({
          ...prev,
          [staffToRecord.id]: rec,
        }));
        try {
          window.localStorage.setItem(BRIEFING_LOCKED_ID_KEY, String(staffToRecord.id));
          window.localStorage.setItem(BRIEFING_LOCKED_NAME_KEY, cleanName);
          window.localStorage.setItem('briefing_selected_roster_id', String(staffToRecord.id));
        } catch (e) {}
        playCheckInSuccessSound();
        setScanResultBanner({
          type: 'success',
          title: 'ĐIỂM DANH GIAO BAN THÀNH CÔNG!',
          message: `Đã ghi nhận có mặt: ${cleanName} lúc ${rec.timeStr} ngày ${format(new Date(), 'dd/MM/yyyy')}.`,
        });
        if (onClearScannedQrToken) onClearScannedQrToken();
        loadBriefingData(true);
        loadPersonalHistory(staffToRecord.id, true);
      } else {
        triggerAttendanceAudio('error');
        setScanResultBanner({
          type: 'error',
          title: 'Điểm danh không thành công',
          message: res.data?.error || res.error || 'Mã QR không hợp lệ hoặc không đúng mã QR phòng Giao ban.',
        });
      }
    } catch (err: any) {
      triggerAttendanceAudio('error');
      setScanResultBanner({
        type: 'error',
        title: 'Lỗi kết nối máy chủ',
        message: err.message || 'Vui lòng thử lại.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Auto check-in if user arrived by scanning the physical QR code on the wall with phone camera and their identity is locked
  useEffect(() => {
    if (scannedQrToken && selectedStaff && !autoCheckedInRef.current) {
      autoCheckedInRef.current = true;
      handleSubmitQrCheckIn(scannedQrToken, selectedStaff);
    }
  }, [scannedQrToken, selectedStaff]);

  // Confirm & permanently lock the selected staff name on this phone
  const handleConfirmAndLock = () => {
    if (!pendingStaff) return;
    const lockTs = Date.now();
    setLockedRosterId(pendingStaff.id);
    lockedRosterIdRef.current = pendingStaff.id;
    setShowConfirmStep(false);
    setIsDropdownOpen(false);
    setUnlockedNotice(null);

    try {
      window.localStorage.setItem(BRIEFING_LOCKED_ID_KEY, String(pendingStaff.id));
      window.localStorage.setItem(BRIEFING_LOCKED_NAME_KEY, pendingStaff.cleanName);
      window.localStorage.setItem(BRIEFING_LOCKED_AT_KEY, String(lockTs));
      window.localStorage.setItem('briefing_selected_roster_id', String(pendingStaff.id));
    } catch (e) {}

    apiFetch('/api/briefing/lock-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rosterId: pendingStaff.id,
        deviceId: getOrCreateBriefingDeviceId(),
        staffName: pendingStaff.cleanName,
        lockedAt: lockTs,
      }),
    }).catch(() => {});

    if (onSelectIdentity && !isDeviceLocked) {
      onSelectIdentity(pendingStaff.cleanName, pendingStaff.department);
    }

    if (scannedQrToken) {
      autoCheckedInRef.current = true;
      handleSubmitQrCheckIn(scannedQrToken, pendingStaff);
    }
  };

  // Handle Admin unlocking directly on mobile device
  const handleAdminUnlockSubmit = async (e?: React.FormEvent, bypassPassword = false) => {
    if (e) e.preventDefault();
    if (!selectedStaff) return;

    setAdminUnlockLoading(true);
    setAdminUnlockError(null);
    try {
      const res = await apiFetch('/api/briefing/unlock-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rosterId: selectedStaff.id,
          adminPassword: adminPasswordInput.trim(),
          requirePassword: !bypassPassword && !isAdminSession,
        }),
      });

      if (res.ok && res.data?.success) {
        clearLocalDeviceLock(
          'Quản trị viên (Admin) đã mở khóa thiết bị thành công. Vui lòng chọn lại Họ và tên của bạn!'
        );
      } else {
        setAdminUnlockError(res.data?.error || res.error || 'Mật khẩu Quản trị viên (Admin) không chính xác!');
      }
    } catch (err: any) {
      setAdminUnlockError(err.message || 'Lỗi kết nối máy chủ khi mở khóa.');
    } finally {
      setAdminUnlockLoading(false);
    }
  };

  // ============================================================================
  // VIEW 1: CHƯA KHÓA TÊN -> CHỌN TÊN TRONG DANH SÁCH XỔ XUỐNG & XÁC NHẬN KHÓA
  // (Danh sách chỉnh chu, chỉ hiển thị Họ và tên, bỏ thông tin Khoa/Phòng & Chức danh)
  // ============================================================================
  if (!selectedStaff) {
    return (
      <div className="flex flex-col gap-4 pb-24">
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-blue-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight">
                Chọn Tên Điểm Danh Giao Ban
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Chọn họ và tên của bạn trong danh sách và xác nhận khóa cố định
              </p>
            </div>
          </div>

          {unlockedNotice && (
            <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-950 flex items-start gap-2.5">
              <Unlock className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs font-bold leading-relaxed text-emerald-900">
                {unlockedNotice}
              </div>
              <button
                type="button"
                onClick={() => setUnlockedNotice(null)}
                className="text-emerald-700 hover:text-emerald-950 font-black text-xs"
              >
                ✕
              </button>
            </div>
          )}

          {scannedQrToken && (
            <div className="mb-4 p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-950 flex items-start gap-2.5">
              <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-black text-blue-900 uppercase">Đã nhận tín hiệu từ Mã QR Giao Ban!</p>
                <p className="font-medium leading-relaxed">
                  Vui lòng chọn <b>Họ và tên</b> của bạn trong danh sách xổ xuống bên dưới và bấm <b>Xác nhận</b> để hệ thống khóa cố định vào máy và điểm danh ngay.
                </p>
              </div>
            </div>
          )}

          {/* DANH SÁCH XỔ XUỐNG CHỈNH CHU (CHỈ HIỂN THỊ HỌ VÀ TÊN) */}
          <div className="space-y-4" ref={dropdownContainerRef}>
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase mb-2">
                Danh sách cán bộ Giao ban:
              </label>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(prev => !prev);
                  }}
                  className={`w-full px-4 py-3.5 rounded-2xl border-2 text-left flex items-center justify-between transition-all cursor-pointer ${
                    isDropdownOpen
                      ? 'border-blue-600 bg-blue-50/30 ring-4 ring-blue-100'
                      : pendingStaff
                      ? 'border-blue-500 bg-white'
                      : 'border-slate-200 bg-slate-50 hover:bg-white'
                  }`}
                >
                  <span
                    className={`text-sm font-black truncate ${
                      pendingStaff ? 'text-slate-900' : 'text-slate-400 font-semibold'
                    }`}
                  >
                    {pendingStaff
                      ? `${String(pendingStaff.orderNumber).padStart(2, '0')}. ${pendingStaff.cleanName}`
                      : '-- Bấm để chọn Họ và tên --'}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-500 shrink-0 transition-transform duration-200 ${
                      isDropdownOpen ? 'rotate-180 text-blue-600' : ''
                    }`}
                  />
                </button>

                {/* MENU XỔ XUỐNG */}
                {isDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border-2 border-blue-200 z-50 overflow-hidden">
                    {/* Ô tìm kiếm nhanh trong danh sách xổ xuống */}
                    <div className="p-2.5 bg-slate-50 border-b border-slate-200 sticky top-0">
                      <div className="relative flex items-center">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                        <input
                          type="text"
                          value={dropdownSearch}
                          onChange={e => setDropdownSearch(e.target.value)}
                          placeholder="Tìm nhanh họ và tên..."
                          className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                        />
                        {dropdownSearch && (
                          <button
                            type="button"
                            onClick={() => setDropdownSearch('')}
                            className="absolute right-2.5 text-xs font-bold text-slate-400 hover:text-slate-600"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Danh sách tên chỉnh chu - Bỏ hoàn toàn Khoa/Phòng và Chức danh */}
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {filteredDropdownRoster.length === 0 ? (
                        <div className="py-6 px-4 text-center text-xs text-slate-500 font-semibold">
                          Không tìm thấy tên phù hợp
                        </div>
                      ) : (
                        filteredDropdownRoster.map(item => {
                          const isSelected = pendingRosterId === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setPendingRosterId(item.id);
                                setIsDropdownOpen(false);
                                setShowConfirmStep(true);
                              }}
                              className={`w-full px-4 py-3 text-left flex items-center justify-between transition-colors cursor-pointer ${
                                isSelected ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50 text-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {String(item.orderNumber).padStart(2, '0')}
                                </span>
                                <span className="text-sm font-bold tracking-tight">
                                  {item.cleanName}
                                </span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* BƯỚC XÁC NHẬN & KHÓA TÊN CỐ ĐỊNH VÀO MÁY */}
            {pendingStaff && (
              <div className="p-4 rounded-2xl bg-blue-50/80 border-2 border-blue-200 space-y-3.5 animate-fadeIn">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-black uppercase text-blue-700 tracking-wider">
                      Xác nhận khóa tên điểm danh
                    </p>
                    <p className="text-base font-black text-slate-900 mt-0.5">
                      {pendingStaff.cleanName}
                    </p>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed mt-1">
                      Sau khi bấm <b>Xác nhận & Khóa lại</b>, tên của bạn sẽ được lưu cố định trên điện thoại này. Các lần sau bạn không cần chọn lại tên nữa.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmAndLock}
                    className="flex-1 py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black text-xs sm:text-sm shadow-md shadow-blue-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Lock className="w-4 h-4" />
                    <span>XÁC NHẬN & KHÓA LẠI</span>
                  </button>

                  {showConfirmStep && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsDropdownOpen(true);
                      }}
                      className="py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs transition-all cursor-pointer"
                    >
                      Chọn lại tên khác
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: ĐÃ KHÓA TÊN -> CHỈ HIỂN THỊ NÚT BẬT CAMERA ĐỂ ĐIỂM DANH
  // VÀ BÊN DƯỚI LÀ LỊCH SỬ ĐIỂM DANH THEO NGÀY, THÁNG
  // (Không hiển thị bảng danh sách cán bộ, không hiển thị khoa phòng / chức danh)
  // ============================================================================
  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* KHỐI 1: NÚT BẬT CAMERA ĐIỂM DANH GIAO BAN */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-blue-100 relative overflow-hidden">
        {/* Dòng trạng thái gọn gàng của người điểm danh đã khóa */}
        <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-base font-black text-slate-900 truncate">
                  {selectedStaff.cleanName}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Đã khóa</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {myAttendanceToday ? (
                  <span className="text-emerald-700 font-bold">
                    ✓ Hôm nay đã điểm danh lúc {myAttendanceToday.timeStr}
                  </span>
                ) : (
                  <span>Hôm nay ({format(new Date(), 'dd/MM/yyyy')}): Chưa điểm danh</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (isAdminSession) {
                  handleAdminUnlockSubmit(undefined, true);
                } else {
                  setAdminUnlockError(null);
                  setAdminPasswordInput('');
                  setShowAdminUnlockModal(true);
                }
              }}
              className="px-2.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-extrabold flex items-center gap-1 transition-colors cursor-pointer"
              title="Quyền Admin mở khóa thiết bị để chọn lại tên"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Mở khóa</span>
            </button>

            <button
              type="button"
              onClick={() => {
                loadBriefingData();
                loadPersonalHistory(selectedStaff.id);
              }}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer shrink-0"
              title="Làm mới"
            >
              <RefreshCw className={`w-4 h-4 ${loading || loadingHistory ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Thông báo kết quả sau khi quét */}
        {scanResultBanner && (
          <div
            className={`mb-4 p-3.5 rounded-2xl border flex items-start gap-2.5 ${
              scanResultBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-red-50 border-red-300 text-red-900'
            }`}
          >
            {scanResultBanner.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs">
              <p className="font-black text-sm mb-0.5">{scanResultBanner.title}</p>
              <p className="leading-relaxed font-medium">{scanResultBanner.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setScanResultBanner(null)}
              className="text-slate-400 hover:text-slate-700 font-bold text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* NÚT BẬT CAMERA ĐỂ ĐIỂM DANH */}
        <button
          type="button"
          disabled={submitting}
          onClick={() => handleOpenScanner(selectedStaff)}
          className="w-full py-5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black text-sm sm:text-base shadow-lg shadow-blue-600/30 flex items-center justify-center gap-3 transition-all cursor-pointer"
        >
          <Camera className="w-6 h-6 shrink-0" />
          <span>
            {submitting
              ? 'ĐANG GHI NHẬN ĐIỂM DANH...'
              : 'BẬT CAMERA ĐỂ ĐIỂM DANH'}
          </span>
        </button>
      </div>

      {/* KHỐI 2: LỊCH SỬ ĐIỂM DANH THEO NGÀY, THÁNG */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                Lịch Sử Điểm Danh Theo Ngày, Tháng
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Tổng số buổi đã điểm danh:{' '}
                <b className="text-indigo-700">{displayedHistory.length} buổi</b>
              </p>
            </div>
          </div>
        </div>

        {/* BỘ LỌC THEO THÁNG VÀ THEO NGÀY */}
        <div className="grid grid-cols-2 gap-2.5 mb-4 p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
          {/* Lọc theo Tháng */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
              Chọn Tháng:
            </label>
            <select
              value={selectedMonth}
              onChange={e => {
                setSelectedMonth(e.target.value);
                setSelectedFilterDate('ALL');
              }}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">Tất cả các tháng</option>
              {availableMonths.map(m => {
                const [year, month] = m.split('-');
                return (
                  <option key={m} value={m}>
                    Tháng {month}/{year}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Lọc theo Ngày */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
              Chọn Ngày:
            </label>
            <select
              value={selectedFilterDate}
              onChange={e => setSelectedFilterDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">Tất cả ngày ({monthFilteredHistory.length})</option>
              {availableDatesInMonth.map(d => {
                const formatted = d.split('-').reverse().join('/');
                return (
                  <option key={d} value={d}>
                    Ngày {formatted}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* DANH SÁCH LỊCH SỬ ĐIỂM DANH */}
        {loadingHistory && myHistory.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 font-medium">
            Đang tải lịch sử điểm danh...
          </div>
        ) : displayedHistory.length === 0 ? (
          <div className="py-8 px-4 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-600">
              Chưa có dữ liệu điểm danh trong thời gian này
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Khi bạn bấm nút Bật Camera quét mã QR Giao ban, ngày và giờ điểm danh sẽ hiển thị tại đây.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[52vh] overflow-y-auto pr-0.5">
            {displayedHistory.map(rec => {
              const formattedDate = rec.dateStr
                ? rec.dateStr.split('-').reverse().join('/')
                : format(new Date(rec.timestamp || Date.now()), 'dd/MM/yyyy');
              const dayOfWeek = rec.dateStr ? getVietnameseDayOfWeek(rec.dateStr) : '';
              const monthLabel = rec.dateStr && rec.dateStr.length >= 7
                ? `Tháng ${rec.dateStr.slice(5, 7)}/${rec.dateStr.slice(0, 4)}`
                : '';

              return (
                <div
                  key={`${rec.dateStr}-${rec.id || rec.timestamp}`}
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900">
                        {dayOfWeek ? `${dayOfWeek}, ` : ''}Ngày {formattedDate}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500">
                        {monthLabel}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-black text-xs">
                      <Clock className="w-3 h-3" />
                      <span>{rec.timeStr}</span>
                    </span>
                    <p className="text-[10px] font-bold text-emerald-700 mt-1 uppercase">
                      Đã điểm danh
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL CAMERA QUÉT MÃ QR GIAO BAN */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-slate-900/80 z-[150] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            <div className="bg-blue-700 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                <div>
                  <h3 className="font-black text-sm uppercase">Quét Mã QR Giao Ban</h3>
                  <p className="text-[11px] text-blue-100 font-bold">
                    {selectedStaff.cleanName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseScanner}
                className="w-8 h-8 rounded-full bg-blue-800 hover:bg-blue-900 flex items-center justify-center text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 flex flex-col items-center gap-4">
              <div
                id="briefing-qr-video-container"
                className="w-full aspect-square max-w-[260px] bg-slate-950 rounded-2xl overflow-hidden border-2 border-blue-500 flex items-center justify-center"
              />

              {scannerError ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed text-center">
                  {scannerError}
                </div>
              ) : (
                <p className="text-xs text-slate-600 text-center font-medium">
                  Hướng camera vào bảng <b>Mã QR Điểm danh Giao ban</b> tại phòng họp để ghi nhận có mặt.
                </p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleScanFromImageFile}
                className="hidden"
              />

              <div className="w-full flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Chụp ảnh / Chọn ảnh mã QR từ máy</span>
                </button>

                <button
                  type="button"
                  onClick={handleCloseScanner}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL QUẢN TRỊ VIÊN (ADMIN) MỞ KHÓA THIẾT BỊ GIAO BAN */}
      {showAdminUnlockModal && (
        <div className="fixed inset-0 bg-slate-900/80 z-[150] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                  <Unlock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm uppercase">Admin Mở Khóa Thiết Bị</h3>
                  <p className="text-[11px] text-slate-300 font-medium">
                    Cho phép chọn lại tên điểm danh Giao ban
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAdminUnlockModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={e => handleAdminUnlockSubmit(e, false)} className="p-5 space-y-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <p className="text-slate-500 font-semibold">Tên đang khóa trên máy này:</p>
                <p className="text-sm font-black text-slate-900">{selectedStaff.cleanName}</p>
              </div>

              <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 leading-relaxed">
                <b>Cách 1 (Từ xa):</b> Quản trị viên (Admin) bấm nút <b>"Mở khóa TB"</b> tại dòng tên của bạn trên màn hình Quản lý Giao ban, điện thoại sẽ tự động mở khóa để bạn chọn lại tên.
              </div>

              <div>
                <label className="block font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-rose-600" />
                  <span>Cách 2: Nhập mật khẩu Admin để mở khóa ngay:</span>
                </label>
                <input
                  type="password"
                  value={adminPasswordInput}
                  onChange={e => {
                    setAdminPasswordInput(e.target.value);
                    setAdminUnlockError(null);
                  }}
                  placeholder="Nhập mật khẩu Quản trị viên (Admin)..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                />
              </div>

              {adminUnlockError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 font-bold flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{adminUnlockError}</span>
                </div>
              )}

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="submit"
                  disabled={adminUnlockLoading}
                  className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                >
                  <Unlock className="w-4 h-4" />
                  <span>
                    {adminUnlockLoading ? 'Đang mở khóa...' : 'XÁC NHẬN MỞ KHÓA ĐỂ CHỌN LẠI TÊN'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await loadBriefingData();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Kiểm tra lệnh mở khóa từ máy Admin</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAdminUnlockModal(false)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
