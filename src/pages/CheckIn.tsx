
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { checkLocationValid, getAccurateLocation } from '../lib/location';
import { format, differenceInMinutes } from 'date-fns';
import { MapPin, CheckCircle, XCircle, History, User, Bell, BellRing, Calendar, Clock, LogIn, LogOut, Briefcase, Activity, ChevronRight, Home, CalendarDays , PartyPopper, Heart, Sun, Coffee , AlertTriangle, ShieldCheck, Lock, Unlock, Volume2, VolumeX, Sparkles, Copy, ExternalLink, Wifi, WifiOff, RefreshCw, Database, UserCheck, Loader2, Smartphone, QrCode } from 'lucide-react';
import { AttendanceRecord, AppConfig } from '../types';
import { getDeviceId, getDeviceProfile, DeviceProfile } from '../lib/device';
import { getPositionBadgeClass } from '../lib/format';
import { triggerAttendanceAudio, isSoundEnabled, setSoundEnabled, playCheckInSuccessSound, unlockAudio } from '../lib/audio';
import { isUserNameMatch } from '../lib/dutyExcel';
import { apiFetch } from '../lib/api';
import { HOSPITAL_DEPARTMENTS } from '../lib/departments';
import { 
  getOfflineQueue, 
  saveToOfflineQueue, 
  syncAllOfflineRecords, 
  startOfflineSyncService, 
  removeFromOfflineQueue,
  clearOfflineQueue,
  OfflineAttendanceRecord 
} from '../lib/offlineSync';

import { LocationMap } from '../components/LocationMap';
import { DailyHistoryView } from '../components/DailyHistoryView';
import { LiveGpsWidget } from '../components/LiveGpsWidget';
import { DailyMedicalQuoteWidget } from '../components/DailyMedicalQuoteWidget';
import { BriefingMobileView } from '../components/BriefingMobileView';

let globalTimeOffset = 0;
const getRealTime = () => new Date(Date.now() + globalTimeOffset);
const getRealTimeMs = () => Date.now() + globalTimeOffset;

const safeGetStorage = (key: string, defaultVal: string = ''): string => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key) || defaultVal;
    }
  } catch (e) {}
  return defaultVal;
};

const safeSetStorage = (key: string, val: string): void => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, val);
    }
  } catch (e) {}
};

const safeRemoveStorage = (key: string): void => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch (e) {}
};

const isNumericEmployeeId = (id?: string | null): boolean => {
  if (!id) return false;
  return /^\d+$/.test(id.trim());
};

export default function CheckIn() {
  const navigate = useNavigate();
  const { userData, user } = useAuth();
  const [isZaloBrowser, setIsZaloBrowser] = useState(false);
  const [showZaloModal, setShowZaloModal] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(true);
  const [formError, setFormError] = useState('');
  const [showInvalidIdModal, setShowInvalidIdModal] = useState(false);
  const [invalidIdMessage, setInvalidIdMessage] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  
  // Chống bấm đúp / bấm 2 lần liên tục
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false);
  const isSubmittingRef = useRef(false);
  const lastActionCompletedTimeRef = useRef<number>(0);
  const [showConfirmEarlyOutModal, setShowConfirmEarlyOutModal] = useState(false);
  const [pendingConfirmType, setPendingConfirmType] = useState<'in' | 'out'>('out');

  const { token: paramToken } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const token = paramToken || searchParams.get('checkin');
  const isBriefingUrl =
    Boolean(searchParams.get('qr')) ||
    searchParams.get('tab') === 'briefing' ||
    Boolean(paramToken && paramToken.includes('GIAO_BAN')) ||
    (typeof window !== 'undefined' &&
      (window.location.pathname.includes('GIAO_BAN') ||
        window.location.pathname.includes('giao-ban') ||
        window.location.pathname.includes('briefing')));

  const initialBriefingQr =
    searchParams.get('qr') ||
    (paramToken && paramToken.includes('GIAO_BAN') ? paramToken : '') ||
    (isBriefingUrl ? 'GIAO_BAN_BV_THIEU_HOA' : '');
  const [scannedBriefingQr, setScannedBriefingQr] = useState<string>(initialBriefingQr);

  useEffect(() => {
    try {
      if (/Zalo/i.test(navigator.userAgent)) {
        setIsZaloBrowser(true);
        // Không hiện cảnh báo GPS Zalo nếu đang quét mã QR Giao ban (vì Giao ban chỉ cần quét QR, không cần GPS)
        if (!isBriefingUrl) {
          setShowZaloModal(true);
        }
      }
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Zalo/i.test(navigator.userAgent) ||
        (typeof window !== 'undefined' && (window.innerWidth <= 840 || ('ontouchstart' in window && navigator.maxTouchPoints > 0)));
      setIsMobileDevice(isMobile);
    } catch (e) {
      setIsMobileDevice(true);
    }
  }, [isBriefingUrl]);

  const [status, setStatus] = useState<'idle' | 'checking' | 'success' | 'failed' | 'early_out' | 'warning'>('idle');
  const [message, setMessage] = useState('');
  const [locationDetails, setLocationDetails] = useState<{lat: number, lng: number, accuracy?: number, distance?: number} | null>(null);
  const [showLocationHelp, setShowLocationHelp] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<{os: string, browser: string, deviceModel?: string, fingerprint?: string, screenRes?: string}>({os: 'Khác', browser: 'Khác'});
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile | null>(null);
  const [isDeviceLocked, setIsDeviceLocked] = useState<boolean>(() => safeGetStorage('checkin_identity_confirmed') === 'true');
  const [boundUser, setBoundUser] = useState<any | null>(() => {
    try {
      const cached = safeGetStorage('cached_device_bound_user');
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });
  const [isIdentityConfirmed, setIsIdentityConfirmed] = useState<boolean>(() => safeGetStorage('checkin_identity_confirmed') === 'true');
  
  const [historyRecords, setHistoryRecords] = useState<any[]>(() => {
    try {
      const cached = safeGetStorage('cached_history_records');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return [...parsed].reverse();
      }
    } catch (e) {}
    return [];
  });
  const [appConfig, setAppConfig] = useState<AppConfig | null>(() => {
    try {
      const cached = safeGetStorage('cached_app_config');
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });
  const [rebindPossible, setRebindPossible] = useState<boolean>(false);
  
  const [name, setName] = useState<string>(() => safeGetStorage('checkin_name'));
  const [department, setDepartment] = useState<string>(() => safeGetStorage('checkin_department'));
  const [departmentsList, setDepartmentsList] = useState<{id: string, name: string}[]>(() => {
    try {
      const cached = safeGetStorage('cached_departments');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return HOSPITAL_DEPARTMENTS;
  });
  const [hrUsers, setHrUsers] = useState<any[]>(() => {
    try {
      const cached = safeGetStorage('cached_users');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });
  const [specialEmployees, setSpecialEmployees] = useState<any[]>(() => {
    try {
      const cached = safeGetStorage('cached_special_employees');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });
  const [isReturningUser, setIsReturningUser] = useState<boolean>(() => !!(safeGetStorage('checkin_name') && safeGetStorage('checkin_department')));
  const [lastActionToday, setLastActionToday] = useState<'in' | 'out' | null>(null);
  const [currentTime, setCurrentTime] = useState(getRealTime());
  
  // Quản lý trạng thái mạng & đồng bộ ngoại tuyến (Offline Sync)
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [offlineQueue, setOfflineQueue] = useState<OfflineAttendanceRecord[]>(() => getOfflineQueue());
  const [isSyncingOffline, setIsSyncingOffline] = useState<boolean>(false);
  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);
  const [showOfflineModal, setShowOfflineModal] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Tự động kích hoạt đồng bộ khi có kết nối mạng Internet
      syncAllOfflineRecords().then(summary => {
        if (summary.success > 0) {
          setSyncToastMessage(`Đã tự động đồng bộ thành công ${summary.success} lượt điểm danh ngoại tuyến lên máy chủ!`);
          setTimeout(() => setSyncToastMessage(null), 5000);
          loadData();
        }
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleQueueChange = (e: any) => {
      setOfflineQueue(e.detail?.queue || getOfflineQueue());
    };

    const handleSynced = (e: any) => {
      const count = e.detail?.syncedCount || 0;
      if (count > 0) {
        setSyncToastMessage(`Đã tự động đồng bộ thành công ${count} lượt điểm danh ngoại tuyến lên máy chủ!`);
        setTimeout(() => setSyncToastMessage(null), 5000);
        loadData();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('attendance_offline_queue_changed', handleQueueChange);
    window.addEventListener('attendance_offline_synced', handleSynced);

    const cleanupSyncService = startOfflineSyncService((summary) => {
      if (summary.success > 0) {
        setSyncToastMessage(`Đã tự động đồng bộ thành công ${summary.success} lượt điểm danh ngoại tuyến!`);
        setTimeout(() => setSyncToastMessage(null), 5000);
        loadData();
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('attendance_offline_queue_changed', handleQueueChange);
      window.removeEventListener('attendance_offline_synced', handleSynced);
      cleanupSyncService();
    };
  }, []);

  const handleManualSync = async () => {
    if (!navigator.onLine) {
      alert("Thiết bị hiện chưa có kết nối Internet. Vui lòng bật Wi-Fi hoặc 4G để đồng bộ.");
      return;
    }
    setIsSyncingOffline(true);
    try {
      const res = await syncAllOfflineRecords();
      if (res.success > 0) {
        setSyncToastMessage(`Đã đồng bộ thành công ${res.success} lượt điểm danh lên máy chủ!`);
        setTimeout(() => setSyncToastMessage(null), 5000);
        loadData();
      } else if (res.failed > 0) {
        alert(`Đồng bộ thất bại với ${res.failed} lượt điểm danh. Vui lòng kiểm tra lại kết nối mạng.`);
      } else {
        alert("Hiện không có bản ghi ngoại tuyến nào cần đồng bộ.");
      }
    } finally {
      setIsSyncingOffline(false);
    }
  };

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showDeviceLockedInfoModal, setShowDeviceLockedInfoModal] = useState(false);
  const [showDesignatedUnlockModal, setShowDesignatedUnlockModal] = useState(false);
  const [designatedOperatorInput, setDesignatedOperatorInput] = useState('');
  const [designatedUnlockLoading, setDesignatedUnlockLoading] = useState(false);
  const [designatedUnlockError, setDesignatedUnlockError] = useState<string | null>(null);
  const [designatedUnlockSuccess, setDesignatedUnlockSuccess] = useState<string | null>(null);

  const designatedUnlockers = appConfig?.designatedUnlockers || [];
  const hasDesignatedUnlockers = designatedUnlockers.length > 0;

  const getUnlockButtonLabel = () => {
    if (!hasDesignatedUnlockers) {
      return 'Mở khóa thiết bị (Chưa có nhân viên được Admin chỉ định)';
    }
    if (designatedUnlockers.length === 1) {
      return `Mở khóa thiết bị (Ủy quyền: ${designatedUnlockers[0].name} - Mã ${designatedUnlockers[0].uid})`;
    }
    const names = designatedUnlockers.map(d => d.name).join(', ');
    if (names.length <= 40) {
      return `Mở khóa thiết bị (Ủy quyền: ${names})`;
    }
    return `Mở khóa thiết bị (Ủy quyền: ${designatedUnlockers[0].name} +${designatedUnlockers.length - 1} người)`;
  };

  const handleOpenUnlockModal = () => {
    setShowDeviceLockedInfoModal(false);
    setDesignatedUnlockError(null);
    setDesignatedUnlockSuccess(null);
    setDesignatedOperatorInput(designatedUnlockers.length === 1 ? designatedUnlockers[0].uid : '');
    setShowDesignatedUnlockModal(true);
  };

  const handlePerformDesignatedUnlock = async () => {
    if (!hasDesignatedUnlockers) {
      setDesignatedUnlockError('Nếu admin chưa chỉ định thì không được mở khóa. Vui lòng liên hệ Quản trị viên hệ thống.');
      return;
    }
    if (!designatedOperatorInput.trim()) {
      setDesignatedUnlockError('Vui lòng chọn hoặc nhập mã/tên nhân viên được Quản trị viên chỉ định quyền mở khóa.');
      return;
    }
    setDesignatedUnlockLoading(true);
    setDesignatedUnlockError(null);
    try {
      const activeFingerprint = deviceProfile?.fingerprint || deviceInfo?.fingerprint || localStorage.getItem('device_fingerprint_id') || '';
      const activeUserId = boundUser?.uid || hrUsers.find(u => u.name?.trim()?.toLowerCase() === name?.trim()?.toLowerCase())?.uid || localStorage.getItem('checkin_userId') || '';
      const activeUserName = boundUser?.name || name || localStorage.getItem('checkin_name') || '';

      const res = await fetch('/api/user_devices/unlock_by_designated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorUid: designatedOperatorInput.trim(),
          targetFingerprint: activeFingerprint,
          targetUserId: activeUserId,
          targetUserName: activeUserName
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDesignatedUnlockError(data.error || 'Xác minh thất bại. Không thể mở khóa thiết bị.');
        return;
      }

      setDesignatedUnlockSuccess(data.message || 'Mở khóa thiết bị thành công!');
      localStorage.removeItem('cached_device_bound_user');
      localStorage.removeItem('checkin_bound_user');
      localStorage.removeItem('checkin_identity_confirmed');
      setBoundUser(null);
      setIsDeviceLocked(false);
      setIsIdentityConfirmed(false);
      setTimeout(() => {
        setShowDesignatedUnlockModal(false);
        setDesignatedUnlockSuccess(null);
      }, 1500);
    } catch (err: any) {
      setDesignatedUnlockError(err.message || 'Lỗi mạng khi mở khóa thiết bị.');
    } finally {
      setDesignatedUnlockLoading(false);
    }
  };

  const [showIdentityConfirmModal, setShowIdentityConfirmModal] = useState(false);
  const [pendingCheckInType, setPendingCheckInType] = useState<'in' | 'out'>('in');
  const [switchingEmployee, setSwitchingEmployee] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => isSoundEnabled());

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabledState(next);
    setSoundEnabled(next);
    if (next) {
      playCheckInSuccessSound();
    }
  };

  const handleInitiateCheckIn = (type: 'in' | 'out', confirmedQuickOut: boolean = false) => {
    // 1. Chống bấm đúp / bấm liên tục nhiều lần
    if (isSubmittingRef.current || isSubmittingCheckIn || status === 'checking') {
      return;
    }
    const now = Date.now();
    if (now - lastActionCompletedTimeRef.current < 2500) {
      return;
    }

    const currentName = (name || safeGetStorage('checkin_name')).trim();
    const currentDept = (department || safeGetStorage('checkin_department')).trim();

    if (!currentName || !currentDept) {
      setStatus('failed');
      setMessage("Vui lòng nhập Họ và Tên và chọn Khoa / Phòng trước khi điểm danh!");
      return;
    }

    // 2. Chống bấm nhầm Ra ca ngay sau khi Vào ca (trong vòng 5 phút)
    if (type === 'out' && !confirmedQuickOut) {
      const mostRecentIn = historyRecords.find(r => r.status === 'success' && r.type === 'in');
      const lastInTime = mostRecentIn ? (Number(mostRecentIn.timestamp) || 0) : 0;
      const isVeryRecentIn = (lastActionToday === 'in' || (lastInTime > 0 && (now - lastInTime < 300000)));

      if (isVeryRecentIn) {
        setPendingConfirmType('out');
        setShowConfirmEarlyOutModal(true);
        return;
      }
    }

    // Check if user is locked / hidden by Admin
    const targetUser = hrUsers.find((u: any) => 
      u.name?.trim()?.toLowerCase() === currentName.toLowerCase() || 
      u.uid === (boundUser?.uid || safeGetStorage('checkin_userId'))
    );
    if (targetUser && (targetUser.is_hidden || targetUser.status === 'inactive' || targetUser.status === 'locked')) {
      setStatus('failed');
      setMessage("Tài khoản của bạn bị khóa do chưa khai báo phòng tổ chức hành chính. Hãy khai báo để điểm danh.");
      triggerAttendanceAudio('error');
      return;
    }

    // Check if user ID is numeric (Bắt buộc mã nhân viên dạng số, không cho phép dạng chuỗi như SwhVgaPovhYgzvU5RD6f2GHWF1l1)
    const currentUid = targetUser?.uid || boundUser?.uid || safeGetStorage('checkin_userId');
    if (!currentUid || !isNumericEmployeeId(currentUid)) {
      setStatus('failed');
      const errTxt = `Mã nhân viên "${currentUid || 'chưa xác định'}" là dạng chuỗi ký tự (như "SwhVgaPovhYgzvU5RD6f2GHWF1l1"). Hệ thống không cho phép điểm danh với mã chuỗi. Mã nhân viên bắt buộc phải là dạng số (ví dụ: 102, 314, 490).`;
      setMessage(errTxt);
      setInvalidIdMessage(`Mã nhân viên "${currentUid || 'chưa xác định'}" của nhân viên "${currentName}" không phải là dạng số. Bạn bắt buộc phải chọn lại Khoa / Phòng và chọn đúng nhân viên có mã số.`);
      setShowInvalidIdModal(true);
      triggerAttendanceAudio('error');
      return;
    }

    // Check if device is bound to someone else (Chống điểm danh hộ)
    if (isDeviceLocked && boundUser && boundUser.name && boundUser.name.trim().toLowerCase() !== currentName.toLowerCase()) {
      setStatus('failed');
      setMessage(`Thiết bị này đã được khóa cho nhân viên "${boundUser.name}". Mỗi nhân viên chỉ được sử dụng 1 thiết bị để chống điểm danh hộ.`);
      triggerAttendanceAudio('error');
      return;
    }

    const isIdentityConfirmed = safeGetStorage('checkin_identity_confirmed') === 'true';
    const isBoundToCurrent = isDeviceLocked && boundUser && boundUser.name?.trim()?.toLowerCase() === currentName.toLowerCase();

    // If device is already verified/locked or identity was confirmed, proceed directly (NEVER show modal again!)
    if (isBoundToCurrent || isIdentityConfirmed) {
      handleCheckIn(type, false, confirmedQuickOut);
      return;
    }

    // Otherwise, show the Identity Confirmation modal only on first time setup
    setPendingCheckInType(type);
    setShowIdentityConfirmModal(true);
  };

  const handleConfirmIdentityAndCheckIn = async () => {
    setShowIdentityConfirmModal(false);
    const currentName = (name || localStorage.getItem('checkin_name') || '').trim();
    const currentDept = (department || localStorage.getItem('checkin_department') || '').trim();
    
    localStorage.setItem('checkin_identity_confirmed', 'true');
    localStorage.setItem('checkin_name', currentName);
    localStorage.setItem('checkin_department', currentDept);

    // Lock & Bind device to this user in database
    try {
      const currentProfile = deviceProfile || await getDeviceProfile();
      const matchedUser = hrUsers.find((u: any) => u.name?.trim()?.toLowerCase() === currentName.toLowerCase());
      const uid = matchedUser?.uid || localStorage.getItem('checkin_userId') || currentProfile.fingerprint;
      if (uid) localStorage.setItem('checkin_userId', uid);

      await apiFetch('/api/user_devices/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          userName: currentName,
          department: currentDept,
          fingerprint: currentProfile.fingerprint,
          deviceInfo: currentProfile
        })
      });

      setIsDeviceLocked(true);
      setBoundUser({
        uid,
        name: currentName,
        department: currentDept
      });
    } catch (err) {
      console.warn("Device bind error on confirmation:", err);
    }

    await handleCheckIn(pendingCheckInType, true);
  };

  const handleRejectIdentity = () => {
    setShowIdentityConfirmModal(false);
    localStorage.removeItem('checkin_identity_confirmed');
    localStorage.removeItem('checkin_name');
    localStorage.removeItem('checkin_department');
    localStorage.removeItem('checkin_userId');
    setName('');
    setDepartment('');
    setIsReturningUser(false);
    setIsDeviceLocked(false);
    setBoundUser(null);
  };

  // Vô hiệu hóa hoàn toàn tính năng thoát / đăng xuất của người dùng để đảm bảo tính minh bạch
  // Chỉ Quản trị viên (Admin) mới có quyền mở khóa thiết bị tại trang Quản trị.

  const fetchNotifs = async () => {
    try {
      const res = await apiFetch('/api/notifications');
      if (res.ok && res.data) {
        setNotifications(res.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (showNotifications) fetchNotifs();
  }, [showNotifications]);


  const [activeTab, setActiveTab] = useState<'home' | 'briefing' | 'history' | 'schedule' | 'profile'>(() =>
    isBriefingUrl ? 'briefing' : 'home'
  );

  // Tự động chuyển thẳng vào phần Giao ban khi người dùng quét mã QR Giao ban
  useEffect(() => {
    if (isBriefingUrl) {
      setActiveTab('briefing');
      if (initialBriefingQr) {
        setScannedBriefingQr(initialBriefingQr);
      }
      setShowZaloModal(false);
    }
  }, [isBriefingUrl, initialBriefingQr]);
  const [showReminderPrompt, setShowReminderPrompt] = useState(false);
  const [reminderPromptDetails, setReminderPromptDetails] = useState<{ title?: string; message?: string; type?: 'in' | 'out' }>({});

  const triggerReminderCheckInFlow = (details?: { title?: string; type?: 'in' | 'out' }) => {
    setActiveTab('home');
    setShowReminderPrompt(true);
    setReminderPromptDetails({
      title: details?.title || 'Nhắc nhở chấm công theo ca',
      type: details?.type || (lastActionToday === 'in' ? 'out' : 'in'),
      message: 'Hệ thống đã tự động mở theo nhắc nhở điểm danh. Vui lòng bấm nút bên dưới để hoàn tất chấm công!'
    });
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {}
  };

  useEffect(() => {
    const ua = navigator.userAgent;
    let browser = 'Khác';
    if (/Zalo/i.test(ua)) browser = 'Zalo';
    else if (/FBAN|FBAV/i.test(ua)) browser = 'Facebook';
    else if (/Instagram/i.test(ua)) browser = 'Instagram';
    else if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
    else if (ua.indexOf('SamsungBrowser') > -1) browser = 'Samsung Browser';
    else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) browser = 'Opera';
    else if (ua.indexOf('Edge') > -1 || ua.indexOf('Edg') > -1) browser = 'Edge';
    else if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
    else if (ua.indexOf('Safari') > -1) browser = 'Safari';

    let os = 'Khác';
    if (/Android/.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
    else if (ua.indexOf('Win') > -1) os = 'Windows';
    else if (ua.indexOf('Mac') > -1) os = 'MacOS';
    else if (ua.indexOf('Linux') > -1) os = 'Linux';
    
    setDeviceInfo({ os, browser });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getRealTime()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    // 1. Check local storage first so the user info is immediately populated without waiting for network
    try {
      const savedName = localStorage.getItem('checkin_name') || '';
      const savedDept = localStorage.getItem('checkin_department') || '';
      const savedUid = localStorage.getItem('checkin_userId') || '';

      if (savedUid && !isNumericEmployeeId(savedUid)) {
        // String ID detected in localStorage -> wipe immediately to force re-selection
        localStorage.removeItem('checkin_userId');
        localStorage.removeItem('checkin_name');
        localStorage.removeItem('checkin_department');
        localStorage.removeItem('checkin_identity_confirmed');
        localStorage.removeItem('cached_bound_user');
        setName('');
        setDepartment('');
        setIsReturningUser(false);
        setInvalidIdMessage(`Mã nhân viên đã lưu "${savedUid}" là dạng chuỗi ký tự (như "SwhVgaPovhYgzvU5RD6f2GHWF1l1"). Hệ thống không cho phép điểm danh với mã chuỗi. Vui lòng chọn lại Khoa / Phòng và chọn đúng nhân viên có mã số.`);
        setShowInvalidIdModal(true);
      } else {
        if (savedName) setName(savedName);
        if (savedDept) setDepartment(savedDept);
        if (savedName && savedDept) setIsReturningUser(true);
      }
    } catch (e) {}

    try {
      // Safe device fingerprint (0ms from localStorage on repeat visits)
      let profile: DeviceProfile;
      try {
        profile = await getDeviceProfile();
      } catch (err) {
        profile = {
          fingerprint: 'dev_fallback_' + Date.now().toString(36),
          deviceUUID: 'uuid_fallback',
          os: 'Mobile',
          browser: 'Mobile Browser',
          deviceModel: 'Smartphone',
          screenRes: '360x640',
          gpuRenderer: 'generic'
        };
      }
      setDeviceProfile(profile);
      setDeviceInfo({
        os: profile.os,
        browser: profile.browser,
        deviceModel: profile.deviceModel,
        fingerprint: profile.fingerprint,
        screenRes: profile.screenRes
      });

      let activeUid = localStorage.getItem('checkin_userId') || '';
      let activeName = localStorage.getItem('checkin_name') || '';
      let activeDept = localStorage.getItem('checkin_department') || '';

      // Gộp toàn bộ dữ liệu khởi tạo vào 1 request duy nhất (/api/checkin/bootstrap) để giảm 7x tải kết nối giờ cao điểm
      const qFp = encodeURIComponent(profile.fingerprint || '');
      const qUidInit = encodeURIComponent(activeUid || '');
      const qNameInit = encodeURIComponent(activeName || '');
      const bootstrapRes = await apiFetch(
        `/api/checkin/bootstrap?fingerprint=${qFp}&userId=${qUidInit}&userName=${qNameInit}&_t=${Date.now()}`,
        { timeoutMs: 9000 }
      );

      let usersData: any[] = hrUsers;
      let identifyData: any = null;
      let bootstrapAttendance: any[] | null = null;

      if (bootstrapRes.ok && bootstrapRes.data) {
        const bData = bootstrapRes.data;
        if (bData.serverTime) {
          globalTimeOffset = bData.serverTime - Date.now();
        }
        if (bData.config) {
          setAppConfig(bData.config);
          try { localStorage.setItem('cached_app_config', JSON.stringify(bData.config)); } catch (e) {}
        }
        if (Array.isArray(bData.departments)) {
          setDepartmentsList(bData.departments);
          try { localStorage.setItem('cached_departments', JSON.stringify(bData.departments)); } catch (e) {}
        }
        if (Array.isArray(bData.users)) {
          usersData = bData.users;
          setHrUsers(usersData);
          try { localStorage.setItem('cached_users', JSON.stringify(usersData)); } catch (e) {}
        }
        if (Array.isArray(bData.specialEmployees)) {
          setSpecialEmployees(bData.specialEmployees);
          try { localStorage.setItem('cached_special_employees', JSON.stringify(bData.specialEmployees)); } catch (e) {}
        }
        if (Array.isArray(bData.notifications)) {
          setNotifications(bData.notifications);
        }
        if (bData.deviceIdentity) {
          identifyData = bData.deviceIdentity;
        }
        if (Array.isArray(bData.attendance)) {
          bootstrapAttendance = bData.attendance;
        }
      }

      if (identifyData) {
        if (identifyData.isBound && identifyData.boundUser) {
          const boundUid = identifyData.boundUser.uid;
          if (!isNumericEmployeeId(boundUid)) {
            // Server returned a non-numeric bound user -> auto-unbind and notify
            apiFetch('/api/user_devices/unbind', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fingerprint: profile.fingerprint })
            }).catch(() => {});
            setIsDeviceLocked(false);
            setBoundUser(null);
            localStorage.removeItem('checkin_userId');
            localStorage.removeItem('checkin_name');
            localStorage.removeItem('checkin_department');
            localStorage.removeItem('checkin_identity_confirmed');
            localStorage.removeItem('cached_bound_user');
            setIsReturningUser(false);
            setName('');
            setDepartment('');
            setInvalidIdMessage(`Thiết bị đã gắn với mã nhân viên "${boundUid}" dạng chuỗi ký tự (như "SwhVgaPovhYgzvU5RD6f2GHWF1l1"). Hệ thống không cho phép điểm danh với mã chuỗi. Vui lòng chọn lại Khoa / Phòng và chọn đúng nhân viên có mã số.`);
            setShowInvalidIdModal(true);
          } else {
            setIsDeviceLocked(true);
            setBoundUser(identifyData.boundUser);
            try { localStorage.setItem('cached_bound_user', JSON.stringify(identifyData.boundUser)); } catch (e) {}
            
            activeUid = identifyData.boundUser.uid || activeUid;
            activeName = identifyData.boundUser.name || activeName;
            activeDept = identifyData.boundUser.department || activeDept;
            if (activeName) setName(activeName);
            if (activeDept) setDepartment(activeDept);
            if (activeName) localStorage.setItem('checkin_name', activeName);
            if (activeDept) localStorage.setItem('checkin_department', activeDept);
            if (activeUid) localStorage.setItem('checkin_userId', activeUid);
            localStorage.setItem('checkin_identity_confirmed', 'true');
            if (activeName && activeDept) setIsReturningUser(true);
          }
        } else {
          setIsDeviceLocked(false);
          setBoundUser(null);
          localStorage.removeItem('checkin_identity_confirmed');
          localStorage.removeItem('cached_bound_user');
        }
      }

      // Check if the loaded activeUid is non-numeric (e.g. SwhVgaPovhYgzvU5RD6f2GHWF1l1 or hash)
      if (activeUid && !isNumericEmployeeId(activeUid)) {
        console.warn("Invalid non-numeric employee ID detected in storage/binding:", activeUid);
        setInvalidIdMessage(`Mã nhân viên hiện tại "${activeUid}" của tài khoản "${activeName || 'đang chọn'}" không đúng quy chuẩn số (mã nhân viên phải là số, ví dụ: 102, 314, 490). Vui lòng chọn lại Khoa / Phòng và chọn đúng nhân viên.`);
        setShowInvalidIdModal(true);
        localStorage.removeItem('checkin_userId');
        localStorage.removeItem('checkin_name');
        localStorage.removeItem('checkin_department');
        localStorage.removeItem('checkin_identity_confirmed');
        localStorage.removeItem('cached_bound_user');
        setIsReturningUser(false);
        setIsDeviceLocked(false);
        setBoundUser(null);
        setName('');
        setDepartment('');
        activeUid = '';
      }

      // Check if activeName matches an employee in users table whose uid is non-numeric
      if (activeName && usersData.length > 0) {
        const matched = usersData.find((u: any) => u.name?.trim()?.toLowerCase() === activeName.trim().toLowerCase());
        if (matched && !isNumericEmployeeId(matched.uid)) {
          console.warn("Matched user has non-numeric employee ID:", matched);
          setInvalidIdMessage(`Mã nhân viên "${matched.uid}" của nhân viên "${matched.name}" là dạng chuỗi ký tự (như "SwhVgaPovhYgzvU5RD6f2GHWF1l1"). Hệ thống không cho phép điểm danh với mã chuỗi này. Bạn bắt buộc phải chọn lại Khoa / Phòng và chọn đúng nhân viên có mã số.`);
          setShowInvalidIdModal(true);
          localStorage.removeItem('checkin_userId');
          localStorage.removeItem('checkin_name');
          localStorage.removeItem('checkin_department');
          localStorage.removeItem('checkin_identity_confirmed');
          localStorage.removeItem('cached_bound_user');
          setIsReturningUser(false);
          setIsDeviceLocked(false);
          setBoundUser(null);
          setName('');
          setDepartment('');
          activeUid = '';
        }
      }

      let uidToFetch = activeUid || profile.fingerprint;
      if (!activeUid && usersData.length > 0 && activeName && activeDept) {
        const matched = usersData.find((u: any) => u.name?.trim()?.toLowerCase() === activeName.trim().toLowerCase() && u.department?.trim() === activeDept.trim());
        if (matched && isNumericEmployeeId(matched.uid)) {
          uidToFetch = matched.uid;
          localStorage.setItem('checkin_userId', matched.uid);
        }
      }

      let actions: any[] = [];
      if (bootstrapAttendance && bootstrapAttendance.length > 0) {
        actions = [...bootstrapAttendance].reverse(); // oldest first
        try { localStorage.setItem('cached_history_records', JSON.stringify(bootstrapAttendance)); } catch (e) {}
      } else if (activeUid || activeName) {
        const qUid = encodeURIComponent(activeUid || uidToFetch || '');
        const qName = encodeURIComponent(activeName || '');
        const actionRes = await apiFetch(`/api/attendance?userId=${qUid}&userName=${qName}&limitStr=40&orderByStr=desc&_t=${Date.now()}`);
        if (actionRes.ok && Array.isArray(actionRes.data)) {
          actions = [...actionRes.data].reverse();
          try { localStorage.setItem('cached_history_records', JSON.stringify(actionRes.data)); } catch (e) {}
        } else {
          const cached = localStorage.getItem('cached_history_records');
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed)) actions = [...parsed].reverse();
            } catch (e) {}
          }
        }
      } else {
        const cached = localStorage.getItem('cached_history_records');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) actions = [...parsed].reverse();
          } catch (e) {}
        }
      }

      // Hợp nhất các bản ghi đang chờ đồng bộ từ hàng đợi ngoại tuyến vào danh sách hiển thị
      const pendingQueue = getOfflineQueue();
      const offlineItems = pendingQueue.map(q => ({
        id: q.id,
        user_id: q.userId,
        user_name: q.userName,
        department: q.department,
        type: q.type,
        timestamp: q.timestamp,
        status: 'pending_sync',
        reason: 'Lưu tạm ngoại tuyến (Chờ mạng đồng bộ)',
        location: q.location,
        isOfflinePending: true
      }));

      // Lọc bỏ trùng lặp nếu bản ghi đã có trên server
      const combined = [...actions, ...offlineItems.filter(off => !actions.some(a => a.id === off.id))];
      setHistoryRecords(combined);

      if (combined && combined.length > 0) {
        const now = getRealTime();
        const todayActions = combined.filter((a: any) => {
          if ((a.status !== 'success' && a.status !== 'pending_sync') || !a.timestamp) return false;
          const ts = Number(a.timestamp) || (typeof a.timestamp === 'string' && !isNaN(Date.parse(a.timestamp)) ? Date.parse(a.timestamp) : 0);
          if (!ts) return false;
          const d = new Date(ts);
          return d.getFullYear() === now.getFullYear() &&
                 d.getMonth() === now.getMonth() &&
                 d.getDate() === now.getDate();
        });
        if (todayActions.length > 0) {
          setLastActionToday(todayActions[todayActions.length - 1].type);
        } else {
          setLastActionToday(null);
        }
      }
    } catch (e) {
      console.error("loadData error:", e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // 1. Check URL parameters for reminder auto-open on load
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('action') === 'checkin' || urlParams.get('reminder') === 'true') {
        const typeParam = urlParams.get('type') === 'out' ? 'out' : 'in';
        triggerReminderCheckInFlow({
          title: '⏰ Đã mở từ thông báo nhắc nhở điểm danh',
          type: typeParam
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (e) {}

    // 2. Custom event listener from local notifications or in-app widgets
    const handleCustomReminder = (e: any) => {
      const detail = e.detail || {};
      triggerReminderCheckInFlow({
        title: detail.title || '⏰ Nhắc nhở điểm danh chấm công',
        type: detail.type || (lastActionToday === 'in' ? 'out' : 'in')
      });
    };
    window.addEventListener('open-checkin-action', handleCustomReminder);

    // 3. Service Worker postMessage listener (when notification clicked in background)
    const handleSwMessage = (e: MessageEvent) => {
      if (e.data?.action === 'TRIGGER_CHECKIN_PROMPT') {
        triggerReminderCheckInFlow({
          title: '⏰ Thông báo nhắc nhở điểm danh',
          type: e.data?.type || (lastActionToday === 'in' ? 'out' : 'in')
        });
      }
    };
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    return () => {
      window.removeEventListener('open-checkin-action', handleCustomReminder);
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, [appConfig, lastActionToday]);

  const checkSpecialActive = (emp: any) => {
        if (!emp) return false;
        if (emp.period_type === 'always' || !emp.period_type) return true;
        
        const nowD = getRealTime();
        nowD.setHours(0, 0, 0, 0);
        
        if (emp.period_type === 'daily' && emp.valid_from) {
            const validFrom = new Date(emp.valid_from);
            validFrom.setHours(0, 0, 0, 0);
            return validFrom.getTime() === nowD.getTime();
        }
        if ((emp.period_type === 'weekly' || emp.period_type === 'monthly') && emp.valid_from && emp.valid_until) {
            const validFrom = new Date(emp.valid_from);
            validFrom.setHours(0, 0, 0, 0);
            const validUntil = new Date(emp.valid_until);
            validUntil.setHours(23, 59, 59, 999);
            return nowD >= validFrom && nowD <= validUntil;
        }
        return true;
      };

  const lastClickTimeRef = useRef<number>(0);

  const handleCheckIn = async (type: 'in' | 'out', forceRebind: boolean = false, confirmedQuickOut: boolean = false) => {
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmittingCheckIn(true);
    setPendingCheckInType(type);

    try {
      unlockAudio();
      const now = Date.now();
      if (now - lastClickTimeRef.current < 1500) {
        return;
      }
      lastClickTimeRef.current = now;

      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const allowDesktop = appConfig?.allowDesktopCheckIn !== false;
      if (!isMobile && !allowDesktop) {
        setStatus('failed');
        setMessage("Hệ thống chỉ cho phép điểm danh trên thiết bị di động. Vui lòng sử dụng điện thoại để điểm danh.");
        return;
      }

      const currentName = (name || safeGetStorage('checkin_name')).trim();
      const currentDept = (department || safeGetStorage('checkin_department')).trim();

      if (!currentName || !currentDept) {
        setStatus('failed');
        setMessage("Vui lòng nhập Tên và chọn Khoa / Phòng");
        return;
      }

      let userList = hrUsers;
      if (!userList || userList.length === 0) {
        try {
          const usersRes = await apiFetch(`/api/users?_t=${Date.now()}`);
          if (usersRes.ok && usersRes.data) {
            userList = usersRes.data;
            setHrUsers(userList);
          }
        } catch (e) {}
      }

      let matchedUser = userList.find((u: any) => u.name?.trim()?.toLowerCase() === currentName.toLowerCase() && u.department?.trim() === currentDept);
      if (!matchedUser) {
        matchedUser = userList.find((u: any) => u.name?.trim()?.toLowerCase() === currentName.toLowerCase());
      }

      if (!matchedUser) {
        setStatus('failed');
        setMessage("Họ tên hoặc Khoa/Phòng chưa đúng với danh sách Nhân sự. Vui lòng kiểm tra lại (Lưu ý: Bạn phải được thêm vào phần Quản lý Nhân sự trước khi điểm danh)!");
        return;
      }

      if (matchedUser.is_hidden || matchedUser.status === 'inactive' || matchedUser.status === 'locked') {
        setStatus('failed');
        setMessage("Tài khoản của bạn bị khóa do chưa khai báo phòng tổ chức hành chính. Hãy khai báo để điểm danh.");
        triggerAttendanceAudio('error');
        return;
      }

      const finalName = (matchedUser.name || currentName).trim();
      const finalDept = (matchedUser.department || currentDept).trim();
      const finalUid = matchedUser.uid || localStorage.getItem('checkin_userId') || '';

      if (!finalUid || !isNumericEmployeeId(finalUid)) {
        setStatus('failed');
        const errTxt = `Mã nhân viên "${finalUid || 'chưa có'}" là dạng chuỗi ký tự (như "SwhVgaPovhYgzvU5RD6f2GHWF1l1"). Hệ thống không cho phép điểm danh với mã chuỗi. Bắt buộc mã nhân viên phải là số (ví dụ: 102, 314, 490).`;
        setMessage(errTxt);
        setInvalidIdMessage(`Mã nhân viên "${finalUid || 'chưa có'}" của tài khoản "${finalName}" là dạng chuỗi không hợp lệ. Bạn bắt buộc phải chọn lại Khoa / Phòng và chọn đúng nhân viên có mã số.`);
        setShowInvalidIdModal(true);
        triggerAttendanceAudio('error');
        return;
      }

      setName(finalName);
      setDepartment(finalDept);
      localStorage.setItem('checkin_name', finalName);
      localStorage.setItem('checkin_department', finalDept);
      if (finalUid) {
        localStorage.setItem('checkin_userId', finalUid);
      }

      setStatus('checking');
      setMessage('Đang lấy vị trí & xác thực thiết bị...');

      const locationPromise = getAccurateLocation();
      const currentProfile = deviceProfile || await getDeviceProfile();
      
      setIsReturningUser(true);

      const location = await locationPromise;
      
      if (!location) {
        throw new Error('Không thể lấy vị trí. Vui lòng kiểm tra quyền truy cập vị trí của trình duyệt.');
      }

      const locDetails: { lat: number; lng: number; accuracy?: number; distance?: number } = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy,
      };
      
      setLocationDetails(locDetails);

      const scanClientTimestamp = Date.now() + globalTimeOffset;

      const recordData = {
        userId: finalUid || currentProfile.fingerprint,
        userName: finalName,
        department: finalDept,
        type,
        timestamp: scanClientTimestamp,
        location: locDetails,
        deviceFingerprint: currentProfile.fingerprint,
        forceRebind,
        confirmedQuickOut,
        deviceInfo: {
          os: currentProfile.os,
          browser: currentProfile.browser,
          deviceModel: currentProfile.deviceModel,
          fingerprint: currentProfile.fingerprint,
          screenRes: currentProfile.screenRes,
          deviceId: currentProfile.fingerprint
        }
      };

      // Cơ chế tự động thử lại ngầm 3 lần (Exponential Backoff + Jitter) khi mạng chập chờn hoặc máy chủ quá tải tạm thời,
      // sau đó tự động chuyển vào Hàng đợi đồng bộ ngoại tuyến an toàn (offlineQueue)
      let res: any = null;
      let shouldQueueOffline = !navigator.onLine;
      const MAX_ATTEMPTS = 3;

      if (!shouldQueueOffline) {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            res = await apiFetch('/api/attendance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(recordData),
              timeoutMs: 8500
            });

            if (res && res.ok && res.data?.id) {
              shouldQueueOffline = false;
              break;
            }

            // Các lỗi nghiệp vụ hợp lệ (ngoài vùng GPS, sai thiết bị, cảnh báo ra sớm <5p...) -> Không thử lại
            const status = res?.status || 0;
            const isTransientOverload = status === 0 || status === 408 || status === 429 || status >= 500;
            if (!isTransientOverload) {
              shouldQueueOffline = false;
              break;
            }

            // Nếu là lỗi quá tải tạm thời / timeout -> thử lại tối đa 3 lần với Exponential Backoff + Jitter
            if (attempt < MAX_ATTEMPTS) {
              const backoffMs = 400 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
              await new Promise(r => setTimeout(r, backoffMs));
            } else {
              shouldQueueOffline = true;
            }
          } catch (err) {
            if (attempt < MAX_ATTEMPTS) {
              const backoffMs = 400 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
              await new Promise(r => setTimeout(r, backoffMs));
            } else {
              shouldQueueOffline = true;
            }
          }
        }
      }

      // LƯU HÀNG ĐỢI ĐỒNG BỘ AN TOÀN KHI MẤT MẠNG HOẶC MÁY CHỦ QUÁ TẢI TẠM THỜI SAU 3 LẦN THỬ
      if (shouldQueueOffline) {
        const targetLat = appConfig?.targetLat || 19.866034;
        const targetLng = appConfig?.targetLng || 105.656531;
        const radius = appConfig?.radius || 600;
        const locCheck = checkLocationValid(locDetails.lat, locDetails.lng, radius, targetLat, targetLng);
        locDetails.distance = locCheck.distance;
        setLocationDetails({ ...locDetails, distance: locCheck.distance });

        if (!locCheck.valid) {
          setStatus('failed');
          setMessage(`Vị trí ngoài phạm vi cho phép (${locCheck.distance}m / ${radius}m). Vui lòng di chuyển vào khuôn viên đơn vị để điểm danh.`);
          triggerAttendanceAudio('error');
          return;
        }

        const offlineRecord = saveToOfflineQueue({
          userId: finalUid || currentProfile.fingerprint,
          userName: finalName,
          department: finalDept,
          type,
          timestamp: scanClientTimestamp,
          location: locDetails,
          deviceFingerprint: currentProfile.fingerprint,
          deviceInfo: {
            os: currentProfile.os,
            browser: currentProfile.browser,
            deviceModel: currentProfile.deviceModel,
            fingerprint: currentProfile.fingerprint,
            screenRes: currentProfile.screenRes,
            deviceId: currentProfile.fingerprint
          },
          forceRebind
        });

        setRebindPossible(false);
        localStorage.setItem('checkin_identity_confirmed', 'true');
        setIsDeviceLocked(true);
        setStatus('success');
        setLastActionToday(type);

        const actionText = type === 'in' ? 'vào' : 'ra';
        const scanTimeStr = format(new Date(scanClientTimestamp), 'HH:mm:ss');
        const offlineSuccessMsg = `Chào bạn ${finalName}, bạn đã chấm công ${actionText} thành công (Đã lưu hàng đợi đồng bộ an toàn lúc ${scanTimeStr}).`;
        setMessage(offlineSuccessMsg);

        triggerAttendanceAudio(type, { userName: finalName, isLate: false, isEarly: false });

        const newOfflineUiItem = {
          id: offlineRecord.id,
          user_id: offlineRecord.userId,
          user_name: offlineRecord.userName,
          department: offlineRecord.department,
          type: offlineRecord.type,
          timestamp: offlineRecord.timestamp,
          status: 'pending_sync',
          reason: 'Lưu hàng đợi đồng bộ an toàn (Tự động gửi lên máy chủ)',
          location: offlineRecord.location,
          isOfflinePending: true
        };
        setHistoryRecords(prev => [...prev.filter(r => r.id !== newOfflineUiItem.id), newOfflineUiItem]);
        return;
      }
      
      const result = res?.data || {};

      if (!res?.ok) {
        if (result.status === 'invalid_employee_id' || result.requireReselect) {
          setStatus('failed');
          setMessage(result.error || "Mã nhân viên dạng chuỗi không hợp lệ.");
          setInvalidIdMessage(result.error || "Mã nhân viên là dạng chuỗi không hợp lệ. Vui lòng chọn lại thông tin Khoa / Phòng và nhân viên có mã số.");
          setShowInvalidIdModal(true);
          triggerAttendanceAudio('error');
          return;
        }
        if (result.status === 'out_of_range') {
            setLocationDetails({ ...locDetails, distance: result.distance });
            if (locDetails.accuracy && locDetails.accuracy > 100) {
               result.error = (result.error || '') + ' (LƯU Ý: Sai số GPS thiết bị của bạn đang rất cao: ' + Math.round(locDetails.accuracy) + 'm. Hãy bật Wi-Fi, 4G, hoặc ra ngoài trời để bắt GPS chính xác hơn)';
            }
        }
        const isDeviceIssue = result.canRebind === true || result.status === 'device_mismatch' || result.status === 'device_unauthorized' || res.status === 403;
        setRebindPossible(isDeviceIssue);
        setStatus('failed');
        setMessage(res.error || result.error || result.message || "Lỗi khi lưu dữ liệu điểm danh");
        triggerAttendanceAudio('error');
        return;
      }
      
      setRebindPossible(false);
      localStorage.setItem('checkin_identity_confirmed', 'true');
      setIsDeviceLocked(true);
      if (result.distance !== undefined) {
         setLocationDetails({ ...locDetails, distance: result.distance });
      }
      setStatus('success');
      setLastActionToday(type);
      const defaultSuccessMsg = type === 'in'
        ? `Chào bạn ${finalName}, bạn đã chấm công vào thành công.`
        : `Chào bạn ${finalName}, bạn đã chấm công ra thành công.`;
      const msg = result.message || defaultSuccessMsg;
      setMessage(msg);
      
      const isLate = msg.toLowerCase().includes('muộn') || result.isLate;
      const isEarly = msg.toLowerCase().includes('sớm') || result.isEarly;
      triggerAttendanceAudio(type, { userName: finalName, isLate, isEarly });
      
      // Cập nhật trực tiếp bản ghi mới vào state và bộ nhớ đệm thay vì gọi lại loadData() 7 API
      const recordedRow = result.record || {
        id: result.id || ('att_' + Date.now()),
        user_id: finalUid || currentProfile.fingerprint,
        user_name: finalName,
        department: finalDept,
        type,
        timestamp: result.timestamp || scanClientTimestamp,
        status: 'success',
        reason: result.reason || '',
        location: { ...locDetails, distance: result.distance }
      };

      setHistoryRecords(prev => {
        const exists = prev.some(r => r.id === recordedRow.id);
        const updated = exists ? prev : [...prev, recordedRow];
        try {
          const serverItemsDesc = [...updated]
            .filter(r => !r.isOfflinePending)
            .reverse()
            .slice(0, 40);
          localStorage.setItem('cached_history_records', JSON.stringify(serverItemsDesc));
        } catch (e) {}
        return updated;
      });
      
    } catch (e: any) {
      console.warn("Lỗi điểm danh:", e);
      setStatus('failed');
      triggerAttendanceAudio('error');
      if (e.message?.includes('User denied Geolocation') || e.message?.includes('Quyền truy cập vị trí bị từ chối')) {
        setShowLocationHelp(true);
        setMessage('Lỗi: Bạn đã từ chối quyền truy cập vị trí. Để điểm danh, bạn phải cho phép trình duyệt truy cập vị trí hiện tại.');
      } else {
        setMessage(e.message || 'Có lỗi xảy ra, vui lòng thử lại.');
      }
    } finally {
      setTimeout(() => {
        isSubmittingRef.current = false;
        setIsSubmittingCheckIn(false);
      }, 1500);
      lastActionCompletedTimeRef.current = Date.now();
    }
  };

  const getShiftTimeInfo = () => {
    let firstIn: any = null;
    let lastOut: any = null;
    const now = getRealTime();
    const today = historyRecords.filter(r => {
      if (r.status !== 'success' || !r.timestamp) return false;
      const ts = Number(r.timestamp) || (typeof r.timestamp === 'string' && !isNaN(Date.parse(r.timestamp)) ? Date.parse(r.timestamp) : 0);
      if (!ts) return false;
      const d = new Date(ts);
      return d.getFullYear() === now.getFullYear() &&
             d.getMonth() === now.getMonth() &&
             d.getDate() === now.getDate();
    });
    
    if (today.length > 0) {
      firstIn = today.find(r => r.type === 'in');
      lastOut = today.slice().reverse().find(r => r.type === 'out');
    }
    
    let workingMinutes = 0;
    if (firstIn) {
      const start = new Date(Number(firstIn.timestamp) || firstIn.timestamp);
      const end = lastOut ? new Date(Number(lastOut.timestamp) || lastOut.timestamp) : getRealTime();
      workingMinutes = differenceInMinutes(end, start);
    }
    
    const hours = Math.floor(workingMinutes / 60);
    const mins = workingMinutes % 60;
    
    return {
      firstInTime: firstIn ? format(new Date(Number(firstIn.timestamp) || firstIn.timestamp), 'HH:mm') : '--:--',
      lastOutTime: lastOut ? format(new Date(Number(lastOut.timestamp) || lastOut.timestamp), 'HH:mm') : '--:--',
      workingStr: firstIn ? `${hours < 10 ? '0'+hours : hours}h ${mins < 10 ? '0'+mins : mins}m` : '--h --m'
    };
  };

  const shiftInfo = getShiftTimeInfo();
  
  let morningStartStr = appConfig?.morningStart || '07:30';
  let morningEndStr = appConfig?.morningEnd || '11:20';
  let afternoonStartStr = appConfig?.afternoonStart || '13:30';
  let afternoonEndStr = appConfig?.afternoonEnd || '16:50';

  const specialEmpRaw = specialEmployees.find(e => e.user_name?.toLowerCase() === name?.trim()?.toLowerCase() && e.department === department);
  const isSpecial = checkSpecialActive(specialEmpRaw);
  const specialEmp = isSpecial ? specialEmpRaw : null;
  const isNuoiConNho = isSpecial && specialEmp?.employee_type?.toLowerCase()?.includes('nuôi con nhỏ');

  if (isSpecial) {
      if (specialEmp.custom_start_time && !isNuoiConNho) {
          const [cH] = specialEmp.custom_start_time.split(':').map(Number);
          if (cH <= 12) morningStartStr = specialEmp.custom_start_time;
          else if (cH > 12 && cH <= 18) afternoonStartStr = specialEmp.custom_start_time;
      }
      if (specialEmp.custom_end_time && !isNuoiConNho) {
          const [cH] = specialEmp.custom_end_time.split(':').map(Number);
          if (cH <= 13) morningEndStr = specialEmp.custom_end_time;
          else if (cH > 13 && cH <= 19) afternoonEndStr = specialEmp.custom_end_time;
      }
      if (isNuoiConNho && specialEmp.early_minutes) {
          const mEndD = new Date();
          const [mEH, mEM] = morningEndStr.split(':').map(Number);
          mEndD.setHours(mEH, mEM, 0, 0);
          mEndD.setMinutes(mEndD.getMinutes() - specialEmp.early_minutes);
          morningEndStr = format(mEndD, 'HH:mm');
          
          const aEndD = new Date();
          const [aEH, aEM] = afternoonEndStr.split(':').map(Number);
          aEndD.setHours(aEH, aEM, 0, 0);
          aEndD.setMinutes(aEndD.getMinutes() - specialEmp.early_minutes);
          afternoonEndStr = format(aEndD, 'HH:mm');
      }
  }

  const shiftStartStr = morningStartStr;
  const shiftEndStr = afternoonEndStr;

  const nowTime = getRealTime();
  const todaySuccess = historyRecords.filter(r => {
    if (r.status !== 'success' || !r.timestamp) return false;
    const ts = Number(r.timestamp) || (typeof r.timestamp === 'string' && !isNaN(Date.parse(r.timestamp)) ? Date.parse(r.timestamp) : 0);
    if (!ts) return false;
    const d = new Date(ts);
    return d.getFullYear() === nowTime.getFullYear() &&
           d.getMonth() === nowTime.getMonth() &&
           d.getDate() === nowTime.getDate();
  });

  const getRecordShift = (r: any) => {
    if (r.shift_id === 'morning' || r.shiftId === 'morning' || r.shift === 'Sáng' || r.applied_schedule?.shiftId === 'morning' || r.appliedSchedule?.shiftId === 'morning') return 'morning';
    if (r.shift_id === 'afternoon' || r.shiftId === 'afternoon' || r.shift === 'Chiều' || r.applied_schedule?.shiftId === 'afternoon' || r.appliedSchedule?.shiftId === 'afternoon') return 'afternoon';
    if (r.shift_id === 'evening' || r.shiftId === 'evening' || r.shift === 'Tối' || r.shiftId?.startsWith('duty_') || r.shift_id?.startsWith('duty_') || r.shiftId === 'night_custom' || r.shift_id === 'night_custom') return 'evening';
    
    const d = new Date(Number(r.timestamp) || r.timestamp);
    const mins = d.getHours() * 60 + d.getMinutes();
    if (r.type === 'out') {
      // Quy tắc mới: Bấm ra ca trước 15h00 thì là ra ca buổi trưa, sau 15h00 là ra ca chiều
      return mins < 15 * 60 ? 'morning' : (mins < 18 * 60 + 30 ? 'afternoon' : 'evening');
    } else {
      if (r.shift_id === 'morning' || r.shiftId === 'morning' || r.shift === 'Sáng' || r.applied_schedule?.shiftId === 'morning' || r.appliedSchedule?.shiftId === 'morning') return 'morning';
      if (r.shift_id === 'afternoon' || r.shiftId === 'afternoon' || r.shift === 'Chiều' || r.applied_schedule?.shiftId === 'afternoon' || r.appliedSchedule?.shiftId === 'afternoon') return 'afternoon';
      if (r.shift_id === 'evening' || r.shiftId === 'evening' || r.shift === 'Tối' || r.shiftId?.startsWith('duty_') || r.shift_id?.startsWith('duty_') || r.shiftId === 'night_custom' || r.shift_id === 'night_custom') return 'evening';
      return mins < 12 * 60 + 30 ? 'morning' : (mins < 18 * 60 ? 'afternoon' : 'evening');
    }
  };

  const morningInRecord = todaySuccess.find(r => r.type === 'in' && getRecordShift(r) === 'morning');
  // Ra ca buổi trưa: Bấm ra ca trước 15h00
  const morningOutRecord = todaySuccess.slice().reverse().find(r => {
    if (r.type !== 'out') return false;
    const d = new Date(Number(r.timestamp) || r.timestamp);
    const mins = d.getHours() * 60 + d.getMinutes();
    return mins < 15 * 60;
  });
  const afternoonInRecord = todaySuccess.find(r => r.type === 'in' && getRecordShift(r) === 'afternoon');
  // Ra ca chiều: Bấm ra ca sau 15h00
  const afternoonOutRecord = todaySuccess.slice().reverse().find(r => {
    if (r.type !== 'out') return false;
    const d = new Date(Number(r.timestamp) || r.timestamp);
    const mins = d.getHours() * 60 + d.getMinutes();
    return mins >= 15 * 60;
  });

  const hasMorningIn = !!morningInRecord;
  const hasMorningOut = !!morningOutRecord;
  const hasAfternoonIn = !!afternoonInRecord;
  const hasAfternoonOut = !!afternoonOutRecord;
  
  const displayMorningIn = morningInRecord ? format(new Date(Number(morningInRecord.timestamp) || morningInRecord.timestamp), 'HH:mm') : '--:--';
  const displayMorningOut = morningOutRecord ? format(new Date(Number(morningOutRecord.timestamp) || morningOutRecord.timestamp), 'HH:mm') : '--:--';
  const displayAfternoonIn = afternoonInRecord ? format(new Date(Number(afternoonInRecord.timestamp) || afternoonInRecord.timestamp), 'HH:mm') : '--:--';
  const displayAfternoonOut = afternoonOutRecord ? format(new Date(Number(afternoonOutRecord.timestamp) || afternoonOutRecord.timestamp), 'HH:mm') : '--:--';

  // CALCULATE SHIFT PROGRESS (CONTINUOUS TIMELINE)
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

  const totalShiftMins = Math.max(1, aE - mS); // Prevent div by 0
  
  // Percentages for nodes (0 to 100) theo lịch ca
  const p_mS = 0;
  const p_mE = Math.max(0, Math.min(100, ((mE - mS) / totalShiftMins) * 100));
  const p_aS = Math.max(0, Math.min(100, ((aS - mS) / totalShiftMins) * 100));
  const p_aE = 100;

  // Tính phần trăm thực tế dựa trên giờ bấm thẻ thật
  const getRecordPercent = (record: any, defaultP: number) => {
    if (!record || !record.timestamp) return defaultP;
    const d = new Date(Number(record.timestamp) || record.timestamp);
    const mins = d.getHours() * 60 + d.getMinutes();
    return Math.max(0, Math.min(100, ((mins - mS) / totalShiftMins) * 100));
  };

  const p_actualMorningIn = hasMorningIn ? getRecordPercent(morningInRecord, p_mS) : p_mS;
  const p_actualMorningOut = hasMorningOut ? getRecordPercent(morningOutRecord, p_mE) : p_mE;
  const p_actualAfternoonIn = hasAfternoonIn ? getRecordPercent(afternoonInRecord, p_aS) : p_aS;
  const p_actualAfternoonOut = hasAfternoonOut ? getRecordPercent(afternoonOutRecord, p_aE) : p_aE;

  // Progress calculation:
  // - Nếu đã bấm ra ca sau 15h00: chạm 100% (17h00)
  // - Nếu đã bấm ra ca trước 15h00 (ra ca buổi trưa) và chưa vào ca chiều: dừng tại điểm 11h30 (p_mE)
  // - Nếu đang trong ca: chạy theo thời gian thực
  let currentProgress = 0;
  if (hasAfternoonOut) {
    currentProgress = 100;
  } else if (hasMorningOut && !hasAfternoonIn) {
    currentProgress = p_mE;
  } else if (currentMins >= aE) {
    currentProgress = 100;
  } else if (currentMins > mS) {
    currentProgress = Math.min(100, Math.max(0, ((currentMins - mS) / totalShiftMins) * 100));
  }

  // Cho phép đổi nhân viên chỉ khi thiết bị ĐƯỢC MỞ KHÓA bởi Quản trị viên
  const isUnbindAllowed = !isDeviceLocked;

  if (!isMobileDevice && !isBriefingUrl) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 font-sans">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl border border-slate-200 relative overflow-hidden">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-red-100">
             <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2 tracking-tight">Không Hỗ Trợ Điểm Danh Trên Máy Tính</h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            Hệ thống <b>không cho phép truy cập điểm danh trên máy tính</b>. Cán bộ nhân viên vui lòng sử dụng <b>điện thoại cá nhân</b> để quét mã QR điểm danh.
            <br /><br />
            Trên máy tính chỉ dành cho <b>Quản trị viên</b> và <b>người có tài khoản</b> đăng nhập để xem <b>Dashboard Quản trị</b>.
          </p>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Đăng nhập xem Dashboard Quản trị</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#f0f4f9] min-h-screen flex flex-col font-sans text-slate-900 pb-20">
      {/* CẢNH BÁO QUÉT MÃ BẰNG TRÌNH DUYỆT ZALO (Ẩn khi ở tab Giao ban vì Giao ban không cần GPS) */}
      {isZaloBrowser && activeTab !== 'briefing' && (
        <div className="bg-amber-500 text-slate-900 px-4 py-3 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 shadow-md z-30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-slate-900 shrink-0" />
            <span>
              <b>Cảnh báo:</b> Bạn đang quét mã trên Zalo. Vui lòng mở liên kết bằng <b>Trình duyệt Chrome / Safari</b> để GPS và định danh hoạt động chuẩn xác.
            </span>
          </div>
          <button 
            type="button" 
            onClick={() => setShowZaloModal(true)}
            className="px-3 py-1 bg-slate-900 text-white rounded-lg font-bold text-xs shrink-0 hover:bg-slate-800 transition-colors"
          >
            Hướng dẫn
          </button>
        </div>
      )}

      {/* HEADER BỆNH VIỆN ĐA KHOA THIỆU HÓA */}
      <div className="bg-[#1e40af] text-white rounded-b-[22px] pt-3.5 pb-6 px-3.5 sm:px-5 relative shrink-0 z-10 shadow-sm">
        <div className="flex justify-between items-center relative z-10 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-white rounded-full flex items-center justify-center p-0.5 shrink-0 overflow-hidden shadow-xs ring-2 ring-white/20">
              <img src={appConfig?.logoBase64 || "/logo.svg"} alt="Logo Bệnh viện Đa khoa Thiệu Hóa" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col min-w-0">
              <h1 className="font-black text-[13.5px] sm:text-[15.5px] leading-tight tracking-normal whitespace-nowrap truncate">HỆ THỐNG ĐIỂM DANH</h1>
              <p className="text-[10.5px] sm:text-[11.5px] font-medium text-blue-100 uppercase tracking-wider whitespace-nowrap truncate mt-0.5">BVĐK THIỆU HÓA</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleSound}
              title={soundEnabled ? "Đang bật âm thanh (Bấm để tắt)" : "Đang tắt âm thanh (Bấm để bật)"}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                soundEnabled 
                  ? 'bg-white/20 hover:bg-white/30 text-white shadow-xs' 
                  : 'bg-white/10 hover:bg-white/20 text-white/50'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </button>
            <div className="relative cursor-pointer z-50 pointer-events-auto p-1 rounded-full hover:bg-white/10 transition-colors" onClick={(e) => { e.stopPropagation(); setShowNotifications(true); }}>
              <Bell className="w-5 h-5 text-white" />
              {notifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold w-3.5 h-3.5 flex items-center justify-center rounded-full border border-[#1e40af]">{notifications.length}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem('explicit_logout');
                navigate('/admin');
              }}
              title="Mở trang Quản trị Dashboard"
              className="h-8 px-2.5 sm:px-3 rounded-full border border-amber-300/70 bg-amber-400/25 hover:bg-amber-400/35 text-amber-100 hover:text-white flex items-center gap-1.5 text-xs font-bold transition-all shadow-xs"
            >
              <ShieldCheck className="w-4 h-4 text-amber-300 shrink-0" />
              <span>Quản trị Dashboard</span>
            </button>
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-4 -mt-3.5 relative z-30 flex-1 flex flex-col gap-2.5">
        {/* THÔNG BÁO KẾT QUẢ ĐỒNG BỘ NGOẠI TUYẾN */}
        {syncToastMessage && (
          <div className="bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-lg flex items-center justify-between text-xs sm:text-sm font-semibold animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 shrink-0 text-emerald-200" />
              <span>{syncToastMessage}</span>
            </div>
            <button 
              type="button" 
              onClick={() => setSyncToastMessage(null)} 
              className="text-white/80 hover:text-white text-xs px-2 py-0.5 rounded-lg bg-emerald-700/50"
            >
              Đóng
            </button>
          </div>
        )}

        {/* CẢNH BÁO KHI MẤT KẾT NỐI INTERNET */}
        {!isOnline && (
          <div className="bg-amber-500/15 border border-amber-400 text-amber-900 px-4 py-2.5 rounded-2xl flex items-center justify-between gap-2 text-xs sm:text-sm font-medium shadow-sm">
            <div className="flex items-center gap-2.5">
              <WifiOff className="w-5 h-5 text-amber-700 shrink-0" />
              <div>
                <p className="font-bold text-amber-950 text-xs sm:text-sm">Chế độ Ngoại tuyến (Mất mạng Internet)</p>
                <p className="text-[11px] sm:text-xs text-amber-800">
                  Bạn vẫn có thể điểm danh bình thường! Dữ liệu sẽ lưu tạm an toàn trên máy và tự động đồng bộ khi có mạng lại.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* KHỐI TRẠNG THÁI HÀNG ĐỢI ĐIỂM DANH NGOẠI TUYẾN ĐANG CHỜ ĐỒNG BỘ */}
        {offlineQueue.length > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 font-extrabold text-xs shadow-sm">
                {offlineQueue.length}
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-blue-950 truncate">
                  Có {offlineQueue.length} lượt điểm danh ngoại tuyến chờ đồng bộ
                </p>
                <p className="text-[11px] text-blue-700">
                  {isOnline ? 'Đã có kết nối Internet. Sẵn sàng gửi dữ liệu lên máy chủ.' : 'Hệ thống sẽ tự động đồng bộ ngay khi phát hiện có mạng.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 mt-1 sm:mt-0">
              <button
                type="button"
                onClick={() => setShowOfflineModal(true)}
                className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl border border-blue-300 text-blue-800 bg-white hover:bg-blue-50 font-semibold text-xs transition-colors shadow-sm"
              >
                Xem chi tiết
              </button>
              <button
                type="button"
                disabled={isSyncingOffline || !isOnline}
                onClick={handleManualSync}
                className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                  isOnline
                    ? 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingOffline ? 'animate-spin' : ''}`} />
                <span>{isSyncingOffline ? 'Đang gửi...' : 'Đồng bộ ngay'}</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'home' && (
          <>
            {/* KHỐI THỜI GIAN */}
            <div className="bg-white rounded-xl px-3 py-2 shadow-xs flex items-center justify-between border border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 shrink-0">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold text-slate-600">Thứ {currentTime.getDay() === 0 ? 'Chủ nhật' : currentTime.getDay() + 1},</span>
                  <span className="text-xs font-bold text-blue-700">{format(currentTime, 'dd/MM/yyyy')}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-blue-50/80 px-2.5 py-1 rounded-lg border border-blue-100/60">
                <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="text-sm font-extrabold text-slate-800 font-mono tracking-tight">{format(currentTime, 'HH:mm:ss')}</span>
              </div>
            </div>

            {status === 'idle' ? (
              <>
                {!isReturningUser ? (
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldCheck className="w-5 h-5 text-blue-600" />
                      <h2 className="text-lg font-bold text-slate-800">
                        {isDeviceLocked ? 'Thiết bị đã khóa chính chủ' : 'Xác thực thông tin nhân viên'}
                      </h2>
                    </div>

                    {isDeviceLocked && boundUser ? (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl mb-4 space-y-2">
                        <div className="flex items-center gap-2 text-blue-800 font-bold text-sm">
                          <Lock className="w-4 h-4 text-blue-600" />
                          <span>Điện thoại này đã liên kết với:</span>
                        </div>
                        <p className="text-base font-extrabold text-blue-900">{boundUser.name}</p>
                        <p className="text-xs text-blue-700 font-medium">Khoa / Phòng: {boundUser.department}</p>
                        <p className="text-[11px] text-slate-500 italic mt-1">
                          * Hệ thống chống điểm danh hộ đã kích hoạt. Bạn không thể đổi sang nhân viên khác trên thiết bị này.
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4 text-xs text-amber-800 flex items-start gap-2">
                        <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          <b>Chống điểm danh hộ:</b> Thiết bị này sẽ được liên kết cố định với thông tin bạn chọn sau lần điểm danh đầu tiên.
                        </span>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-1.5 ml-1">
                          <label className="block text-sm font-bold text-slate-700">Khoa / Phòng</label>
                          {isDeviceLocked && (
                            <button
                              type="button"
                              onClick={() => setShowDeviceLockedInfoModal(true)}
                              className="text-xs text-red-600 hover:text-red-800 font-bold flex items-center gap-1 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-md border border-red-200 transition-colors cursor-pointer"
                              title="Thiết bị đã khóa. Bấm để xem thông tin bảo mật."
                            >
                              <Lock className="w-3 h-3 text-red-600" />
                              <span>Đã khóa cố định</span>
                            </button>
                          )}
                        </div>
                        <div 
                          className="relative"
                          onClick={() => {
                            if (isDeviceLocked) {
                              setShowDeviceLockedInfoModal(true);
                            }
                          }}
                        >
                          <select 
                            value={department} 
                            disabled={isDeviceLocked}
                            onChange={e => {
                              setDepartment(e.target.value);
                              setName(''); // Reset name when department changes
                            }} 
                            className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium disabled:opacity-80 disabled:bg-slate-100 disabled:cursor-pointer"
                          >
                            <option value="">-- Chọn Khoa / Phòng ({departmentsList.length}) --</option>
                            {departmentsList.map(dep => (
                              <option key={dep.id} value={dep.name}>{dep.name}</option>
                            ))}
                          </select>
                          {isDeviceLocked && (
                            <div 
                              className="absolute inset-0 cursor-pointer flex items-center justify-end pr-10"
                              title="Thiết bị đã khóa chính chủ. Chỉ Admin mới có quyền mở khóa."
                            >
                              <Lock className="w-4 h-4 text-red-600" />
                            </div>
                          )}
                        </div>
                        {isDeviceLocked && (
                          <p className="text-[11px] text-red-700 mt-1.5 flex items-center gap-1.5 bg-red-50/80 p-2 rounded-lg border border-red-200/70">
                            <Lock className="w-3.5 h-3.5 shrink-0 text-red-600" />
                            <span>Máy đã khóa cố định với nhân viên <b>{boundUser?.name || name}</b>. Chỉ Quản trị viên (Admin) mới có quyền mở khóa.</span>
                          </p>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1.5 ml-1">
                          <label className="block text-sm font-bold text-slate-700">Họ và Tên</label>
                          {isDeviceLocked && (
                            <button
                              type="button"
                              onClick={() => setShowDeviceLockedInfoModal(true)}
                              className="text-xs text-red-600 hover:text-red-800 font-bold flex items-center gap-1 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-md border border-red-200 transition-colors cursor-pointer"
                              title="Thiết bị đã khóa. Bấm để xem thông tin bảo mật."
                            >
                              <Lock className="w-3 h-3 text-red-600" />
                              <span>Đã khóa cố định</span>
                            </button>
                          )}
                        </div>
                        <div 
                          className="relative"
                          onClick={() => {
                            if (isDeviceLocked) {
                              setShowDeviceLockedInfoModal(true);
                            }
                          }}
                        >
                          <select 
                            value={name} 
                            disabled={isDeviceLocked || !department}
                            onChange={e => {
                              const selectedName = e.target.value;
                              setFormError('');
                              if (!selectedName) {
                                setName('');
                                return;
                              }
                              const matched = hrUsers.find(u => u.name === selectedName && u.department === department);
                              if (matched) {
                                if (!isNumericEmployeeId(matched.uid)) {
                                  setFormError(`Nhân viên "${matched.name}" có mã "${matched.uid || 'trống'}" là dạng chuỗi (như "SwhVgaPovhYgzvU5RD6f2GHWF1l1"). Hệ thống không cho phép điểm danh với mã chuỗi. Bắt buộc mã nhân viên phải là số (Ví dụ: 102, 314, 490).`);
                                  setName('');
                                  return;
                                }
                                localStorage.setItem('checkin_userId', matched.uid);
                              }
                              setName(selectedName);
                            }} 
                            className="w-full bg-slate-50 border border-slate-200 px-4 py-3.5 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium disabled:opacity-80 disabled:bg-slate-100 disabled:cursor-pointer"
                          >
                            <option value="">-- Chọn Nhân viên --</option>
                            {hrUsers.filter(u => u.department === department && !u.is_hidden && u.status !== 'inactive' && u.status !== 'locked').map(u => {
                              const isNum = isNumericEmployeeId(u.uid);
                              return (
                                <option key={u.uid} value={u.name} disabled={!isNum}>
                                  {u.name} {isNum ? `(Mã NV: ${u.uid})` : `(Lỗi mã chuỗi: ${u.uid} - Bị khóa)`}
                                </option>
                              );
                            })}
                          </select>
                          {isDeviceLocked && (
                            <div 
                              className="absolute inset-0 cursor-pointer flex items-center justify-end pr-10"
                              title="Thiết bị đã khóa chính chủ. Chỉ Admin mới có quyền mở khóa."
                            >
                              <Lock className="w-4 h-4 text-red-600" />
                            </div>
                          )}
                        </div>
                      </div>

                      {formError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold flex items-start gap-2 animate-shake">
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <span>{formError}</span>
                        </div>
                      )}

                      <button 
                        onClick={() => {
                          if (!department) {
                            setFormError('Vui lòng chọn Khoa / Phòng.');
                            return;
                          }
                          if (!name) {
                            setFormError('Vui lòng chọn Nhân viên.');
                            return;
                          }
                          const matched = hrUsers.find(u => u.name === name && u.department === department);
                          if (!matched || !isNumericEmployeeId(matched.uid)) {
                            setFormError(`Mã nhân viên "${matched?.uid || 'trống'}" là dạng chuỗi ký tự, không đúng quy chuẩn số. Vui lòng chọn nhân viên có mã số hợp lệ (ví dụ: 102, 314, 490).`);
                            return;
                          }
                          setFormError('');
                          localStorage.setItem('checkin_name', name.trim());
                          localStorage.setItem('checkin_department', department.trim());
                          localStorage.setItem('checkin_userId', matched.uid);
                          setIsReturningUser(true);
                        }} 
                        className="w-full py-4 mt-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-base shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-5 h-5" />
                        <span>Xác nhận thông tin</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* USER INFO COMPACT */}
                    <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-xs border border-slate-100 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <div className="w-12 h-12 rounded-full border border-slate-200 overflow-hidden bg-slate-50 shadow-2xs">
                              <img src={'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=0D8ABC&color=fff&size=120'} alt={name} className="w-full h-full object-cover" />
                            </div>
                            <button onClick={() => setActiveTab('profile')} className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-white rounded-full border border-slate-200 shadow-2xs flex items-center justify-center text-slate-600 hover:text-blue-600">
                              <User className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight truncate">{name}</h2>
                              <span className="inline-flex items-center gap-1 text-[10px] bg-red-50 text-red-700 font-bold px-2 py-0.5 rounded-md border border-red-200">
                                <Lock className="w-2.5 h-2.5 text-red-600" /> Khóa chính chủ
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{department || boundUser?.department || '-'}</p>
                          </div>
                        </div>

                        {/* Status badge and RED LOCK BADGE */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {lastActionToday === 'in' ? (
                            <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-[11px] font-bold rounded-lg border border-green-200">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                              Đang làm việc
                            </span>
                          ) : lastActionToday === 'out' ? (
                            <span className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-[11px] font-bold rounded-lg border border-orange-200">
                              Đã ra ca
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 text-[11px] font-bold rounded-lg border border-slate-200">
                              Chưa vào ca
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowDeviceLockedInfoModal(true)}
                            title="Thiết bị đã khóa chính chủ. Bấm để xem thông tin bảo mật."
                            className="flex items-center gap-1 px-2 py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[11px] font-extrabold rounded-lg transition-all shadow-2xs cursor-pointer group"
                          >
                            <Lock className="w-3.5 h-3.5 text-red-600 fill-red-600/15 group-hover:scale-110 transition-transform" />
                            <span className="hidden xs:inline">ĐÃ KHÓA</span>
                          </button>
                        </div>
                      </div>

                      {/* BANNER THIẾT BỊ ĐÃ KHÓA MÀU ĐỎ */}
                      <div 
                        onClick={() => setShowDeviceLockedInfoModal(true)}
                        className="flex items-center justify-between bg-gradient-to-r from-red-50/90 via-red-50/50 to-red-50/90 hover:bg-red-100/80 border border-red-200/90 rounded-xl px-3 py-2 text-red-800 transition-colors cursor-pointer shadow-2xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-md bg-red-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                            <Lock className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[11.5px] font-black text-red-900 tracking-tight">THIẾT BỊ ĐÃ KHÓA CỐ ĐỊNH</span>
                              <span className="text-[9.5px] bg-red-200/80 text-red-900 px-1.5 py-0.2 rounded font-bold">Chống điểm danh hộ</span>
                            </div>
                            <p className="text-[10px] text-red-700 truncate mt-0.5">
                              Không thể đổi tài khoản • Chỉ Quản trị viên (Admin) mới có quyền mở khóa
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-red-500 shrink-0 ml-1" />
                      </div>

                      {(() => {
                        const currentResolvedUid = hrUsers.find(u => u.name?.trim()?.toLowerCase() === name?.trim()?.toLowerCase())?.uid || boundUser?.uid || localStorage.getItem('checkin_userId') || '';
                        if (currentResolvedUid && !isNumericEmployeeId(currentResolvedUid)) {
                          return (
                            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3 flex flex-col gap-2 shadow-xs animate-in fade-in">
                              <div className="flex items-center gap-2 text-red-800 font-bold text-xs sm:text-sm">
                                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                                <span>MÃ NHÂN VIÊN KHÔNG ĐÚNG QUY CHUẨN SỐ</span>
                              </div>
                              <p className="text-xs text-red-700 leading-relaxed">
                                Mã nhân viên hiện tại là <b className="font-mono bg-red-100 px-1 py-0.5 rounded text-red-900">{currentResolvedUid}</b>. Hệ thống bắt buộc mã nhân viên phải là số.
                              </p>
                              <button
                                type="button"
                                onClick={() => setShowDeviceLockedInfoModal(true)}
                                className="w-full py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-xs shadow transition-colors flex items-center justify-center gap-1.5"
                              >
                                <Lock className="w-3.5 h-3.5" />
                                <span>Liên hệ Quản trị viên để mở khóa & cấp lại</span>
                              </button>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      
                      {/* Compact 2x2 grid */}
                      <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                        <div className="bg-slate-50/90 px-2.5 py-1.5 rounded-lg border border-slate-100 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                            <User className="w-3 h-3 text-blue-600" />
                            Mã NV
                          </span>
                          <span className="text-xs font-extrabold text-blue-700 font-mono">
                            {hrUsers.find(u => u.name?.trim()?.toLowerCase() === name?.trim()?.toLowerCase())?.uid || boundUser?.uid || localStorage.getItem('checkin_userId') || '-'}
                          </span>
                        </div>

                        <div className="bg-slate-50/90 px-2.5 py-1.5 rounded-lg border border-slate-100 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                            <Briefcase className="w-3 h-3 text-blue-600" />
                            Khoa
                          </span>
                          <span className="text-xs font-bold text-slate-800 truncate max-w-[110px]" title={department}>
                            {department || boundUser?.department || '-'}
                          </span>
                        </div>

                        <div className="bg-slate-50/90 px-2.5 py-1.5 rounded-lg border border-slate-100 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-blue-600" />
                            Chức vụ
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase truncate max-w-[115px] border ${getPositionBadgeClass(hrUsers.find(u => u.name?.trim()?.toLowerCase() === name?.trim()?.toLowerCase())?.position || boundUser?.position || 'Nhân viên')}`}>
                            {hrUsers.find(u => u.name?.trim()?.toLowerCase() === name?.trim()?.toLowerCase())?.position || boundUser?.position || 'Nhân viên'}
                          </span>
                        </div>

                        <div className="bg-slate-50/90 px-2.5 py-1.5 rounded-lg border border-slate-100 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                            <Activity className="w-3 h-3 text-blue-600" />
                            Ca trực
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase truncate max-w-[115px] ${isSpecial ? 'text-red-700 bg-red-50 border border-red-200' : 'text-blue-700 bg-blue-50 border border-blue-200'}`}>
                            {isSpecial ? (isNuoiConNho ? 'Con nhỏ' : 'Đặc thù') : 'Hành chính'}
                          </span>
                        </div>
                      </div>

                      {specialEmployees.some(e => e.user_name?.toLowerCase() === name?.trim()?.toLowerCase() && e.department === department) && (
                        <div className="flex justify-between items-center bg-red-50 px-2.5 py-1 rounded-lg border border-red-100">
                          <span className="text-[10px] font-bold text-red-500 uppercase flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-red-500" />
                            Ưu tiên:
                          </span>
                          <span className="text-xs font-bold text-red-700 uppercase">
                            {specialEmployees.find(e => e.user_name?.toLowerCase() === name?.trim()?.toLowerCase() && e.department === department)?.employee_type}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* PROGRESS BAR */}
                    <div className="bg-white rounded-2xl p-3 sm:p-3.5 shadow-xs border border-slate-100 relative">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs sm:text-sm">
                          <Heart className="w-3.5 h-3.5 text-red-400 animate-pulse fill-red-100" /> Tiến trình điểm danh
                        </h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isSpecial ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{isSpecial ? (isNuoiConNho ? 'Ưu tiên - Nuôi con nhỏ' : 'Ca đặc thù') : 'Ca hành chính'}</span>
                      </div>
                      <div className="relative pt-1 pb-[52px] px-2 sm:px-3">
                        <div className="h-1.5 bg-slate-100 rounded-full w-full relative flex items-center">
                          {/* Continuous progress bar */}
                          <div className="absolute left-0 h-full rounded-full bg-blue-500 overflow-hidden transition-all duration-1000 animate-heartbeat-blue" style={{ width: `${currentProgress}%`, zIndex: 0 }}></div>
                          
                          {/* Main animated active bar */}
                          <div className={`absolute left-0 h-full rounded-full transition-all duration-1000 ${hasMorningIn && !hasAfternoonOut ? 'bg-green-400 animate-heartbeat-glow' : 'bg-blue-400 animate-heartbeat-blue'}`} style={{ width: `${currentProgress}%`, zIndex: 1 }}></div>

                          {/* Node Vào sáng (07:00 / morningStartStr) */}
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-2.5 h-2.5 rounded-full border-2 shadow-xs -translate-x-1/2 transition-all ${hasMorningIn ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_mS}%` }}>
                            {hasMorningIn && <div className="absolute -inset-1.5 rounded-full bg-emerald-500 animate-ping opacity-75"></div>}
                          </div>

                          {/* Node 11h30 (Ra ca buổi trưa): Nhấp nháy tại điểm 11h30 nếu bấm ra ca trước 15h00 */}
                          <div 
                            className={`absolute top-1/2 -translate-y-1/2 z-10 w-3 h-3 rounded-full border-2 shadow-xs -translate-x-1/2 transition-all ${
                              hasMorningOut 
                                ? 'bg-red-500 border-white ring-2 ring-red-400 animate-pulse' 
                                : 'bg-white border-slate-300'
                            }`} 
                            style={{ left: `${p_mE}%` }}
                          >
                            {hasMorningOut && (
                              <>
                                <div className="absolute -inset-2 rounded-full bg-red-500 animate-ping opacity-75 pointer-events-none"></div>
                                <div className="absolute -inset-1 rounded-full bg-red-400 animate-pulse opacity-60 pointer-events-none"></div>
                              </>
                            )}
                          </div>

                          {/* Node Vào chiều (13:30 / afternoonStartStr) */}
                          <div className={`absolute top-1/2 -translate-y-1/2 z-10 w-2.5 h-2.5 rounded-full border-2 shadow-xs -translate-x-1/2 transition-all ${hasAfternoonIn ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'}`} style={{ left: `${p_aS}%` }}>
                            {hasAfternoonIn && <div className="absolute -inset-1.5 rounded-full bg-emerald-500 animate-ping opacity-75"></div>}
                          </div>
                          
                          {/* Node 17h00 (Ra ca chiều): Hiển thị điểm đỏ ở 17h00 nếu ra ca sau 15h00 */}
                          <div 
                            className={`absolute top-1/2 -translate-y-1/2 z-10 w-3.5 h-3.5 rounded-full border-2 shadow-md -translate-x-1/2 transition-all ${
                              hasAfternoonOut 
                                ? 'bg-red-600 border-white ring-2 ring-red-500' 
                                : 'bg-white border-slate-300'
                            }`} 
                            style={{ left: `${p_aE}%` }}
                          >
                            {hasAfternoonOut && (
                              <div className="absolute -inset-1 rounded-full bg-red-500/40 pointer-events-none"></div>
                            )}
                          </div>
                          
                          {/* Current time indicator bubble: Hiển thị khi đang trong ca làm việc */}
                          {!hasAfternoonOut && !(hasMorningOut && !hasAfternoonIn) && currentProgress > 0 && currentProgress < 100 && (
                            <div className="absolute top-1/2 -translate-y-1/2 z-20 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-full shadow-md -translate-x-1/2 transition-all duration-1000" style={{ left: `${currentProgress}%` }}>
                              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[9px] font-bold px-1 py-0.5 rounded shadow whitespace-nowrap flex items-center gap-0.5">
                                <Heart className="w-2 h-2 fill-current animate-pulse text-red-200" /> {format(currentTime, 'HH:mm')}
                                <div className="absolute bottom-[-3px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[3px] border-l-transparent border-t-[3px] border-t-blue-600 border-r-[3px] border-r-transparent"></div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Labels positioned identically to nodes */}
                        <div className="absolute w-full h-full top-5 left-0 px-2 sm:px-3 pointer-events-none">
                          {/* Label Vào sáng */}
                          <div className="absolute -translate-x-1/2 flex flex-col items-center w-[54px]" style={{ left: `calc(0.5rem + (100% - 1rem) * ${p_mS} / 100)` }}>
                            <span className="text-[8.5px] uppercase font-bold text-slate-400">Vào sáng</span>
                            <span className="text-[10px] font-bold text-slate-800">{morningStartStr}</span>
                            <div className={`mt-0.5 text-[9px] font-bold px-1 py-0.2 rounded whitespace-nowrap shadow-2xs ${hasMorningIn ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                              {hasMorningIn ? `Lúc ${displayMorningIn}` : displayMorningIn}
                            </div>
                          </div>

                          {/* Label 11h30: Ra ca buổi trưa */}
                          <div className="absolute -translate-x-1/2 flex flex-col items-center w-[58px]" style={{ left: `calc(0.5rem + (100% - 1rem) * ${p_mE} / 100)` }}>
                            <span className={`text-[8.5px] uppercase font-bold ${hasMorningOut ? 'text-red-600' : 'text-slate-400'}`}>
                              {hasMorningOut ? 'Ra trưa' : 'Ra sáng'}
                            </span>
                            <span className="text-[10px] font-bold text-slate-800">{morningEndStr}</span>
                            <div className={`mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap shadow-2xs transition-all ${
                              hasMorningOut 
                                ? 'bg-red-50 text-red-700 border border-red-200 animate-pulse font-extrabold' 
                                : 'bg-slate-100 text-slate-400 border border-slate-200'
                            }`}>
                              {hasMorningOut ? `Lúc ${displayMorningOut}` : displayMorningOut}
                            </div>
                          </div>

                          {/* Label Vào chiều */}
                          <div className="absolute -translate-x-1/2 flex flex-col items-center w-[54px]" style={{ left: `calc(0.5rem + (100% - 1rem) * ${p_aS} / 100)` }}>
                            <span className="text-[8.5px] uppercase font-bold text-slate-400">Vào chiều</span>
                            <span className="text-[10px] font-bold text-slate-800">{afternoonStartStr}</span>
                            <div className={`mt-0.5 text-[9px] font-bold px-1 py-0.2 rounded whitespace-nowrap shadow-2xs ${hasAfternoonIn ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                              {hasAfternoonIn ? `Lúc ${displayAfternoonIn}` : displayAfternoonIn}
                            </div>
                          </div>

                          {/* Label 17h00: Ra chiều (hiển thị điểm đỏ lúc sau 15h00) */}
                          <div className="absolute -translate-x-1/2 flex flex-col items-center w-[58px]" style={{ left: `calc(0.5rem + (100% - 1rem) * ${p_aE} / 100)` }}>
                            <span className={`text-[8.5px] uppercase font-bold ${hasAfternoonOut ? 'text-red-600' : 'text-slate-400'}`}>
                              Ra chiều
                            </span>
                            <span className="text-[10px] font-bold text-slate-800">{afternoonEndStr}</span>
                            <div className={`mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap shadow-2xs ${
                              hasAfternoonOut 
                                ? 'bg-red-600 text-white border border-red-700 font-extrabold shadow-sm' 
                                : 'bg-slate-100 text-slate-400 border border-slate-200'
                            }`}>
                              {hasAfternoonOut ? `Lúc ${displayAfternoonOut}` : displayAfternoonOut}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* LIVE GPS & CHECK-IN READINESS WIDGET */}
                    <LiveGpsWidget
                      appConfig={appConfig}
                      onLocationHelpClick={() => setShowLocationHelp(true)}
                    />

                    {/* PERSONAL TIMESHEET / LỊCH SỬ CÁ NHÂN SHORTCUT CARD */}
                    <div className="bg-white rounded-2xl p-3 sm:p-3.5 shadow-xs border border-slate-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <CalendarDays className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-800 text-xs sm:text-sm">Bảng chấm công cá nhân</h4>
                            <p className="text-[11px] text-slate-400">Dữ liệu điểm danh tháng {format(new Date(), 'MM/yyyy')}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('history')}
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold text-xs transition-colors flex items-center gap-1 shrink-0"
                        >
                          <span>Xem chi tiết</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* DAILY MEDICAL QUOTE & SAFETY CHECKLIST WIDGET */}
                    <DailyMedicalQuoteWidget />

                  </>
                )}
              </>
            ) : (
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex-1 flex flex-col items-center justify-center">
                {status === 'checking' && (
                  <div className="flex-1 flex flex-col items-center justify-center py-10 w-full">
                    <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 relative">
                      <div className="absolute inset-0 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                      <MapPin className="w-8 h-8 text-blue-600 animate-pulse" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-3">Đang xử lý</h3>
                    <p className="text-slate-500 text-center text-sm px-6 leading-relaxed font-medium">{message}</p>
                  </div>
                )}
                
                {status === 'success' && (
                  <div className="flex-1 flex flex-col items-center justify-center w-full mt-2 py-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="w-24 h-24 bg-gradient-to-tr from-green-400 to-emerald-500 text-white rounded-full flex items-center justify-center mb-6 shadow-xl shadow-green-200/50 ring-8 ring-green-50 transform hover:scale-105 transition-all">
                      <PartyPopper className="w-12 h-12 animate-bounce" />
                    </div>
                    <h2 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-green-500 text-center mb-4 tracking-tight">
                      {message.includes('chấm công ra') || message.includes('ra ca') || message.includes('ra thành công') ? 'CHẤM CÔNG RA THÀNH CÔNG!' : 'CHẤM CÔNG VÀO THÀNH CÔNG!'}
                    </h2>
                    <div className="relative bg-gradient-to-br from-green-50 to-emerald-50/50 border border-green-200/60 rounded-2xl p-6 mx-4 mb-4 shadow-sm w-full max-w-sm text-center overflow-hidden">
                      <div className="absolute top-0 right-0 -mr-6 -mt-6 w-24 h-24 bg-green-200/40 rounded-full blur-2xl"></div>
                      <div className="absolute bottom-0 left-0 -ml-6 -mb-6 w-24 h-24 bg-emerald-200/40 rounded-full blur-2xl"></div>
                      
                      <div className="relative z-10">
                        {message.includes('đi muộn') && (
                           <div className="inline-block px-3 py-1 mb-3 bg-orange-100 text-orange-700 rounded-full text-xs font-bold border border-orange-200 shadow-sm">
                             ⚠️ Ghi nhận đi muộn
                           </div>
                        )}
                        <p className="text-base text-emerald-900 font-bold leading-relaxed mb-4">
                          {message}
                        </p>
                        <div className="flex justify-center gap-4 text-emerald-500">
                          {message.includes('chấm công ra') || message.includes('ra ca') || message.includes('ra thành công') ? (
                            <>
                              <Heart className="w-6 h-6 animate-pulse text-rose-400 drop-shadow-sm" />
                            </>
                          ) : (
                            <>
                              <Sun className="w-6 h-6 animate-[spin_4s_linear_infinite] drop-shadow-sm text-amber-400" />
                              <Coffee className="w-6 h-6 drop-shadow-sm text-amber-600" />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {locationDetails && (
                      <div className="w-full bg-slate-50 rounded-xl p-4 border border-slate-200 my-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-2 border-b border-slate-200 pb-2">
                          <MapPin className="w-4 h-4 text-blue-600" />
                          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Xác nhận vị trí</p>
                        </div>
                        <div className="space-y-2">
                          {locationDetails.distance !== undefined && (
                            <p className="text-sm text-slate-700 flex justify-between items-center mb-3">
                              <span>Khoảng cách đến cơ quan:</span> 
                              <span className="font-bold text-slate-900 bg-white px-2 py-1 rounded-md border border-slate-100 shadow-sm">{Math.round(locationDetails.distance)} mét</span>
                            </p>
                          )}
                          {locationDetails.accuracy !== undefined && (
                            <p className="text-sm text-slate-700 flex justify-between items-center mb-3">
                              <span>Sai số GPS (Độ chính xác):</span> 
                              <span className="font-bold text-slate-900 bg-white px-2 py-1 rounded-md border border-slate-100 shadow-sm">{Math.round(locationDetails.accuracy)} mét</span>
                            </p>
                          )}
                          <div className="rounded-xl overflow-hidden shadow-inner border border-slate-200">
                            <LocationMap 
                              centerLat={appConfig?.targetLat || 19.867470}
                              centerLng={appConfig?.targetLng || 105.676898}
                              radius={appConfig?.radius || 600}
                              markerLat={locationDetails.lat}
                              markerLng={locationDetails.lng}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="w-full mt-auto pt-4">
                      <button
                        onClick={() => { setStatus('idle'); loadData(); }}
                        className="w-full py-4 px-4 rounded-xl border-2 border-blue-600 text-blue-700 font-bold text-sm hover:bg-blue-50 transition-all shadow-sm"
                      >
                        VỀ MÀN HÌNH CHÍNH
                      </button>
                    </div>
                  </div>
                )}
                
                {status === 'early_out' && (
                  <div className="flex-1 flex flex-col items-center justify-center w-full mt-2 py-6">
                    <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mb-4 shadow-sm ring-4 ring-orange-50">
                      <Clock className="w-10 h-10" />
                    </div>
                    <h2 className="text-xl font-bold text-orange-600 text-center mb-3">CHƯA ĐẾN GIỜ RA CA</h2>
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mx-4 mb-6 shadow-sm w-full max-w-sm text-center">
                      <p className="text-sm text-orange-800 font-bold leading-relaxed">{message}</p>
                    </div>
                    
                    <div className="w-full bg-slate-50 rounded-xl p-4 border border-slate-200 mb-6 shadow-sm text-center">
                      <p className="text-slate-600 text-sm">Bạn chỉ có thể điểm danh ra ca vào giờ quy định. Vui lòng quay lại sau.</p>
                    </div>

                    <div className="w-full mt-auto pt-4 flex gap-3">
                      <button
                        onClick={() => { setStatus('idle'); loadData(); }}
                        className="w-full py-4 px-4 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-50 transition-all shadow-sm"
                      >
                        TRỞ LẠI
                      </button>
                    </div>
                  </div>
                )}

                {status === 'failed' && (
                  <div className="flex-1 flex flex-col items-center justify-center w-full mt-2 py-6">
                    <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4 shadow-sm ring-4 ring-red-50">
                      <XCircle className="w-10 h-10" />
                    </div>
                    <h2 className="text-xl font-bold text-red-600 text-center mb-3">ĐIỂM DANH LỖI</h2>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mx-4 mb-4 shadow-sm w-full max-w-sm text-center">
                      <p className="text-sm text-red-800 font-bold leading-relaxed">{message}</p>
                    </div>

                    {rebindPossible && (
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mx-4 mb-5 shadow-xs w-full max-w-sm text-left animate-in fade-in duration-200">
                        <div className="flex items-center gap-2 mb-2 text-amber-900 font-bold text-xs uppercase tracking-wide">
                          <Smartphone className="w-4 h-4 text-amber-600" />
                          <span>Hướng dẫn xử lý nhanh</span>
                        </div>
                        <div className="text-xs text-amber-900 space-y-2 mb-3">
                          <p>
                            • <b>Nếu đang mở từ Zalo:</b> Bấm dấu ba chấm <b>(⋮)</b> ở góc trên bên phải màn hình Zalo, chọn <b>"Mở bằng trình duyệt"</b> (Safari / Chrome).
                          </p>
                          <p>
                            • <b>Nếu bạn vừa đổi máy / xóa lịch sử duyệt web:</b> Vui lòng nhờ Quản lý / Quản trị viên bấm <b>"Mở khóa thiết bị"</b> trên trang Quản trị.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              navigator.clipboard.writeText(window.location.href);
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 3000);
                            } catch (e) {}
                          }}
                          className="w-full py-2.5 px-3 bg-white border border-amber-300 text-amber-900 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-amber-100 transition-colors shadow-xs"
                        >
                          <Copy className="w-3.5 h-3.5 text-amber-700" />
                          <span>{copiedLink ? '✓ Đã sao chép link điểm danh' : 'Sao chép link để mở bằng Chrome / Safari'}</span>
                        </button>
                      </div>
                    )}
                    
                    {locationDetails && (
                      <div className="w-full bg-red-50 rounded-xl p-4 border border-red-200 mb-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-2 border-b border-red-100 pb-2">
                          <MapPin className="w-4 h-4 text-red-600" />
                          <p className="text-xs font-bold text-red-800 uppercase tracking-wide">Vị trí của bạn</p>
                        </div>
                        <div className="space-y-2">
                          {locationDetails.distance !== undefined && (
                            <p className="text-sm text-red-900 flex justify-between items-center mb-3">
                              <span>Khoảng cách đến cơ quan:</span> 
                              <span className="font-bold bg-white/80 px-2 py-1 rounded-md shadow-sm border border-red-100">{Math.round(locationDetails.distance)} mét</span>
                            </p>
                          )}
                          {locationDetails.accuracy !== undefined && (
                            <p className="text-sm text-red-900 flex justify-between items-center mb-3">
                              <span>Sai số GPS (Độ chính xác):</span> 
                              <span className="font-bold bg-white/80 px-2 py-1 rounded-md shadow-sm border border-red-100">{Math.round(locationDetails.accuracy)} mét</span>
                            </p>
                          )}
                          <div className="rounded-xl overflow-hidden shadow-inner border border-red-200">
                            <LocationMap 
                              centerLat={appConfig?.targetLat || 19.867470}
                              centerLng={appConfig?.targetLng || 105.676898}
                              radius={appConfig?.radius || 600}
                              markerLat={locationDetails.lat}
                              markerLng={locationDetails.lng}
                            />
                          </div>
                          <p className="text-sm text-red-700 font-semibold flex justify-between items-center mt-3 bg-red-100 px-3 py-2 rounded-lg">
                            <span>Yêu cầu tối đa:</span>
                            <span>{appConfig?.radius || 600} mét</span>
                          </p>
                        </div>
                      </div>
                    )}
                    
                    <div className="w-full mt-auto pt-4 flex flex-col gap-2">
                      <div className="flex gap-3 w-full">
                        <button
                          onClick={() => { setStatus('idle'); loadData(); }}
                          className="flex-1 py-4 px-4 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-50 transition-all shadow-sm"
                        >
                          TRỞ LẠI
                        </button>
                        <button
                          onClick={() => handleCheckIn(lastActionToday === 'in' ? 'out' : 'in')}
                          className="flex-1 py-4 px-4 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-900 transition-all shadow-lg active:scale-95"
                        >
                          THỬ LẠI
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === 'briefing' && (
          <BriefingMobileView
            currentName={name}
            currentDepartment={department}
            isDeviceLocked={isDeviceLocked}
            boundUser={boundUser}
            scannedQrToken={scannedBriefingQr}
            onClearScannedQrToken={() => setScannedBriefingQr('')}
            onBackToHome={() => setActiveTab('home')}
            onSelectIdentity={(selectedName, selectedDept) => {
              if (!isDeviceLocked) {
                setName(selectedName);
                setDepartment(selectedDept);
              }
            }}
          />
        )}

        {activeTab === 'history' && (
          <DailyHistoryView
            userId={boundUser?.uid || hrUsers.find(u => u.name?.toLowerCase() === name?.trim()?.toLowerCase() && u.department === department)?.uid || localStorage.getItem('checkin_userId') || ''}
            userName={name}
            department={department}
            appConfig={appConfig}
            initialRecords={historyRecords}
          />
        )}

        {activeTab === 'profile' && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex-1">
            <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2"><User className="w-5 h-5 text-blue-600"/> Thông tin cá nhân</h2>
            {isReturningUser ? (
              <div className="space-y-4">
                <div className="flex justify-center mb-6">
                  <div className="w-24 h-24 rounded-full border-4 border-white shadow-md overflow-hidden bg-slate-50 relative">
                    <img src={'https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=0D8ABC&color=fff&size=150'} alt={name} className="w-full h-full object-cover" />
                  </div>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                   <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Mã nhân viên</p>
                   <p className="font-mono font-bold text-slate-800 text-lg">{hrUsers.find(u => u.name?.toLowerCase() === name?.trim()?.toLowerCase() && u.department === department)?.uid || '-'}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                   <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Họ và Tên</p>
                   <p className="font-bold text-slate-800 text-lg">{name}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                   <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Khoa / Phòng</p>
                   <p className="font-bold text-slate-800">{department}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                   <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Chức vụ</p>
                   <div className="mt-1">
                     <span className={`text-[11px] px-2 py-1 rounded font-bold uppercase tracking-wide border ${getPositionBadgeClass(hrUsers.find(u => u.name?.toLowerCase() === name?.trim()?.toLowerCase() && u.department === department)?.position || 'Nhân viên')}`}>{hrUsers.find(u => u.name?.toLowerCase() === name?.trim()?.toLowerCase() && u.department === department)?.position || 'Nhân viên'}</span>
                   </div>
                </div>
                {specialEmployees.some(e => e.user_name?.toLowerCase() === name?.trim()?.toLowerCase() && e.department === department) && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                   <p className="text-xs text-red-500 font-bold uppercase tracking-wider mb-1">Đối tượng ưu tiên</p>
                   <p className="font-bold text-red-800">{specialEmployees.find(e => e.user_name?.toLowerCase() === name?.trim()?.toLowerCase() && e.department === department)?.employee_type}</p>
                </div>
                )}
                
                {/* KHỐI THIẾT BỊ ĐÃ KHÓA CHÍNH CHỦ MÀU ĐỎ */}
                <div className="mt-6 bg-red-50/90 p-4 rounded-2xl border-2 border-red-200 flex flex-col gap-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs shrink-0">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-black text-red-900 tracking-tight uppercase">Thiết bị đã khóa chính chủ</h4>
                        <p className="text-[10.5px] font-semibold text-red-700">Chính sách: 1 nhân viên / 1 thiết bị</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-600 text-white shadow-2xs shrink-0">
                      ĐÃ KHÓA
                    </span>
                  </div>

                  <p className="text-xs text-red-800 leading-relaxed bg-white/80 p-3 rounded-xl border border-red-100/80">
                    Nhằm chống điểm danh hộ và đảm bảo tính minh bạch, mỗi thiết bị chỉ được điểm danh cho <b>01 nhân viên chính chủ</b>. <b>Chỉ có Quản trị viên (Admin)</b> mới có quyền hủy liên kết và mở khóa thiết bị.
                  </p>

                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleOpenUnlockModal}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                    >
                      <ShieldCheck className={`w-4 h-4 ${hasDesignatedUnlockers ? 'text-amber-300' : 'text-slate-400'}`} />
                      <span className="truncate">{getUnlockButtonLabel()}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-500 mb-4">Bạn chưa nhập thông tin cá nhân.</p>
                <button onClick={() => setActiveTab('home')} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md">Nhập thông tin ngay</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FLOAT ACTION BUTTONS */}
      {activeTab === 'home' && status === 'idle' && isReturningUser && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-40">
          {(() => {
            const currentResolvedUid = hrUsers.find(u => u.name?.trim()?.toLowerCase() === name?.trim()?.toLowerCase())?.uid || boundUser?.uid || localStorage.getItem('checkin_userId') || '';
            const isInvalidId = !currentResolvedUid || !isNumericEmployeeId(currentResolvedUid);
            if (isInvalidId) {
              return (
                <button 
                  type="button"
                  onClick={() => setShowDeviceLockedInfoModal(true)}
                  className="w-full h-[52px] px-4 rounded-full font-bold bg-red-600 hover:bg-red-700 active:scale-95 text-white shadow-lg flex items-center justify-center gap-2 animate-pulse"
                >
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span className="text-xs sm:text-sm uppercase tracking-wide font-extrabold">MÃ NV LỖI CHUỖI • LIÊN HỆ ADMIN ĐỂ MỞ KHÓA</span>
                </button>
              );
            }
            return (
              <div className="flex gap-3">
                <button 
                  onClick={() => handleInitiateCheckIn('in')} 
                  disabled={isSubmittingCheckIn || lastActionToday === 'in'}
                  className={`flex-1 h-[52px] px-2 sm:px-4 rounded-full font-bold transition-all transform flex items-center justify-center relative overflow-hidden group ${
                    lastActionToday === 'in' 
                      ? 'bg-green-50 text-green-300 border-2 border-green-100 cursor-not-allowed scale-95 shadow-none' 
                      : isSubmittingCheckIn
                        ? 'bg-green-50 text-green-400 border-2 border-green-200 cursor-not-allowed opacity-75'
                        : 'bg-white text-green-600 border-[3px] border-green-500 hover:bg-green-50 active:scale-95 shadow-[0_8px_20px_rgba(34,197,94,0.3)] cursor-pointer'
                  }`}
                >
                  {isSubmittingCheckIn && pendingCheckInType === 'in' ? (
                    <div className="flex items-center gap-1.5 z-10 text-green-700">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span className="text-[12px] sm:text-[14px] whitespace-nowrap font-bold">ĐANG GHI NHẬN...</span>
                    </div>
                  ) : (
                    <span className="text-[13px] sm:text-[15px] whitespace-nowrap tracking-wide relative z-10 font-bold">GHI NHẬN CÓ MẶT</span>
                  )}
                </button>
                
                <button 
                  onClick={() => handleInitiateCheckIn('out')} 
                  disabled={isSubmittingCheckIn}
                  className={`flex-1 h-[52px] px-2 sm:px-4 rounded-full font-bold transition-all transform flex items-center justify-center relative overflow-hidden group ${
                    isSubmittingCheckIn
                      ? 'bg-orange-50 text-orange-400 border-2 border-orange-200 cursor-not-allowed opacity-75'
                      : 'bg-white text-orange-500 border-[3px] border-orange-500 hover:bg-orange-50 active:scale-95 shadow-[0_8px_20px_rgba(249,115,22,0.3)] cursor-pointer'
                  }`}
                >
                  {isSubmittingCheckIn && pendingCheckInType === 'out' ? (
                    <div className="flex items-center gap-1.5 z-10 text-orange-600">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span className="text-[12px] sm:text-[14px] whitespace-nowrap font-bold">ĐANG GHI NHẬN...</span>
                    </div>
                  ) : (
                    <span className="text-[13px] sm:text-[15px] whitespace-nowrap tracking-wide relative z-10 font-bold">GHI NHẬN RA VỀ</span>
                  )}
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* BOTTOM NAVIGATION */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex justify-center items-center z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] pb-safe">
        <div className="flex justify-evenly items-center w-full max-w-md px-2">
          <button onClick={() => setActiveTab('home')} className={`flex flex-col items-center gap-1 flex-1 py-1 transition-colors ${activeTab === 'home' ? 'text-blue-600' : 'text-slate-400'}`}>
            <Home className={`w-5 h-5 ${activeTab === 'home' ? 'fill-blue-600' : ''}`} />
            <span className="text-[11px] font-bold whitespace-nowrap">Trang chủ</span>
          </button>
          <button onClick={() => setActiveTab('briefing')} className={`flex flex-col items-center gap-1 flex-1 py-1 transition-colors ${activeTab === 'briefing' ? 'text-blue-600' : 'text-slate-400'}`}>
            <QrCode className={`w-5 h-5 ${activeTab === 'briefing' ? 'text-blue-600' : ''}`} />
            <span className="text-[11px] font-bold whitespace-nowrap">Giao ban</span>
          </button>
          <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-1 flex-1 py-1 transition-colors ${activeTab === 'history' ? 'text-blue-600' : 'text-slate-400'}`}>
            <History className={`w-5 h-5 ${activeTab === 'history' ? 'text-blue-600' : ''}`} />
            <span className="text-[11px] font-bold whitespace-nowrap">Lịch sử</span>
          </button>
          <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center gap-1 flex-1 py-1 transition-colors ${activeTab === 'profile' ? 'text-blue-600' : 'text-slate-400'}`}>
            <User className={`w-5 h-5 ${activeTab === 'profile' ? 'text-blue-600' : ''}`} />
            <span className="text-[11px] font-bold whitespace-nowrap">Cá nhân</span>
          </button>
        </div>
      </div>

    
      {/* Modal Xác Nhận Danh Tính & Khóa Thiết Bị */}
      {showIdentityConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[130] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-blue-100 flex flex-col">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-5 text-white flex flex-col items-center text-center relative">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mb-2 shadow-inner">
                <ShieldCheck className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-bold text-lg leading-snug">XÁC NHẬN DANH TÍNH</h3>
              <p className="text-blue-100 text-xs mt-0.5">Kiểm tra thông tin trước khi khóa thiết bị</p>
            </div>

            <div className="p-5 flex flex-col gap-3">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Họ và Tên:</span>
                  <span className="font-bold text-slate-800 text-sm">{name}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Khoa / Phòng:</span>
                  <span className="font-bold text-blue-700">{department}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Mã nhân viên:</span>
                  <span className="font-mono font-bold text-slate-700">{hrUsers.find(u => u.name?.trim()?.toLowerCase() === name?.trim()?.toLowerCase())?.uid || '-'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Thiết bị:</span>
                  <span className="font-bold text-slate-600 truncate max-w-[170px]">{deviceProfile?.deviceModel || 'Thiết bị di động'} ({deviceProfile?.os || 'HĐH'})</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[12px] text-amber-800 leading-relaxed flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  Sau khi xác nhận, thiết bị này sẽ được <b>khóa chính chủ</b> cho tài khoản của bạn để điểm danh hàng ngày và phòng chống điểm danh hộ.
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleConfirmIdentityAndCheckIn}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Xác nhận đúng & Điểm danh</span>
                </button>

                <button
                  type="button"
                  onClick={handleRejectIdentity}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-600 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
                >
                  <XCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span>Không phải tôi (Chọn lại nhân viên)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* MODAL THÔNG BÁO THIẾT BỊ ĐÃ KHÓA CỐ ĐỊNH - CHỈ ADMIN MỚI CÓ QUYỀN MỞ KHÓA */}
      {showDeviceLockedInfoModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-red-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 mx-auto mb-4 ring-8 ring-red-50">
              <Lock className="w-8 h-8" />
            </div>

            <div className="text-center mb-4">
              <span className="inline-block px-3 py-1 bg-red-100 text-red-800 text-[11px] font-black rounded-full uppercase tracking-wider mb-1.5">
                BẢO MẬT ĐIỂM DANH CHÍNH CHỦ
              </span>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
                Thiết Bị Đã Khóa Tài Khoản
              </h3>
              <p className="text-xs text-red-600 font-semibold mt-1">
                Nhân viên không thể tự đổi tài khoản trên thiết bị này
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5 mb-4 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Nhân viên sở hữu:</span>
                <span className="font-extrabold text-slate-900 text-sm">{boundUser?.name || name}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Mã nhân viên:</span>
                <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {hrUsers.find(u => u.name?.trim()?.toLowerCase() === name?.trim()?.toLowerCase())?.uid || boundUser?.uid || localStorage.getItem('checkin_userId') || '-'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Khoa / Phòng:</span>
                <span className="font-bold text-slate-800">{boundUser?.department || department}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500 font-medium">Trạng thái khóa:</span>
                <span className="inline-flex items-center gap-1 font-bold text-red-700">
                  <Lock className="w-3 h-3 text-red-600" />
                  Khóa vĩnh viễn với thiết bị
                </span>
              </div>
            </div>

            <div className="p-3 bg-red-50/80 rounded-xl border border-red-200/80 text-[11.5px] text-red-800 leading-relaxed mb-5">
              <p className="font-bold text-red-900 mb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-red-600 shrink-0" />
                Quy định chấm công BVĐK Thiệu Hóa:
              </p>
              Nhằm chống điểm danh hộ và đảm bảo tính minh bạch, mỗi thiết bị chỉ được điểm danh cho <b>01 nhân viên chính chủ</b>. <b>Chỉ có Quản trị viên (Admin)</b> mới có quyền hủy liên kết và mở khóa thiết bị.
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setShowDeviceLockedInfoModal(false)}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-colors"
              >
                ĐÃ HIỂU QUY ĐỊNH
              </button>

              <button
                type="button"
                onClick={handleOpenUnlockModal}
                className={`w-full py-2.5 px-4 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs ${
                  hasDesignatedUnlockers ? 'bg-slate-900 hover:bg-slate-800' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                <ShieldCheck className={`w-4 h-4 ${hasDesignatedUnlockers ? 'text-amber-300' : 'text-slate-400'}`} />
                <span className="truncate">{getUnlockButtonLabel()}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xác Minh Quyền Mở Khóa Thiết Bị do Admin chỉ định */}
      {showDesignatedUnlockModal && (
        <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs z-[110] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Ủy Quyền Mở Khóa Thiết Bị</h3>
                  <p className="text-[11px] text-slate-300">Phân quyền trực tiếp từ Quản trị viên (Admin)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDesignatedUnlockModal(false);
                  setDesignatedUnlockError(null);
                  setDesignatedUnlockSuccess(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {!hasDesignatedUnlockers ? (
                /* Trường hợp Admin CHƯA chỉ định nhân viên nào */
                <div className="space-y-4">
                  <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-xs text-red-900 leading-relaxed">
                    <p className="font-bold text-red-950 mb-1 flex items-center gap-1.5 text-sm">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      Chưa có nhân viên được Admin chỉ định
                    </p>
                    <p className="mb-2 font-semibold">
                      Nếu admin chưa chỉ định thì không được mở khóa.
                    </p>
                    <p className="text-red-700">
                      Hiện tại Quản trị viên (Admin) chưa phân quyền mở khóa thiết bị cho bất kỳ nhân viên nào. Để đảm bảo tính minh bạch và chống điểm danh hộ, thiết bị này được khóa an toàn.
                    </p>
                  </div>

                  <p className="text-xs text-slate-500 text-center">
                    Vui lòng báo lại với Quản trị viên (Admin) bệnh viện để được cấu hình phân quyền mở khóa, hoặc Quản trị viên có thể đăng nhập trực tiếp.
                  </p>

                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDesignatedUnlockModal(false);
                        navigate('/admin');
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>Đăng nhập Quản trị viên (Admin)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDesignatedUnlockModal(false)}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              ) : (
                /* Trường hợp Admin ĐÃ chỉ định nhân viên cụ thể */
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 text-xs text-blue-900 leading-relaxed">
                    <p className="font-bold text-blue-950 mb-1 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                      Nhân viên được Admin chỉ định quyền mở khóa:
                    </p>
                    <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto">
                      {designatedUnlockers.map((emp) => (
                        <div key={emp.uid} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-blue-100 text-xs font-medium shadow-2xs">
                          <span className="text-slate-800 font-bold">{emp.name}</span>
                          <div className="flex items-center gap-1.5">
                            {emp.department && <span className="text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">{emp.department}</span>}
                            <span className="bg-blue-100 text-blue-800 text-[10.5px] font-mono font-bold px-1.5 py-0.5 rounded">
                              Mã: {emp.uid}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Chọn nhân viên thực hiện mở khóa:
                    </label>
                    <select
                      value={designatedOperatorInput}
                      onChange={(e) => {
                        setDesignatedOperatorInput(e.target.value);
                        setDesignatedUnlockError(null);
                      }}
                      className="w-full text-xs font-medium border border-slate-300 rounded-xl p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Chọn nhân viên được ủy quyền --</option>
                      {designatedUnlockers.map((emp) => (
                        <option key={emp.uid} value={emp.uid}>
                          {emp.name} (Mã NV: {emp.uid}) {emp.department ? `- ${emp.department}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {designatedUnlockError && (
                    <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>{designatedUnlockError}</span>
                    </div>
                  )}

                  {designatedUnlockSuccess && (
                    <div className="p-2.5 bg-green-50 border border-green-200 text-green-700 rounded-xl text-xs font-medium flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                      <span>{designatedUnlockSuccess}</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      disabled={designatedUnlockLoading || !designatedOperatorInput}
                      onClick={handlePerformDesignatedUnlock}
                      className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
                    >
                      {designatedUnlockLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Đang xác minh & mở khóa...</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-4 h-4" />
                          <span>Xác nhận & Mở khóa thiết bị ngay</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowDesignatedUnlockModal(false);
                        navigate('/admin');
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5 text-slate-500" />
                      <span>Quản trị viên (Admin) đăng nhập</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showNotifications && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex flex-col justify-end">
          <div className="bg-slate-50 w-full rounded-t-3xl min-h-[50vh] max-h-[85vh] flex flex-col shadow-2xl relative">
            <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto my-3 shrink-0"></div>
            <div className="px-5 pb-3 flex justify-between items-center border-b border-slate-200 shrink-0">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-600" /> Thông báo
              </h3>
              <button onClick={() => setShowNotifications(false)} className="w-8 h-8 flex items-center justify-center bg-slate-200 text-slate-500 rounded-full">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 pb-8">
              {notifications.length === 0 ? (
                <div className="text-center text-slate-500 py-10 flex flex-col items-center justify-center gap-3">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                    <Bell className="w-8 h-8 text-slate-300" />
                  </div>
                  <p>Không có thông báo nào mới</p>
                </div>
              ) : (
                notifications.map(notif => (
                  <div key={notif.id} className={`p-4 rounded-xl shadow-sm border ${notif.type === 'error' ? 'bg-red-50 border-red-100' : notif.type === 'warning' ? 'bg-orange-50 border-orange-100' : notif.type === 'success' ? 'bg-green-50 border-green-100' : 'bg-blue-50 border-blue-100'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${notif.type === 'error' ? 'bg-red-100 text-red-700' : notif.type === 'warning' ? 'bg-orange-100 text-orange-700' : notif.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {notif.type === 'error' ? 'Quan trọng' : notif.type === 'warning' ? 'Cảnh báo' : notif.type === 'success' ? 'Tin tốt' : 'Thông tin'}
                      </span>
                      <span className="text-[10px] font-medium text-slate-500">
                        {new Date(notif.created_at).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <h4 className={`font-bold text-sm mb-1 ${notif.type === 'error' ? 'text-red-900' : notif.type === 'warning' ? 'text-orange-900' : notif.type === 'success' ? 'text-green-900' : 'text-blue-900'}`}>{notif.title}</h4>
                    <p className={`text-sm leading-relaxed ${notif.type === 'error' ? 'text-red-800' : notif.type === 'warning' ? 'text-orange-800' : notif.type === 'success' ? 'text-green-800' : 'text-blue-800'}`}>{notif.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL CẢNH BÁO QUÉT MÃ TRÊN ZALO */}
      {showZaloModal && (
        <div className="fixed inset-0 bg-slate-900/70 z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-amber-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-center text-slate-800 mb-2">
              Phát hiện bạn đang dùng Zalo
            </h3>
            <div className="text-xs text-slate-600 space-y-2.5 mb-5 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <p className="font-semibold text-slate-800">
                ⚠️ Trình duyệt tích hợp của Zalo thường chặn quyền GPS và không lưu định danh thiết bị chính chủ.
              </p>
              <p>
                Để điểm danh thành công và không bị hỏi lại danh tính, bạn hãy:
              </p>
              <ol className="list-decimal pl-4 space-y-1 font-medium text-slate-700">
                <li>Bấm vào biểu tượng <b>dấu 3 chấm (...)</b> ở góc trên bên phải màn hình Zalo.</li>
                <li>Chọn <b>"Mở bằng trình duyệt"</b> (hoặc <i>"Mở bằng Chrome" / "Mở bằng Safari"</i>).</li>
              </ol>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(window.location.href);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 3000);
                  } catch (e) {}
                }}
                className="w-full py-3 px-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                <span>{copiedLink ? '✓ Đã sao chép link điểm danh' : 'Sao chép link để dán vào Chrome/Safari'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowZaloModal(false)}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors shadow-md"
              >
                Tôi đã hiểu & Tiếp tục
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MÃ NHÂN VIÊN KHÔNG PHẢI LÀ SỐ */}
      {showInvalidIdModal && (
        <div className="fixed inset-0 bg-slate-900/70 z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-red-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center text-red-600 mx-auto mb-4">
              <XCircle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-center text-slate-800 mb-2">
              Mã nhân viên không hợp lệ
            </h3>
            <p className="text-xs text-slate-600 text-center mb-4 leading-relaxed">
              {invalidIdMessage || 'Mã nhân viên bắt buộc phải là số (Ví dụ: 102, 314, 490).'}
            </p>
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold mb-5 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>Hệ thống đã hủy thông tin cũ. Vui lòng chọn lại Khoa / Phòng và chọn đúng nhân viên có mã số.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowInvalidIdModal(false);
                setIsReturningUser(false);
                setIsDeviceLocked(false);
                setBoundUser(null);
                setName('');
                setDepartment('');
                setFormError('');
                localStorage.removeItem('checkin_userId');
                localStorage.removeItem('checkin_name');
                localStorage.removeItem('checkin_department');
                localStorage.removeItem('checkin_identity_confirmed');
                const prof = deviceProfile;
                if (prof?.fingerprint) {
                  apiFetch('/api/user_devices/unbind', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fingerprint: prof.fingerprint })
                  }).catch(() => {});
                }
              }}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors shadow-md"
            >
              Chọn lại Khoa / Phòng ngay
            </button>
          </div>
        </div>
      )}

      {/* MODAL TỰ ĐỘNG MỞ NHẮC NHỞ ĐIỂM DANH */}
      {showReminderPrompt && (
        <div className="fixed inset-0 bg-slate-900/70 z-[140] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-blue-200 animate-in zoom-in-95 duration-200 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4 ring-8 ring-blue-50">
              <BellRing className="w-8 h-8 animate-bounce text-blue-600" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>{reminderPromptDetails.title || 'Nhắc nhở chấm công'}</span>
            </div>
            <h3 className="text-xl font-extrabold text-slate-800 mb-1">
              ĐÃ ĐẾN GIỜ ĐIỂM DANH
            </h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Chào <b className="text-slate-800">{name || 'bạn'}</b>, hệ thống đã tự động mở theo nhắc nhở. Nhấn nút bên dưới để hoàn tất ghi nhận thời gian làm việc ngay bây giờ!
            </p>

            <div className="w-full space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowReminderPrompt(false);
                  handleInitiateCheckIn(reminderPromptDetails.type || (lastActionToday === 'in' ? 'out' : 'in'));
                }}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-98 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                <span>
                  {reminderPromptDetails.type === 'out' || lastActionToday === 'in' 
                    ? 'BẤM ĐIỂM DANH RA VỀ NGAY' 
                    : 'BẤM ĐIỂM DANH CÓ MẶT NGAY'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowReminderPrompt(false)}
                className="w-full py-2.5 text-slate-500 hover:text-slate-700 text-xs font-semibold"
              >
                Để sau / Tự điểm danh thủ công
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CHI TIẾT DANH SÁCH ĐIỂM DANH NGOẠI TUYẾN CHỜ ĐỒNG BỘ */}
      {showOfflineModal && (
        <div className="fixed inset-0 bg-slate-900/70 z-[145] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl border border-blue-200 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Hàng đợi điểm danh ngoại tuyến</h3>
                  <p className="text-xs text-slate-500">{offlineQueue.length} lượt điểm danh đang lưu tạm trong máy</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowOfflineModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2.5 my-1 pr-1">
              {offlineQueue.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <CheckCircle className="w-12 h-12 mx-auto text-emerald-500 mb-2 opacity-80" />
                  <p className="font-medium text-sm text-slate-600">Tất cả dữ liệu đã được đồng bộ lên máy chủ</p>
                  <p className="text-xs text-slate-400 mt-1">Không còn bản ghi ngoại tuyến nào đang chờ</p>
                </div>
              ) : (
                offlineQueue.map((item) => (
                  <div key={item.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        item.type === 'in' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.type === 'in' ? 'VÀO CA' : 'RA CA'}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">
                        {format(new Date(item.timestamp), 'HH:mm:ss - dd/MM/yyyy')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-700 font-medium">
                      <span>{item.userName} ({item.department})</span>
                      <span className="text-[11px] text-slate-500">Mã: {item.userId}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                      <span>Tọa độ: {item.location?.lat ? Number(item.location.lat).toFixed(4) : '--'}, {item.location?.lng ? Number(item.location.lng).toFixed(4) : '--'}</span>
                      <span className="text-amber-600 font-semibold flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Đang chờ đồng bộ
                      </span>
                    </div>
                    {item.error && (
                      <p className="text-[11px] text-red-600 bg-red-50 p-1.5 rounded-lg border border-red-100">
                        Lỗi lần thử trước: {item.error}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowOfflineModal(false)}
                className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50"
              >
                Đóng
              </button>
              {offlineQueue.length > 0 && (
                <button
                  type="button"
                  disabled={isSyncingOffline || !isOnline}
                  onClick={async () => {
                    await handleManualSync();
                    if (getOfflineQueue().length === 0) {
                      setShowOfflineModal(false);
                    }
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md ${
                    isOnline
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingOffline ? 'animate-spin' : ''}`} />
                  <span>{isSyncingOffline ? 'Đang đồng bộ...' : 'Đồng bộ tất cả ngay'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN CHỐNG BẤM 2 LẦN LIÊN TỤC GÂY NHẦM RA CA */}
      {showConfirmEarlyOutModal && (
        <div className="fixed inset-0 bg-slate-900/75 z-[130] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border-2 border-amber-300 animate-in zoom-in-95 duration-200 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-4 ring-8 ring-amber-50">
              <AlertTriangle className="w-8 h-8 text-amber-600 animate-bounce" />
            </div>
            
            <h3 className="text-lg font-black text-slate-800 mb-1.5 uppercase">
              Bạn vừa ghi nhận vào ca!
            </h3>
            
            <p className="text-xs text-slate-600 mb-4 leading-relaxed bg-amber-50/70 p-3 rounded-xl border border-amber-200/80">
              Hệ thống phát hiện bạn vừa bấm điểm danh vào ca cách đây ít phút. Để <b>ngăn chặn bấm 2 lần liên tục gây nhầm lẫn</b>, vui lòng xác nhận bạn có thực sự muốn <b>Ghi nhận RA VỀ</b> ngay lúc này không?
            </p>

            <div className="flex flex-col gap-2.5 w-full">
              <button
                type="button"
                onClick={() => setShowConfirmEarlyOutModal(false)}
                className="w-full py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm shadow-md transition-all active:scale-95"
              >
                HỦY BỎ (GIỮ NGUYÊN VÀO CA)
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowConfirmEarlyOutModal(false);
                  handleCheckIn('out', false, true);
                }}
                className="w-full py-2.5 px-4 rounded-xl border-2 border-orange-300 text-orange-600 hover:bg-orange-50 font-bold text-xs transition-colors"
              >
                VẪN MUỐN GHI NHẬN RA VỀ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
