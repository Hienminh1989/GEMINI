import { AdminDashboard } from '../components/AdminDashboard';
import { AttendanceHistory } from '../components/AttendanceHistory';
import { DutyScheduleManager } from '../components/DutyScheduleManager';
import { HospitalDutyScheduleView } from '../components/HospitalDutyScheduleView';
import { DepartmentMonthlyReport } from '../components/DepartmentMonthlyReport';
import { BriefingAdminView } from '../components/BriefingAdminView';

import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import { useAuth } from '../context/AuthContext';
import { db, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, query, getDocs, orderBy, where, limit } from "../lib/db-polyfill";

import { format, startOfMonth, endOfMonth, parseISO, startOfYear, endOfYear, subDays } from 'date-fns';
import { vi } from 'date-fns/locale';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import { AlertTriangle, LogOut, Plus, Trash2, Upload, Download, QrCode, Users, User, Filter, Calendar, BarChart2, Settings, XCircle, FileSpreadsheet, MapPin, Menu, Search, Bell, Home, CheckSquare, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, UserCheck, Clock, Activity, Database, Server, HardDrive, Wifi, Camera , Building, Lock, ShieldCheck, Unlock, CheckCircle, History, X, ArrowRight } from 'lucide-react';
import { AttendanceRecord, AppConfig, UserData } from '../types';
import { getPositionBadgeClass, getVnTodayDateString } from '../lib/format';
import { apiFetch } from '../lib/api';
import { HOSPITAL_DEPARTMENTS } from '../lib/departments';

import { getAccurateLocation } from '../lib/location';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const LiveCountdown = ({ until, onExpire }: { until: string, onExpire?: () => void }) => {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const timer = setInterval(() => {
       const targetDate = new Date(until);
       targetDate.setHours(23, 59, 59, 999);
       const diff = targetDate.getTime() - Date.now();
       
       if (diff <= 0) {
          setTimeLeft('Hết hạn (Sẽ tự xóa)');
          clearInterval(timer);
          if (onExpire) onExpire();
       } else {
          const d = Math.floor(diff / (1000 * 60 * 60 * 24));
          const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          setTimeLeft(`${d > 0 ? d + ' ngày ' : ''}${h}h ${m}m ${s}s`);
       }
    }, 1000);
  
  return () => clearInterval(timer);
  }, [until]);
  return <span className="text-red-500 font-mono font-bold whitespace-nowrap text-xs">{timeLeft}</span>;
};
import { getAccessToken } from '../context/AuthContext';
import { exportToGoogleSheets } from '../lib/googleSheets';
import { LocationMap } from '../components/LocationMap';

// Component trang Quản trị dành cho Admin

export type GroupedUserRecord = {
  _dateStr?: string;
  userId: string;
  userName: string;
  department: string;
  morningIn?: AttendanceRecord;
  morningOut?: AttendanceRecord;
  afternoonIn?: AttendanceRecord;
  afternoonOut?: AttendanceRecord;
  eveningIn?: AttendanceRecord;
  eveningOut?: AttendanceRecord;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  latestTimestamp: number;
  otherRecords?: AttendanceRecord[];
};

const groupRecordsByUser = (records: AttendanceRecord[], sortOrder: 'desc' | 'asc' = 'desc', groupByDate: boolean = false): GroupedUserRecord[] => {
  const userMap: Record<string, GroupedUserRecord> = {};
  // Sort chronological first so we assign shift records accurately
  const sortedRecords = [...records].sort((a, b) => a.timestamp - b.timestamp);

  sortedRecords.forEach(record => {
    const userKey = record.userId ? String(record.userId).trim() : (record.userName ? record.userName.trim().toLowerCase() : 'unknown');
    const key = groupByDate ? `${userKey}_${record.dateStr || ''}` : userKey;
    if (!userMap[key]) {
      userMap[key] = {
        userId: record.userId || '',
        userName: record.userName || 'Chưa rõ',
        department: record.department || '',
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        _dateStr: record.dateStr,
        latestTimestamp: record.timestamp,
        otherRecords: []
      };
    }
    
    const user = userMap[key];
    if (record.timestamp > user.latestTimestamp) {
      user.latestTimestamp = record.timestamp;
    }
    if (record.userName) user.userName = record.userName;
    if (record.department) user.department = record.department;
    if (!user._dateStr && record.dateStr) user._dateStr = record.dateStr;

    if (record.status === 'success') {
       let actualShift = record.shiftId || (record.shift === 'Sáng' ? 'morning' : (record.shift === 'Chiều' ? 'afternoon' : (record.shift === 'Tối' ? 'evening' : '')));
       
       if (!actualShift || actualShift === 'default') {
          const d = new Date(record.timestamp);
          const mins = d.getHours() * 60 + d.getMinutes();
          if (record.type === 'out') {
             // Ra ca: Trước 15:00 (ví dụ 11:20, 11:30, 12:00, 14:00) -> Ra ca Sáng
             if (mins < 15 * 60) actualShift = 'morning';
             else if (mins < 18 * 60 + 30) actualShift = 'afternoon';
             else actualShift = 'evening';
          } else {
             // Vào ca: Trước 12:30 -> Vào ca Sáng
             if (mins < 12 * 60 + 30) actualShift = 'morning';
             else if (mins < 18 * 60) actualShift = 'afternoon';
             else actualShift = 'evening';
          }
       }

       if (actualShift === 'morning') {
         if (record.type === 'in') {
           if (!user.morningIn) user.morningIn = record;
           else user.otherRecords?.push(record);
         } else if (record.type === 'out') {
           user.morningOut = record;
         }
       } else if (actualShift === 'afternoon') {
         if (record.type === 'in') {
           if (!user.afternoonIn) user.afternoonIn = record;
           else user.otherRecords?.push(record);
         } else if (record.type === 'out') {
           user.afternoonOut = record;
         }
       } else if (actualShift === 'evening' || actualShift.startsWith('duty_') || actualShift === 'night_custom' || actualShift === 'custom') {
         if (record.type === 'in') {
           if (!user.eveningIn) user.eveningIn = record;
           else user.otherRecords?.push(record);
         } else if (record.type === 'out') {
           user.eveningOut = record;
         }
       } else {
         user.otherRecords?.push(record);
       }

       if (record.lateMinutes && record.lateMinutes > 0) {
         user.lateMinutes += record.lateMinutes;
       }
       if (record.earlyLeaveMinutes && record.earlyLeaveMinutes > 0) {
         user.earlyLeaveMinutes += record.earlyLeaveMinutes;
       }
    } else {
       user.otherRecords?.push(record);
    }
  });
  
  const grouped = Object.values(userMap);
  grouped.sort((a, b) => {
    if (groupByDate && a._dateStr && b._dateStr && a._dateStr !== b._dateStr) {
      return sortOrder === 'desc' 
        ? b._dateStr.localeCompare(a._dateStr) 
        : a._dateStr.localeCompare(b._dateStr);
    }
    return sortOrder === 'desc' 
      ? b.latestTimestamp - a.latestTimestamp 
      : a.latestTimestamp - b.latestTimestamp;
  });
  return grouped;
}

const removeVietnameseTones = (str: string) => {
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  return str.toLowerCase();
}

export default function Admin() {
  const { logout, signInWithGoogle, userData } = useAuth();
  // Quản lý tab hiện tại đang chọn: 'qr' (Mã QR), 'today' (Hôm nay), 'history' (Lịch sử), 'month' (Tháng này), 'statistics' (Thống kê), 'settings' (Cài đặt)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'qr' | 'today' | 'briefing' | 'history' | 'month' | 'statistics' | 'settings' | 'employees' | 'departments' | 'special_employees' | 'notifications' | 'failed_logs'>('dashboard');
  const [historySelectedUserId, setHistorySelectedUserId] = useState<string>('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const [dutySubTab, setDutySubTab] = useState<'hospital' | 'staff_matrix'>('hospital');
  const [reportSubTab, setReportSubTab] = useState<'department_month' | 'charts'>('department_month');
  const [currentPageToday, setCurrentPageToday] = useState(1);
  const [todayDepartmentFilter, setTodayDepartmentFilter] = useState('');
  const [todayLateFilter, setTodayLateFilter] = useState('');

  const [currentPageMonth, setCurrentPageMonth] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const [specialEmployeesPage, setSpecialEmployeesPage] = useState(1);
  const SPECIAL_EMPLOYEES_PER_PAGE = 10;
  const [specialEmployeeSearch, setSpecialEmployeeSearch] = useState('');

  // States quản lý phân trang và lọc cho tab Lỗi điểm danh
  const [failedCurrentPage, setFailedCurrentPage] = useState(1);
  const [failedPerPage, setFailedPerPage] = useState(15);
  const [failedSearchQuery, setFailedSearchQuery] = useState('');
  const [failedDeptFilter, setFailedDeptFilter] = useState('');
  const [failedTypeFilter, setFailedTypeFilter] = useState<'all' | 'device' | 'range' | 'other'>('all');
  const [failedDateRangeMode, setFailedDateRangeMode] = useState<'today' | 'yesterday' | '7days' | '30days' | 'custom' | 'all'>('today');
  const [failedCustomDate, setFailedCustomDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  
  // State quản lý dữ liệu
  
  const [notifications, setNotifications] = useState<any[]>([]);
  const [newNotif, setNewNotif] = useState({ title: '', content: '', type: 'info' });

  const loadNotifications = async () => {
    try {
      const res = await fetch('/api/notifications?all=true');
      if (res.ok) {
        setNotifications(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'notifications') {
      loadNotifications();
    }
  }, [activeTab]);

  const handleAddNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNotif.title || !newNotif.content) return;
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNotif)
      });
      if (res.ok) {
        setNewNotif({ title: '', content: '', type: 'info' });
        loadNotifications();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleNotification = async (notif: any) => {
    try {
      const res = await fetch(`/api/notifications/${notif.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...notif, is_active: !notif.is_active })
      });
      if (res.ok) loadNotifications();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteNotification = async (id: number) => {
    
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
      if (res.ok) loadNotifications();
    } catch (e) {
      console.error(e);
    }
  };
const [qrToken, setQrToken] = useState('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [failedRecords, setFailedRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<AppConfig>({
    morningStart: '07:00',
    morningEnd: '11:20',
    afternoonStart: '13:30',
    afternoonEnd: '17:00',
    radius: 600,
    targetLat: 19.867470,
    targetLng: 105.676898
  });
  
  // State quản lý Modal thêm/sửa bản ghi
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<Partial<AttendanceRecord> | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveConfigSuccess, setSaveConfigSuccess] = useState('');
  const [gettingAdminGps, setGettingAdminGps] = useState(false);
  const [mapModalRecord, setMapModalRecord] = useState<AttendanceRecord | null>(null);
  const [detailsModalUser, setDetailsModalUser] = useState<{userId: string, userName: string, dateStr: string} | null>(null);
  const [dashboardTimeRange, setDashboardTimeRange] = useState<number>(7);
  
  // Trạng thái lưu thời gian hiện tại
  const [currentTime, setCurrentTime] = useState(new Date());
    const [departments, setDepartments] = useState<{id: string, name: string}[]>(() => {
      try {
        const cached = localStorage.getItem('cached_departments');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
      return HOSPITAL_DEPARTMENTS;
    });
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [deleteUserConfirmId, setDeleteUserConfirmId] = useState<string | null>(null);
  const [deleteDeptConfirmId, setDeleteDeptConfirmId] = useState<string | null>(null);
  const [deleteUserDayConfirmId, setDeleteUserDayConfirmId] = useState<string | null>(null);
  const [userDevices, setUserDevices] = useState<any[]>([]);
  const [unbindConfirmId, setUnbindConfirmId] = useState<string | null>(null);
  const [unbindingUserId, setUnbindingUserId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [selectedEmployeeToDesignate, setSelectedEmployeeToDesignate] = useState<string>('');

  const handleAddDesignatedUnlocker = () => {
    if (!selectedEmployeeToDesignate) return;
    const user = users.find(u => u.uid === selectedEmployeeToDesignate);
    if (!user) return;
    const currentList = config.designatedUnlockers || [];
    if (currentList.some(d => d.uid === user.uid)) return;
    const updatedList = [
      ...currentList,
      { uid: user.uid, name: user.name, department: user.department || '' }
    ];
    setConfig({ ...config, designatedUnlockers: updatedList });
    setSelectedEmployeeToDesignate('');
  };

  const handleRemoveDesignatedUnlocker = (uid: string) => {
    const currentList = config.designatedUnlockers || [];
    setConfig({
      ...config,
      designatedUnlockers: currentList.filter(d => d.uid !== uid)
    });
  };

  const handleUnbindDevice = async (userId: string, userName: string, fingerprint?: string) => {
    setUnbindingUserId(userId || userName);
    try {
      const res = await fetch('/api/user_devices/unbind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userName, fingerprint })
      });
      if (res.ok) {
        setUserDevices(prev => prev.filter(d => 
          (userId && d.user_id !== userId) && 
          (userName && d.user_name?.toLowerCase() !== userName.toLowerCase()) &&
          (!fingerprint || d.device_fingerprint !== fingerprint)
        ));
        setUnbindConfirmId(null);
        setActionToast({
          message: `Đã mở khóa thiết bị thành công cho nhân viên "${userName || userId}". Nhân viên có thể sử dụng máy mới để điểm danh.`,
          type: 'success'
        });
        setTimeout(() => setActionToast(null), 5000);
        await fetchUsers();
        await fetchFailedRecords();
      } else {
        const data = await res.json().catch(() => ({}));
        setActionToast({
          message: data.error || 'Lỗi khi mở khóa thiết bị.',
          type: 'error'
        });
        setTimeout(() => setActionToast(null), 5000);
      }
    } catch (e: any) {
      setActionToast({
        message: 'Lỗi kết nối máy chủ: ' + e.message,
        type: 'error'
      });
      setTimeout(() => setActionToast(null), 5000);
    } finally {
      setUnbindingUserId(null);
    }
  };

  const fetchDepartments = async () => {
    setLoadingDepartments(true);
    try {
      const res = await fetch(`/api/departments?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setDepartments(data);
          try { localStorage.setItem('cached_departments', JSON.stringify(data)); } catch (e) {}
          setLoadingDepartments(false);
          return;
        }
      }
      // Fallback nếu API trống: thử qua Firestore hoặc cache
      const q = query(collection(db, 'departments'), orderBy('name', 'asc'));
      const querySnapshot = await getDocs(q);
      const data: {id: string, name: string}[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as {id: string, name: string});
      });
      if (data.length > 0) {
        setDepartments(data);
      } else {
        const cached = localStorage.getItem('cached_departments');
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) setDepartments(parsed);
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn('Lỗi khi lấy danh sách khoa/phòng:', e);
      const cached = localStorage.getItem('cached_departments');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) setDepartments(parsed);
        } catch (err) {}
      }
    }
    setLoadingDepartments(false);
  };

  const [editingDepartment, setEditingDepartment] = useState<{id: string, name: string} | null>(null);

  const handleSaveDepartment = async (e: React.FormEvent) => {
    setErrorMessage(null);
    e.preventDefault();
    if (!editingDepartment || !editingDepartment.name.trim()) return;
    try {
      const res = await fetch(`/api/departments/${editingDepartment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingDepartment.name.trim() })
      });
      if (!res.ok) {
        try {
          await updateDoc(doc(db, 'departments', editingDepartment.id), { name: editingDepartment.name.trim() });
        } catch (fErr) {}
      }
      setEditingDepartment(null);
      fetchDepartments();
    } catch (error) {
      console.warn('Lỗi cập nhật khoa/phòng:', error);
      setErrorMessage('Lỗi cập nhật khoa/phòng: ' + (error as any).message);
    }
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    setErrorMessage(null);
    e.preventDefault();
    if (!newDepartmentName.trim()) return;
    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDepartmentName.trim() })
      });
      if (!res.ok) {
        try {
          await addDoc(collection(db, 'departments'), { name: newDepartmentName.trim() });
        } catch (fErr) {}
      }
      setNewDepartmentName('');
      fetchDepartments();
    } catch (error) {
      console.warn('Lỗi thêm khoa/phòng:', error);
      setErrorMessage('Lỗi thêm khoa/phòng: ' + (error as any).message);
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/departments/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        try {
          await deleteDoc(doc(db, 'departments', id));
        } catch (fErr) {}
      }
      fetchDepartments();
      setDeleteDeptConfirmId(null);
    } catch (error) {
      console.warn('Lỗi xóa khoa/phòng:', error);
      setErrorMessage('Lỗi xóa khoa/phòng: ' + (error as any).message);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    setErrorMessage(null);
    try {
      await fetch('/api/users/' + uid, { method: 'DELETE' });
      fetchUsers();
      setDeleteUserConfirmId(null);
    } catch (error) {
      console.warn('Lỗi xóa nhân sự:', error);
      setErrorMessage('Lỗi xóa nhân sự.');
    }
  };

  const effectiveRole = userData?.role || 'employee';
  const canView = !!userData && userData?.permissions?.view !== false;
  const canEdit = effectiveRole === 'super_admin' || (effectiveRole === 'admin' && userData?.permissions?.edit !== false);
  const canDelete = effectiveRole === 'super_admin' || (effectiveRole === 'admin' && userData?.permissions?.delete !== false);

  const [usersFilterDept, setUsersFilterDept] = useState<string>('');
  const [usersFilterStatus, setUsersFilterStatus] = useState<'all' | 'active' | 'hidden'>('all');
  const [usersSearchQuery, setUsersSearchQuery] = useState<string>('');
  const [usersCurrentPage, setUsersCurrentPage] = useState<number>(1);
  const usersPerPage = 10;
  const [departmentsCurrentPage, setDepartmentsCurrentPage] = useState<number>(1);
  const departmentsPerPage = 10;
  const [users, setUsers] = useState<UserData[]>([]);
  const [specialEmployees, setSpecialEmployees] = useState<any[]>([]);
  const [newSpecialEmployee, setNewSpecialEmployee] = useState({ user_name: '', department: '', employee_type: 'Nuôi con nhỏ', early_minutes: 30, period_type: 'always', custom_start_time: '', custom_end_time: '', valid_from: '', valid_until: '', countdown_minutes: 60 });
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [lockingUser, setLockingUser] = useState<UserData | null>(null);
  const [lockReasonChoice, setLockReasonChoice] = useState<string>('Nghỉ việc');
  const [customLockReason, setCustomLockReason] = useState<string>('');
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ 
    uid: '',
    name: '',
    username: '',
    password: '',
    department: '',
    position: 'Nhân viên',
    role: 'employee', 
    permissions: { view: true, edit: false, delete: false } 
  });

  const getNextAvailableEmployeeId = (userList: UserData[]): string => {
    const numericIds = userList
      .map(u => parseInt(String(u.uid).trim(), 10))
      .filter(n => !isNaN(n) && n > 0 && n < 1000000);
    if (numericIds.length === 0) return '101';
    const maxId = Math.max(...numericIds);
    return String(maxId + 1);
  };

  const handleOpenAddUserModal = () => {
    setErrorMessage(null);
    const nextId = getNextAvailableEmployeeId(users);
    setNewUserForm({
      uid: nextId,
      name: '',
      username: '',
      password: '',
      department: departments[0]?.name || '',
      position: 'Nhân viên',
      role: 'employee',
      permissions: { view: true, edit: false, delete: false }
    });
    setIsAddUserModalOpen(true);
  };

  const handleToggleLockUser = async (u: UserData, willLock: boolean, reason?: string) => {
    setErrorMessage(null);
    try {
      const finalReason = willLock ? (reason || 'Nghỉ việc / Tạm nghỉ') : '';
      const res = await apiFetch(`/api/users/${u.uid}/toggle_lock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_hidden: willLock,
          status: willLock ? 'inactive' : 'active',
          lock_reason: finalReason
        })
      });
      if (!res.ok) {
        throw new Error(res.error || 'Lỗi khi cập nhật trạng thái');
      }
      setLockingUser(null);
      fetchUsers();
    } catch (e: any) {
      console.warn('Lỗi khóa/mở khóa nhân sự:', e);
      setErrorMessage('Lỗi khi thay đổi trạng thái nhân sự: ' + e.message);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    setErrorMessage(null);
    e.preventDefault();
    if (!newUserForm.name.trim()) {
      setErrorMessage('Vui lòng nhập Tên nhân viên.');
      return;
    }

    const enteredUid = (newUserForm.uid || '').trim();
    if (!enteredUid) {
      setErrorMessage('Vui lòng nhập ID mã nhân viên.');
      return;
    }
    if (!/^\d+$/.test(enteredUid)) {
      setErrorMessage('ID mã nhân viên bắt buộc phải là số (Ví dụ: 102, 314, 490).');
      return;
    }

    // Kiểm tra trùng mã nhân viên
    const duplicate = users.find(u => String(u.uid).trim() === enteredUid);
    if (duplicate) {
      setErrorMessage(`ID mã nhân viên "${enteredUid}" đã tồn tại cho nhân viên "${duplicate.name}". Vui lòng chọn mã khác.`);
      return;
    }

    try {
      const username = (newUserForm.username.trim() || enteredUid).toLowerCase();
      const email = username.includes('@') ? username : username + '@local.app';
      
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: enteredUid,
          email,
          name: newUserForm.name.trim(),
          role: newUserForm.role || 'employee',
          permissions: newUserForm.role === 'admin' ? newUserForm.permissions : undefined,
          department: newUserForm.department,
          position: newUserForm.position || 'Nhân viên',
          password: newUserForm.password || '123456'
        })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Lỗi tạo nhân sự');
      }

      setIsAddUserModalOpen(false);
      setNewUserForm({ uid: '', name: '', username: '', password: '', department: '', position: 'Nhân viên', role: 'employee', permissions: { view: true, edit: false, delete: false } });
      fetchUsers();
    } catch (error: any) {
      console.warn('Lỗi tạo nhân sự:', error);
      setErrorMessage(error.message || 'Lỗi tạo nhân sự. Username hoặc Mã nhân viên này có thể đã tồn tại.');
    }
  };

  // Hook cập nhật thời gian mỗi giây
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Lấy chuỗi ngày hiện tại định dạng YYYY-MM-DD theo múi giờ Việt Nam
  const [dateStr, setDateStr] = useState(getVnTodayDateString());
  const [todayDateMode, setTodayDateMode] = useState<'single' | 'range'>('single');
  const [todayRangePreset, setTodayRangePreset] = useState<'today' | 'yesterday' | '7days' | '30days' | 'this_month' | 'custom'>('7days');
  const [todayStartDate, setTodayStartDate] = useState<string>(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [todayEndDate, setTodayEndDate] = useState<string>(getVnTodayDateString());
  const [todayUserFilter, setTodayUserFilter] = useState<string>('');
  const [todaySearchText, setTodaySearchText] = useState('');
  const [todaySortOrder, setTodaySortOrder] = useState<'desc' | 'asc'>('desc');
  const [itemsPerPageToday, setItemsPerPageToday] = useState<number>(20);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());

  const handleSelectTodayRangePreset = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'this_month') => {
    setTodayRangePreset(preset);
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    if (preset === 'today') {
      setTodayStartDate(todayStr);
      setTodayEndDate(todayStr);
    } else if (preset === 'yesterday') {
      const yestStr = format(subDays(today, 1), 'yyyy-MM-dd');
      setTodayStartDate(yestStr);
      setTodayEndDate(yestStr);
    } else if (preset === '7days') {
      setTodayStartDate(format(subDays(today, 6), 'yyyy-MM-dd'));
      setTodayEndDate(todayStr);
    } else if (preset === '30days') {
      setTodayStartDate(format(subDays(today, 29), 'yyyy-MM-dd'));
      setTodayEndDate(todayStr);
    } else if (preset === 'this_month') {
      setTodayStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
      setTodayEndDate(todayStr);
    }
    setCurrentPageToday(1);
  };
  
  // Re-fetch when date or filter changes
  useEffect(() => {
    if (activeTab === 'today') {
      fetchTodayRecords();
    }
  }, [dateStr, todayDateMode, todayStartDate, todayEndDate, todayUserFilter]);
  const [appUrl, setAppUrl] = useState(typeof window !== 'undefined' ? window.location.origin.replace('ais-dev-', 'ais-pre-') : 'http://localhost:3000');
  useEffect(() => {
    fetch('/api/env').then(res => res.json()).then(data => {
      if (data.appUrl) {
        setAppUrl(data.appUrl.replace('ais-dev-', 'ais-pre-'));
      } else {
        const originUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        setAppUrl(originUrl.replace('ais-dev-', 'ais-pre-'));
      }
    }).catch(() => {});
  }, []);

  // Chạy các hàm fetch dữ liệu tương ứng khi đổi tab
  useEffect(() => {
    fetchConfig(); // Always fetch config
    fetchUsers(); // Always fetch users to populate dropdowns
    fetchDepartments(); // Always fetch departments to populate dropdowns
    fetchSpecialEmployees(); // Always fetch special employees
    if (activeTab === 'dashboard') { fetchDashboardRecords(dashboardTimeRange); } else if (activeTab === 'qr') {
      initDailyQR();
    } else if (activeTab === 'today') {
      fetchTodayRecords();
    } else if (activeTab === 'month') {
      fetchMonthRecords();
    } else if (activeTab === 'statistics') {
      fetchStatisticsRecords();
    } else if (activeTab === 'failed_logs') {
      fetchFailedRecords();
    }
  }, [activeTab]);

  // Khởi tạo hoặc lấy token QR cho ngày hôm nay
  const initDailyQR = async () => {
    setLoading(true);
    let currentToken = '';
    try {
      const qrDoc = await getDoc(doc(db, 'qr_codes', 'main'));
      if (qrDoc.exists()) {
        currentToken = qrDoc.data().token;
      }
    } catch (e) {
      console.warn('Lỗi đọc qr_codes:', e);
    }

    if (currentToken) {
      setQrToken(currentToken);
    } else {
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      setQrToken(token);
      try {
        await setDoc(doc(db, 'qr_codes', 'main'), { token, dateStr: 'main' });
      } catch (e) {
        console.warn('Lỗi lưu qr_codes:', e);
      }
    }
    setLoading(false);
  };


  // Lấy danh sách điểm danh cho Dashboard theo timeRange
  const fetchDashboardRecords = async (range: number = dashboardTimeRange, silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const start = subDays(new Date(), range).getTime();
      const res = await fetch(`/api/attendance?_t=${Date.now()}&startTimestamp=${start}&orderByStr=desc`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (e) {
      console.warn('Lỗi fetchDashboardRecords:', e);
    }
    if (!silent) setLoading(false);
  };

  // Lấy danh sách điểm danh lỗi
  const fetchFailedRecords = async (mode = failedDateRangeMode, customDate = failedCustomDate, silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      let queryParams = `_t=${Date.now()}&orderByStr=desc`;
      const todayFormatted = format(new Date(), 'yyyy-MM-dd');
      
      if (mode === 'today') {
        queryParams += `&dateStr=${todayFormatted}`;
      } else if (mode === 'yesterday') {
        queryParams += `&dateStr=${format(subDays(new Date(), 1), 'yyyy-MM-dd')}`;
      } else if (mode === '7days') {
        queryParams += `&startDate=${format(subDays(new Date(), 7), 'yyyy-MM-dd')}`;
      } else if (mode === '30days') {
        queryParams += `&startDate=${format(subDays(new Date(), 30), 'yyyy-MM-dd')}`;
      } else if (mode === 'custom') {
        queryParams += `&dateStr=${customDate || todayFormatted}`;
      } else if (mode === 'all') {
        // Không giới hạn ngày
      }

      const res = await fetch(`/api/attendance_failed?${queryParams}`);
      if (res.ok) {
        const data = await res.json();
        setFailedRecords(data);
      }
    } catch (e) {
      console.warn('Lỗi fetchFailedRecords:', e);
    }
    if (!silent) setLoading(false);
  };

  const fetchTodayRecords = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      let queryParams = `_t=${Date.now()}&orderByStr=desc`;
      if (todayDateMode === 'single') {
        queryParams += `&dateStr=${dateStr}`;
      } else {
        if (todayStartDate) queryParams += `&startDate=${todayStartDate}`;
        if (todayEndDate) queryParams += `&endDate=${todayEndDate}`;
      }
      if (todayUserFilter) {
        queryParams += `&userId=${encodeURIComponent(todayUserFilter)}`;
        const matchedUser = users.find(u => u.uid === todayUserFilter);
        if (matchedUser?.name) {
          queryParams += `&userName=${encodeURIComponent(matchedUser.name)}`;
        }
      }
      const res = await fetch(`/api/attendance?${queryParams}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
        setLastSyncTime(new Date());
      }
    } catch (e) {
      console.warn('Lỗi fetchTodayRecords:', e);
    }
    if (!silent) setLoading(false);
  };

  // Real-time automatic background polling
  useEffect(() => {
    let intervalId: any = null;
    if (activeTab === 'dashboard') {
      intervalId = setInterval(() => {
        fetchDashboardRecords(dashboardTimeRange, true);
      }, 4000);
    } else if (activeTab === 'today') {
      intervalId = setInterval(() => {
        fetchTodayRecords(true);
      }, 3000); // 3-second rapid polling for smooth real-time sync during peak check-in
    } else if (activeTab === 'failed_logs') {
      intervalId = setInterval(() => {
        fetchFailedRecords(failedDateRangeMode, failedCustomDate, true);
      }, 5000);
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (activeTab === 'today') {
          fetchTodayRecords(true);
        } else if (activeTab === 'dashboard') {
          fetchDashboardRecords(dashboardTimeRange, true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [activeTab, dashboardTimeRange, dateStr, todayDateMode, todayStartDate, todayEndDate, todayUserFilter, failedDateRangeMode, failedCustomDate]);

  // Lấy danh sách điểm danh trong tháng hiện tại

  const fetchStatisticsRecords = async () => {
    setLoading(true);
    try {
      const start = startOfYear(new Date()).getTime();
      const end = endOfYear(new Date()).getTime();
      const res = await fetch(`/api/attendance?_t=${Date.now()}&startTimestamp=${start}&endTimestamp=${end}&orderByStr=desc`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (e) {
      console.warn('Lỗi fetchStatisticsRecords:', e);
    }
    setLoading(false);
  };

  const fetchMonthRecords = async () => {
    setLoading(true);
    try {
      const start = startOfMonth(new Date()).getTime();
      const end = endOfMonth(new Date()).getTime();
      const res = await fetch(`/api/attendance?_t=${Date.now()}&startTimestamp=${start}&endTimestamp=${end}&orderByStr=desc`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (e) {
      console.warn('Lỗi fetchMonthRecords:', e);
    }
    setLoading(false);
  };

  // Hàm xử lý xóa bản ghi điểm danh
  const handleDelete = async (id: string) => {
    console.log('handleDelete called with id:', id);
    try {
      await deleteDoc(doc(db, 'attendance', id));
      
      // Xóa khỏi state ngay lập tức để UI cập nhật tức thì
      setRecords(prev => prev.filter(r => r.id !== id));
      
      // Sau đó fetch lại từ server
      if (activeTab === 'today') fetchTodayRecords();
      else if (activeTab === 'month') fetchMonthRecords(); else if (activeTab === 'statistics') fetchStatisticsRecords();
      
      // If details modal is open for this user, we don't need to close it, as it will auto-update or show empty.
      setDeleteConfirmId(null); // Tắt trạng thái xác nhận xóa
    } catch (e) {
      console.warn('Lỗi handleDelete:', e);
      
      setErrorMessage("Lỗi khi xóa: " + (e as any).message);
      setDeleteConfirmId(null);
    }
  };

  
  const handleDeleteUserDayRecords = async (userId: string, dateStr: string) => {
    console.log('handleDeleteUserDayRecords called', userId, dateStr);
    // window.confirm removed, using UI state
    try {
      const recordsToDelete = records.filter(r => r.userId === userId && r.dateStr === dateStr);
      console.log('Deleting records:', recordsToDelete, 'for user:', userId, 'date:', dateStr);
      
      const deletedIds = new Set();
      for (const record of recordsToDelete) {
        if (record.id) {
          await deleteDoc(doc(db, 'attendance', record.id));
          deletedIds.add(record.id);
        }
      }
      
      // Xóa khỏi state ngay lập tức
      setRecords(prev => prev.filter(r => !deletedIds.has(r.id)));
      
      if (activeTab === 'today') fetchTodayRecords();
      else if (activeTab === 'month') fetchMonthRecords(); else if (activeTab === 'statistics') fetchStatisticsRecords();
    } catch (e) {
      console.warn('Lỗi handleDeleteUserDayRecords:', e);
      
      setErrorMessage("Lỗi khi xóa: " + (e as any).message);
    }
  };
// Fetch cấu hình

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/users?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
      const devRes = await fetch(`/api/user_devices?_t=${Date.now()}`);
      if (devRes.ok) {
        const devData = await devRes.json();
        setUserDevices(devData);
      }
    } catch (e) {
      console.warn('Lỗi khi lấy danh sách nhân sự & thiết bị:', e);
    }
    setLoadingUsers(false);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    setErrorMessage(null);
    e.preventDefault();
    if (!editingUser) return;
    try {
      await fetch('/api/users/' + editingUser.uid, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingUser)
      });
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      console.warn('Lỗi cập nhật nhân sự:', error);
      setErrorMessage('Lỗi cập nhật nhân sự.');
    }
  };

  const [unlockingAllDevices, setUnlockingAllDevices] = useState(false);
  const [showUnlockAllConfirm, setShowUnlockAllConfirm] = useState(false);

  const handleUnlockAllDevices = async () => {
    setShowUnlockAllConfirm(false);
    setUnlockingAllDevices(true);
    try {
      const res = await apiFetch('/api/user_devices/clear_all', { method: 'POST' });
      if (res.ok) {
        setActionToast({ message: "Đã mở khóa toàn bộ thiết bị thành công!", type: 'success' });
        setTimeout(() => setActionToast(null), 5000);
        fetchUsers();
      } else {
        setActionToast({ message: "Lỗi khi mở khóa: " + (res.error || "Không rõ nguyên nhân"), type: 'error' });
        setTimeout(() => setActionToast(null), 5000);
      }
    } catch (e: any) {
      setActionToast({ message: "Lỗi: " + e.message, type: 'error' });
      setTimeout(() => setActionToast(null), 5000);
    } finally {
      setUnlockingAllDevices(false);
    }
  };

  const fetchConfig = async () => {
    try {
      let data: any = null;
      try {
        const res = await apiFetch<AppConfig>('/api/settings/config');
        if (res.ok && res.data) {
          data = res.data;
        }
      } catch (err) {
        console.warn('Postgres fetch config err:', err);
      }

      if (!data) {
        const docRef = doc(db, 'settings', 'config');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          data = docSnap.data();
        }
      }

      if (data) {
        setConfig({
          morningStart: data.morningStart || '07:30',
          morningEnd: data.morningEnd || '11:20',
          afternoonStart: data.afternoonStart || '13:30',
          afternoonEnd: data.afternoonEnd || '17:00',
          radius: data.radius !== undefined && data.radius !== null && data.radius !== '' ? Number(data.radius) : 600,
          targetLat: data.targetLat !== undefined && data.targetLat !== null && data.targetLat !== '' ? Number(data.targetLat) : 19.867470,
          targetLng: data.targetLng !== undefined && data.targetLng !== null && data.targetLng !== '' ? Number(data.targetLng) : 105.676898,
          logoBase64: data.logoBase64,
          enableDeviceLock: data.enableDeviceLock !== false,
          allowDesktopCheckIn: data.allowDesktopCheckIn !== false,
          designatedUnlockers: Array.isArray(data.designatedUnlockers) ? data.designatedUnlockers : [],
        });
      }
    } catch (e) {
      console.warn('Lỗi khi lấy cài đặt:', e);
    }
  };

  // Lưu cấu hình
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setSaveConfigSuccess('');
    setErrorMessage(null);
    try {
      const configToSave: AppConfig = {
        morningStart: config.morningStart || '07:30',
        morningEnd: config.morningEnd || '11:20',
        afternoonStart: config.afternoonStart || '13:30',
        afternoonEnd: config.afternoonEnd || '17:00',
        radius: Number(config.radius) > 0 ? Number(config.radius) : 600,
        targetLat: Number(config.targetLat) || 19.867470,
        targetLng: Number(config.targetLng) || 105.676898,
        logoBase64: config.logoBase64,
        enableDeviceLock: config.enableDeviceLock !== false,
        allowDesktopCheckIn: config.allowDesktopCheckIn !== false,
        designatedUnlockers: config.designatedUnlockers || [],
      };
      await setDoc(doc(db, 'settings', 'config'), configToSave);
      try {
        await apiFetch('/api/settings/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configToSave)
        });
      } catch(e) { console.warn('Postgres save config err:', e); }
      setConfig(configToSave);
      setSaveConfigSuccess('Lưu cài đặt thành công! Khung giờ, toạ độ, quyền mở khóa và bán kính mới đã được cập nhật.');
      setTimeout(() => setSaveConfigSuccess(''), 4000);
    } catch (error: any) {
      console.warn('Lỗi lưu cài đặt:', error);
      setErrorMessage('Không thể lưu cài đặt: ' + (error?.message || 'Lỗi không xác định'));
    }
    setSavingConfig(false);
  };

  // Lấy GPS hiện tại cho Admin làm vị trí tâm
  const handleGetCurrentGpsForAdmin = async () => {
    setGettingAdminGps(true);
    setErrorMessage(null);
    try {
      const position = await getAccurateLocation();
      const lat = Number(position.coords.latitude.toFixed(6));
      const lng = Number(position.coords.longitude.toFixed(6));
      setConfig(prev => ({
        ...prev,
        targetLat: lat,
        targetLng: lng
      }));
      setSaveConfigSuccess(`Đã tự động lấy toạ độ vị trí hiện tại của bạn: Lat ${lat}, Lng ${lng}. Hãy nhấn 'Lưu Cài Đặt' để áp dụng!`);
    } catch (err: any) {
      console.warn('Lỗi lấy GPS cho admin:', err);
      setErrorMessage('Không thể lấy vị trí GPS: ' + (err.message || 'Vui lòng kiểm tra quyền truy cập vị trí.'));
    } finally {
      setGettingAdminGps(false);
    }
  };

  // Hàm xử lý lưu bản ghi (thêm mới hoặc sửa đổi)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRecord) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const rawData = {
        ...currentRecord,
        timestamp: currentRecord.timestamp || Date.now(),
        dateStr: currentRecord.dateStr || format(new Date(), 'yyyy-MM-dd'),
      };
      const recordData = Object.fromEntries(Object.entries(rawData).filter(([_, v]) => v !== undefined));
      
      if (currentRecord.id) {
        // Cập nhật nếu đã có ID
        await updateDoc(doc(db, 'attendance', currentRecord.id), recordData);
      } else {
        // Thêm mới nếu chưa có ID
        await addDoc(collection(db, 'attendance'), recordData);
      }
      setIsEditModalOpen(false);
      setCurrentRecord(null);
      // Cập nhật lại danh sách
      if (activeTab === 'today') fetchTodayRecords();
      else if (activeTab === 'month') fetchMonthRecords(); else if (activeTab === 'statistics') fetchStatisticsRecords();
    } catch (e) {
      console.warn('Lỗi handleSave:', e);
      setErrorMessage("Lỗi khi lưu: " + (e as any).message);
    }
    setLoading(false);
  };

  // Hàm xử lý xuất dữ liệu ra tệp Excel sử dụng thư viện xlsx
  const fetchSpecialEmployees = async () => {
    try {
      const res = await fetch(`/api/special_employees?_t=${Date.now()}`);
      if (res.ok) setSpecialEmployees(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddSpecialEmployee = async () => {
    if (!newSpecialEmployee.user_name || !newSpecialEmployee.department) return;
    try {
      let payload = { ...newSpecialEmployee };
      // ensure daily uses valid_from for both
      if (payload.period_type === 'daily' && payload.valid_from) {
        payload.valid_until = payload.valid_from;
      }
      
      const res = await fetch('/api/special_employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setNewSpecialEmployee({ user_name: '', department: '', employee_type: 'Nuôi con nhỏ', early_minutes: 30, period_type: 'always', custom_start_time: '', custom_end_time: '', valid_from: '', valid_until: '', countdown_minutes: 60 });
        fetchSpecialEmployees();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteSpecialEmployee = async (id: string) => {
    try {
      const res = await fetch('/api/special_employees/' + id, { method: 'DELETE' });
      if (res.ok) fetchSpecialEmployees();
    } catch (e) {
      console.error(e);
    }
  };

  const [showTodayExportMenu, setShowTodayExportMenu] = useState(false);
  const [showEmployeeExportMenu, setShowEmployeeExportMenu] = useState(false);

  const exportToExcel = (includeAbsent: boolean = false) => {
    const isRange = todayDateMode === 'range';
    // Group records for the current date/range by user
    const grouped = groupRecordsByUser(records, todaySortOrder, isRange);
    const groupedMap = new Map<string, GroupedUserRecord>();
    grouped.forEach(g => {
      const userKey = g.userId ? String(g.userId).trim() : (g.userName ? g.userName.trim().toLowerCase() : '');
      const key = isRange ? `${userKey}_${g._dateStr || ''}` : userKey;
      if (key) groupedMap.set(key, g);
    });

    const getTimesAndStatus = (g?: GroupedUserRecord) => {
      let statusStr = "Chưa điểm danh";
      let morningInTime = "";
      let morningOutTime = "";
      let afternoonInTime = "";
      let afternoonOutTime = "";

      if (g) {
        if (g.morningIn) {
          morningInTime = format(new Date(g.morningIn.timestamp), 'HH:mm:ss');
        }
        if (g.morningOut) {
          morningOutTime = format(new Date(g.morningOut.timestamp), 'HH:mm:ss');
        }
        if (g.afternoonIn) {
          afternoonInTime = format(new Date(g.afternoonIn.timestamp), 'HH:mm:ss');
        }
        if (g.afternoonOut) {
          afternoonOutTime = format(new Date(g.afternoonOut.timestamp), 'HH:mm:ss');
        }

        const hasAnyRecord = g.morningIn || g.morningOut || g.afternoonIn || g.afternoonOut || g.eveningIn || g.eveningOut || (g.otherRecords && g.otherRecords.length > 0);
        if (!hasAnyRecord) {
          statusStr = "Chưa điểm danh";
        } else if (g.lateMinutes > 0 && g.earlyLeaveMinutes > 0) {
          statusStr = `Đi muộn (${g.lateMinutes}p) & Về sớm (${g.earlyLeaveMinutes}p)`;
        } else if (g.lateMinutes > 0) {
          statusStr = `Đi muộn (${g.lateMinutes}p)`;
        } else if (g.earlyLeaveMinutes > 0) {
          statusStr = `Về sớm (${g.earlyLeaveMinutes}p)`;
        } else {
          statusStr = "Đúng giờ";
        }
      }

      return { statusStr, morningInTime, morningOutTime, afternoonInTime, afternoonOutTime };
    };

    let exportRows: Array<{
      dateStr?: string;
      userId: string;
      userName: string;
      department: string;
      status: string;
      morningInTime: string;
      morningOutTime: string;
      afternoonInTime: string;
      afternoonOutTime: string;
    }> = [];

    if (includeAbsent && !isRange && users && users.length > 0) {
      let baseUsers = [...users];
      if (todayDepartmentFilter) {
        baseUsers = baseUsers.filter(u => u.department === todayDepartmentFilter);
      }
      if (todaySearchText.trim()) {
        const q = todaySearchText.trim().toLowerCase();
        baseUsers = baseUsers.filter(u => 
          (u.name && u.name.toLowerCase().includes(q)) || 
          (u.uid && String(u.uid).toLowerCase().includes(q)) ||
          (u.department && u.department.toLowerCase().includes(q))
        );
      }

      baseUsers.forEach(u => {
        const key = u.uid ? String(u.uid).trim() : (u.name ? u.name.trim().toLowerCase() : '');
        const g = groupedMap.get(key);
        if (g) {
          const { statusStr, morningInTime, morningOutTime, afternoonInTime, afternoonOutTime } = getTimesAndStatus(g);
          exportRows.push({
            dateStr: g._dateStr,
            userId: u.uid || g.userId,
            userName: u.name || g.userName,
            department: u.department || g.department || 'Chưa cập nhật',
            status: statusStr,
            morningInTime,
            morningOutTime,
            afternoonInTime,
            afternoonOutTime
          });
        } else {
          exportRows.push({
            dateStr: dateStr,
            userId: u.uid,
            userName: u.name,
            department: u.department || 'Chưa cập nhật',
            status: 'Chưa điểm danh',
            morningInTime: '',
            morningOutTime: '',
            afternoonInTime: '',
            afternoonOutTime: ''
          });
        }
      });

      // Also include any user who checked in but was not in users state
      grouped.forEach(g => {
        const key = g.userId ? String(g.userId).trim() : (g.userName ? g.userName.trim().toLowerCase() : '');
        const exists = baseUsers.some(u => (u.uid ? String(u.uid).trim() : (u.name ? u.name.trim().toLowerCase() : '')) === key);
        if (!exists) {
          if (todayDepartmentFilter && g.department !== todayDepartmentFilter) return;
          if (todaySearchText.trim()) {
            const q = todaySearchText.trim().toLowerCase();
            const match = (g.userName && g.userName.toLowerCase().includes(q)) || 
                          (g.userId && String(g.userId).toLowerCase().includes(q)) ||
                          (g.department && g.department.toLowerCase().includes(q));
            if (!match) return;
          }
          const { statusStr, morningInTime, morningOutTime, afternoonInTime, afternoonOutTime } = getTimesAndStatus(g);
          exportRows.push({
            dateStr: g._dateStr,
            userId: g.userId,
            userName: g.userName,
            department: g.department || 'Chưa cập nhật',
            status: statusStr,
            morningInTime,
            morningOutTime,
            afternoonInTime,
            afternoonOutTime
          });
        }
      });
    } else {
      let filteredGrouped = [...grouped];
      if (todayUserFilter) {
        const targetUser = users.find(u => u.uid === todayUserFilter);
        const targetName = targetUser?.name?.trim().toLowerCase();
        filteredGrouped = filteredGrouped.filter(u => 
          u.userId === todayUserFilter || 
          (targetName && u.userName && u.userName.trim().toLowerCase() === targetName)
        );
      }
      if (todayDepartmentFilter) {
        filteredGrouped = filteredGrouped.filter(u => u.department === todayDepartmentFilter);
      }
      if (todayLateFilter === 'late_morning') {
        filteredGrouped = filteredGrouped.filter(u => u.morningIn && u.morningIn.lateMinutes && u.morningIn.lateMinutes > 0);
      } else if (todayLateFilter === 'late_afternoon') {
        filteredGrouped = filteredGrouped.filter(u => u.afternoonIn && u.afternoonIn.lateMinutes && u.afternoonIn.lateMinutes > 0);
      }
      if (todaySearchText.trim()) {
        const q = todaySearchText.trim().toLowerCase();
        filteredGrouped = filteredGrouped.filter(u => 
          (u.userName && u.userName.toLowerCase().includes(q)) || 
          (u.userId && String(u.userId).toLowerCase().includes(q)) ||
          (u.department && u.department.toLowerCase().includes(q))
        );
      }

      filteredGrouped.forEach(g => {
        const { statusStr, morningInTime, morningOutTime, afternoonInTime, afternoonOutTime } = getTimesAndStatus(g);
        exportRows.push({
          dateStr: g._dateStr,
          userId: g.userId,
          userName: g.userName,
          department: g.department || 'Chưa cập nhật',
          status: statusStr,
          morningInTime,
          morningOutTime,
          afternoonInTime,
          afternoonOutTime
        });
      });
    }

    if (exportRows.length === 0) {
      alert('Không có dữ liệu điểm danh phù hợp để xuất file Excel.');
      return;
    }

    // Sắp xếp danh sách
    exportRows.sort((a, b) => {
      if (isRange && a.dateStr && b.dateStr && a.dateStr !== b.dateStr) {
        return b.dateStr.localeCompare(a.dateStr);
      }
      const deptA = (a.department || '').trim();
      const deptB = (b.department || '').trim();
      const deptCompare = deptA.localeCompare(deptB, 'vi', { sensitivity: 'base' });
      if (deptCompare !== 0) return deptCompare;

      const nameA = (a.userName || '').trim();
      const nameB = (b.userName || '').trim();
      const nameCompare = nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
      if (nameCompare !== 0) return nameCompare;

      return String(a.userId || '').localeCompare(String(b.userId || ''), 'vi', { sensitivity: 'base' });
    });

    const headers = isRange ? [
      ['STT', 'Ngày', 'Mã NV', 'Họ và tên', 'Khoa / Phòng', 'Trạng thái', 'CA SÁNG', '', 'CA CHIỀU', ''],
      ['', '', '', '', '', '', 'Giờ vào', 'Giờ ra', 'Giờ vào', 'Giờ ra']
    ] : [
      ['STT', 'Mã NV', 'Họ và tên', 'Khoa / Phòng', 'Trạng thái', 'CA SÁNG', '', 'CA CHIỀU', ''],
      ['', '', '', '', '', 'Giờ vào', 'Giờ ra', 'Giờ vào', 'Giờ ra']
    ];

    const dataRows = exportRows.map((r, idx) => isRange ? [
      idx + 1,
      r.dateStr ? format(parseISO(r.dateStr), 'dd/MM/yyyy') : '',
      r.userId,
      r.userName,
      r.department,
      r.status,
      r.morningInTime,
      r.morningOutTime,
      r.afternoonInTime,
      r.afternoonOutTime
    ] : [
      idx + 1,
      r.userId,
      r.userName,
      r.department,
      r.status,
      r.morningInTime,
      r.morningOutTime,
      r.afternoonInTime,
      r.afternoonOutTime
    ]);

    const ws = XLSX.utils.aoa_to_sheet([...headers, ...dataRows]);
    ws['!merges'] = isRange ? [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // STT
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // Ngày
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }, // Mã NV
      { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } }, // Họ và tên
      { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } }, // Khoa / Phòng
      { s: { r: 0, c: 5 }, e: { r: 1, c: 5 } }, // Trạng thái
      { s: { r: 0, c: 6 }, e: { r: 0, c: 7 } }, // CA SÁNG
      { s: { r: 0, c: 8 }, e: { r: 0, c: 9 } }, // CA CHIỀU
    ] : [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // STT
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // Mã NV
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }, // Họ và tên
      { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } }, // Khoa / Phòng
      { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } }, // Trạng thái
      { s: { r: 0, c: 5 }, e: { r: 0, c: 6 } }, // CA SÁNG
      { s: { r: 0, c: 7 }, e: { r: 0, c: 8 } }, // CA CHIỀU
    ];

    ws['!cols'] = isRange ? [
      { wch: 6 },  // STT
      { wch: 14 }, // Ngày
      { wch: 14 }, // Mã NV
      { wch: 28 }, // Họ và tên
      { wch: 24 }, // Khoa / Phòng
      { wch: 22 }, // Trạng thái
      { wch: 14 }, // Ca Sáng - Giờ vào
      { wch: 14 }, // Ca Sáng - Giờ ra
      { wch: 14 }, // Ca Chiều - Giờ vào
      { wch: 14 }  // Ca Chiều - Giờ ra
    ] : [
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
    XLSX.writeFile(wb, isRange ? `DiemDanh_${todayStartDate}_den_${todayEndDate}.xlsx` : `DiemDanh_${dateStr}.xlsx`);
    setShowTodayExportMenu(false);
  };

  const exportRawLogsToExcel = () => {
    let filteredRecords = records;
    if (todayDepartmentFilter || todayLateFilter) {
        let grouped = groupRecordsByUser(records);
        if (todayDepartmentFilter) {
          grouped = grouped.filter(u => u.department === todayDepartmentFilter);
        }
        if (todayLateFilter === 'late_morning') {
          grouped = grouped.filter(u => u.morningIn && u.morningIn.lateMinutes && u.morningIn.lateMinutes > 0);
        } else if (todayLateFilter === 'late_afternoon') {
          grouped = grouped.filter(u => u.afternoonIn && u.afternoonIn.lateMinutes && u.afternoonIn.lateMinutes > 0);
        }
        const validUserIds = new Set(grouped.map(u => u.userId));
        filteredRecords = records.filter(r => validUserIds.has(r.userId));
    }

    const sortedRecords = [...filteredRecords].sort((a, b) => {
      const deptCompare = (a.department || '').localeCompare(b.department || '', 'vi', { sensitivity: 'base' });
      if (deptCompare !== 0) return deptCompare;
      const nameCompare = (a.userName || '').localeCompare(b.userName || '', 'vi', { sensitivity: 'base' });
      if (nameCompare !== 0) return nameCompare;
      return Number(a.timestamp || 0) - Number(b.timestamp || 0);
    });

    const wsData = sortedRecords.map(r => ({
      'Tên nhân viên': r.userName,
      'Phòng ban': r.department || '',
      'Thời gian': format(new Date(r.timestamp), 'dd/MM/yyyy HH:mm:ss'),
      'Ngày': r.dateStr,
      'Trạng thái': (r.type === 'in' ? 'Vào ca' : (r.type === 'out' ? 'Ra ca' : r.type)) + (r.status === 'success' ? '' : (r.status === 'invalid_qr' ? ' (Mã QR lỗi)' : (r.status === 'error' ? ' (Lỗi hệ thống/GPS)' : ' (Sai vị trí)'))),
      'Vĩ độ': r.location?.lat,
      'Kinh độ': r.location?.lng,
      'Mã thiết bị (Device ID)': r.deviceInfo?.deviceId || '',
      'Thiết bị': r.deviceInfo ? r.deviceInfo.deviceType : '',
      'Hệ điều hành': r.deviceInfo ? r.deviceInfo.os : '',
      'Trình duyệt': r.deviceInfo ? r.deviceInfo.browser : ''
    }));
    
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ChiTietLuotQuet");
    XLSX.writeFile(wb, `NhatKyQuet_${activeTab}_${todayDateMode === 'range' ? `${todayStartDate}_den_${todayEndDate}` : dateStr}.xlsx`);
    setShowTodayExportMenu(false);
  };

  const exportEmployeesToExcel = (deptName?: string) => {
    const isAll = !deptName || deptName === 'ALL';
    let targetUsers = isAll 
      ? [...users] 
      : users.filter(u => u.department === deptName);

    // Lọc theo trạng thái đang chọn nếu có
    if (usersFilterStatus === 'active') {
      targetUsers = targetUsers.filter(u => !u.is_hidden && u.status !== 'inactive' && u.status !== 'locked');
    } else if (usersFilterStatus === 'hidden') {
      targetUsers = targetUsers.filter(u => u.is_hidden || u.status === 'inactive' || u.status === 'locked');
    }

    if (targetUsers.length === 0) {
      alert(isAll ? "Danh sách nhân sự trống!" : `Không có nhân sự nào thuộc khoa/phòng "${deptName}"!`);
      return;
    }

    // Sắp xếp: Khoa / Phòng A-Z, sau đó theo Mã NV dạng số tăng dần
    targetUsers.sort((a, b) => {
      const deptComp = (a.department || '').localeCompare(b.department || '', 'vi');
      if (deptComp !== 0) return deptComp;
      const numA = parseInt(a.uid || '0', 10);
      const numB = parseInt(b.uid || '0', 10);
      if (!isNaN(numA) && !isNaN(numB) && numA > 0 && numB > 0) {
        return numA - numB;
      }
      return (a.uid || '').localeCompare(b.uid || '', 'vi');
    });

    const exportDateStr = format(new Date(), 'dd/MM/yyyy HH:mm');
    const fileDateStr = format(new Date(), 'yyyy-MM-dd_HHmm');

    const statusNote = usersFilterStatus === 'active' 
      ? ' (ĐANG LÀM VIỆC)' 
      : usersFilterStatus === 'hidden' 
        ? ' (ĐÃ KHÓA / TẠM DỪNG)' 
        : '';

    // Dòng tiêu đề đầu file
    const titleRow1 = [isAll ? `DANH SÁCH TOÀN BỘ NHÂN SỰ BỆNH VIỆN${statusNote}` : `DANH SÁCH NHÂN SỰ - KHOA / PHÒNG: ${deptName?.toUpperCase()}${statusNote}`];
    const titleRow2 = [`Thời điểm xuất: ${exportDateStr}`, '', '', '', `Tổng số nhân sự: ${targetUsers.length} người`];
    const emptyRow: any[] = [];

    // Header cột
    const headers = [
      'STT',
      'Mã nhân viên',
      'Họ và tên',
      'Khoa / Phòng',
      'Chức danh / Vị trí',
      'Vai trò hệ thống',
      'Trạng thái làm việc',
      'Lý do khóa / tạm dừng',
      'Thiết bị điểm danh liên kết'
    ];

    const dataRows = targetUsers.map((u, idx) => {
      const boundDev = userDevices.find(d => 
        d.user_id === u.uid || 
        (d.user_name && d.user_name.trim().toLowerCase() === u.name?.trim().toLowerCase() && d.department === u.department)
      );
      const isLocked = u.is_hidden || u.status === 'inactive' || u.status === 'locked';
      const statusText = isLocked ? 'Đã khóa / Tạm dừng' : 'Đang làm việc';
      const roleText = u.role === 'super_admin' ? 'Quản trị cấp cao' : u.role === 'admin' ? 'Quản trị viên' : 'Nhân viên';
      const deviceText = boundDev 
        ? `${boundDev.device_info?.deviceModel || boundDev.device_info?.os || 'Thiết bị'} (${boundDev.device_info?.browser || 'Trình duyệt'})`
        : 'Chưa liên kết thiết bị';

      return [
        idx + 1,
        u.uid || '',
        u.name || '',
        u.department || 'Chưa phân khoa',
        u.position || 'Nhân viên',
        roleText,
        statusText,
        u.lock_reason || '',
        deviceText
      ];
    });

    const sheetData = [titleRow1, titleRow2, emptyRow, headers, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Gộp ô tiêu đề
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
      { s: { r: 1, c: 4 }, e: { r: 1, c: 8 } }
    ];

    // Độ rộng cột
    ws['!cols'] = [
      { wch: 6 },  // STT
      { wch: 15 }, // Mã NV
      { wch: 28 }, // Họ và tên
      { wch: 26 }, // Khoa/Phòng
      { wch: 24 }, // Chức danh / Vị trí
      { wch: 18 }, // Vai trò
      { wch: 20 }, // Trạng thái
      { wch: 24 }, // Lý do khóa
      { wch: 30 }  // Thiết bị
    ];

    const wb = XLSX.utils.book_new();
    const sheetName = isAll ? "ToanBoNhanSu" : removeVietnameseTones(deptName || 'NhanSu').substring(0, 31).replace(/[^a-zA-Z0-9]/g, '_');
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const cleanDeptName = isAll ? 'Toan_Bo_Nhan_Su' : removeVietnameseTones(deptName || '').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Danh_Sach_Nhan_Su_${cleanDeptName}_${fileDateStr}.xlsx`;
    XLSX.writeFile(wb, fileName);
    setShowEmployeeExportMenu(false);
  };

  const [isExportingSheets, setIsExportingSheets] = useState(false);
  const handleExportToGoogleSheets = async () => {
    if (records.length === 0) return;
    
    let filteredRecords = records;
    if (todayDepartmentFilter || todayLateFilter) {
        let grouped = groupRecordsByUser(records);
        if (todayDepartmentFilter) {
          grouped = grouped.filter(u => u.department === todayDepartmentFilter);
        }
        if (todayLateFilter === 'late_morning') {
          grouped = grouped.filter(u => u.morningIn && u.morningIn.lateMinutes && u.morningIn.lateMinutes > 0);
        } else if (todayLateFilter === 'late_afternoon') {
          grouped = grouped.filter(u => u.afternoonIn && u.afternoonIn.lateMinutes && u.afternoonIn.lateMinutes > 0);
        }
        const validUserIds = new Set(grouped.map(u => u.userId));
        filteredRecords = records.filter(r => validUserIds.has(r.userId));
    }
    
    let token = getAccessToken();
    if (!token) {
      // Ignore iframe window.confirm block and assume true for Google Sheets
      if (true) {
        try {
          await signInWithGoogle();
          token = getAccessToken();
          if (!token) throw new Error("Chưa lấy được quyền truy cập.");
        } catch (e: any) {
          setErrorMessage("Lỗi cấp quyền: " + e.message);
          return;
        }
      } else {
        return;
      }
    }
    
    setIsExportingSheets(true);
    setErrorMessage(null);
    try {
      const exportDateLabel = todayDateMode === 'range' ? `${todayStartDate} đến ${todayEndDate}` : dateStr;
      const url = await exportToGoogleSheets(token, filteredRecords, exportDateLabel);
      window.open(url, '_blank');
      alert('Đã xuất dữ liệu ra Google Sheets thành công!');
    } catch (e: any) {
      console.warn(e);
      setErrorMessage(e.message || "Lỗi khi xuất dữ liệu ra Google Sheets.");
    } finally {
      setIsExportingSheets(false);
    }
  };

  // Helper tính toán dữ liệu thống kê
  const getStatisticsData = () => {
    const dailyData: Record<string, { date: string; success: number; failed: number; label: string }> = {};
    const deptData: Record<string, { name: string; success: number; failed: number }> = {};
    const monthlyData: Record<string, { label: string; monthSort: string; onTime: number; late: number }> = {};
    let totalSuccess = 0;
    let totalFailed = 0;

    records.forEach(r => {
      const date = r.dateStr;
      const dept = r.department || 'Chưa cập nhật';
      const rDate = new Date(r.timestamp);
      const monthSort = format(rDate, 'yyyy-MM');
      
      if (!dailyData[date]) {
        dailyData[date] = { date, success: 0, failed: 0, label: format(parseISO(date), 'dd/MM') };
      }
      if (!deptData[dept]) {
        deptData[dept] = { name: dept, success: 0, failed: 0 };
      }
      if (!monthlyData[monthSort]) {
        monthlyData[monthSort] = { label: `Tháng ${format(rDate, 'M')}`, monthSort, onTime: 0, late: 0 };
      }
      
      if (r.status === 'success') {
        dailyData[date].success += 1;
        deptData[dept].success += 1;
        totalSuccess += 1;
        
        if (r.type === 'in') {
          const hours = rDate.getHours();
          const minutes = rDate.getMinutes();
          const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
          let isLate = false;
          
          if (hours < 12) {
             isLate = timeStr > config.morningStart;
          } else {
             isLate = timeStr > config.afternoonStart;
          }
          
          if (isLate) {
            monthlyData[monthSort].late += 1;
          } else {
            monthlyData[monthSort].onTime += 1;
          }
        }
      } else {
        dailyData[date].failed += 1;
        deptData[dept].failed += 1;
        totalFailed += 1;
      }
    });

    const chartData = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
    const pieData = [
      { name: 'Thành công', value: totalSuccess, color: '#16a34a' },
      { name: 'Thất bại', value: totalFailed, color: '#ef4444' }
    ];
    const deptChartData = Object.values(deptData).sort((a, b) => b.success - a.success);
    const monthlyChartData = Object.values(monthlyData).sort((a, b) => a.monthSort.localeCompare(b.monthSort));

    return { chartData, pieData, deptChartData, monthlyChartData };
  };

  const { chartData, pieData, deptChartData, monthlyChartData } = activeTab === 'statistics' ? getStatisticsData() : { chartData: [], pieData: [], deptChartData: [], monthlyChartData: [] };


  const filteredUsers = users.filter(u => {
    const isHidden = u.is_hidden || u.status === 'inactive' || u.status === 'locked';
    if (usersFilterStatus === 'active' && isHidden) return false;
    if (usersFilterStatus === 'hidden' && !isHidden) return false;
    const matchDept = usersFilterDept ? u.department === usersFilterDept : true;
    const matchSearch = usersSearchQuery ? 
      removeVietnameseTones(u.name || '').includes(removeVietnameseTones(usersSearchQuery)) || 
      removeVietnameseTones(u.email || '').includes(removeVietnameseTones(usersSearchQuery)) ||
      removeVietnameseTones(u.uid || '').includes(removeVietnameseTones(usersSearchQuery)) ||
      (u.lock_reason && removeVietnameseTones(u.lock_reason).includes(removeVietnameseTones(usersSearchQuery)))
      : true;
    return matchDept && matchSearch;
  });
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage) || 1;
  const currentUsers = filteredUsers.slice((usersCurrentPage - 1) * usersPerPage, usersCurrentPage * usersPerPage);

  const filteredSpecialEmployees = specialEmployees.filter(emp => removeVietnameseTones(emp.user_name || '').includes(removeVietnameseTones(specialEmployeeSearch)));
  if (!canView) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <h2 className="text-xl font-bold text-slate-800 mb-2">Truy cập bị từ chối</h2>
        <p className="text-sm text-slate-500 mb-6">Bạn không có quyền truy cập trang quản trị.</p>
        <button onClick={() => window.location.href = '/'} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors">
          Về màn hình chính
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-[#F8FAFC] min-h-screen flex font-sans text-slate-900 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 shrink-0 z-10 hidden md:flex`}>
        <div className="h-16 flex items-center justify-center border-b border-slate-200 bg-blue-700 text-white shrink-0">
           <div className="flex items-center gap-3 w-full px-4 justify-center">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-blue-700 shrink-0 overflow-hidden relative">
                 <img src={config.logoBase64 || "/logo.svg"} alt="Logo" className="w-full h-full object-contain" />
                 {canEdit && (
                   <label className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity text-white z-10" title="Đổi logo">
                     <Camera className="w-5 h-5" />
                     <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = async (event) => {
                            const base64 = event.target?.result as string;
                            const newConfig = { ...config, logoBase64: base64 };
                            setConfig(newConfig);
                            try {
                              
                              await setDoc(doc(db, 'settings', 'config'), newConfig);
                            } catch (e) {
                              console.error('Error saving logo', e);
                            }
                          };
                          reader.readAsDataURL(file);
                        }} 
                      />
                   </label>
                 )}
              </div>
              {!isSidebarCollapsed && (
                <div className="flex flex-col whitespace-nowrap overflow-hidden">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">Bệnh viện Đa khoa</span>
                  <span className="text-sm font-black uppercase">Thiệu Hóa</span>
                </div>
              )}
           </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-3 flex flex-col gap-0.5">
           <button onClick={() => setActiveTab('dashboard')} className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              <Home className={`w-5 h-5 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!isSidebarCollapsed && <span>Dashboard</span>}
           </button>
           <button onClick={() => setActiveTab('qr')} className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'qr' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              <QrCode className={`w-5 h-5 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!isSidebarCollapsed && <span>QR hôm nay</span>}
           </button>
           <button onClick={() => setActiveTab('today')} className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'today' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              <CheckSquare className={`w-5 h-5 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!isSidebarCollapsed && <span>Điểm danh</span>}
           </button>
           <button onClick={() => setActiveTab('briefing')} className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'briefing' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              <UserCheck className={`w-5 h-5 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!isSidebarCollapsed && <span>Giao ban</span>}
           </button>
           <button onClick={() => setActiveTab('history')} className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              <History className={`w-5 h-5 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!isSidebarCollapsed && <span>Lịch sử cá nhân</span>}
           </button>
           <button onClick={() => setActiveTab('statistics')} className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'statistics' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              <BarChart2 className={`w-5 h-5 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!isSidebarCollapsed && <span>Báo cáo</span>}
           </button>
           <button onClick={() => setActiveTab('employees')} className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'employees' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              <Users className={`w-5 h-5 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!isSidebarCollapsed && <span>Nhân sự</span>}
           </button>
           <button onClick={() => setActiveTab('special_employees')} className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'special_employees' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              <UserCheck className={`w-5 h-5 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!isSidebarCollapsed && <span>Đối tượng ưu tiên</span>}
           </button>
           <button onClick={() => setActiveTab('departments')} className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'departments' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              <Building className={`w-5 h-5 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!isSidebarCollapsed && <span>Khoa phòng</span>}
           </button>
           <button onClick={() => setActiveTab('notifications')} className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'notifications' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              <Bell className={`w-5 h-5 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!isSidebarCollapsed && <span>Thông báo</span>}
           </button>
           
           <div className="mb-2 border-t border-slate-200 pt-2 flex flex-col gap-0.5">
             <button onClick={() => setActiveTab('failed_logs')} className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'failed_logs' ? 'bg-red-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              <AlertTriangle className={`w-5 h-5 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!isSidebarCollapsed && <span>Lỗi điểm danh</span>}
           </button>
           <button onClick={() => setActiveTab('settings')} className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                <Settings className={`w-5 h-5 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
                {!isSidebarCollapsed && <span>Cài đặt</span>}
             </button>
           </div>
           
           <div className="border-t border-slate-200 pt-2 flex flex-col gap-2">
             <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="flex items-center justify-center w-full px-3 py-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
                {isSidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <div className="flex items-center gap-2"><ChevronLeft className="w-5 h-5" /><span className="text-sm font-semibold">Thu gọn</span></div>}
             </button>
             <button onClick={async () => { await logout(); window.location.href = '/login'; }} className="flex items-center justify-center w-full px-3 py-2 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors">
                <LogOut className={`w-5 h-5 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
                {!isSidebarCollapsed && <span className="text-sm font-semibold">Đăng xuất</span>}
             </button>
           </div>
        </div>
      </aside>
      
      {/* Mobile Drawer Sidebar */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs" onClick={() => setIsMobileSidebarOpen(false)} />
          <aside className="relative w-72 bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200">
            <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 bg-blue-700 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center text-blue-700 shrink-0 overflow-hidden">
                  <img src={config.logoBase64 || "/logo.svg"} alt="Logo Bệnh viện Đa khoa Thiệu Hóa" className="w-full h-full object-contain" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">BVĐK Thiệu Hóa</span>
                  <span className="text-xs font-black uppercase">Quản trị Hệ thống</span>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsMobileSidebarOpen(false)} 
                className="w-8 h-8 rounded-lg bg-blue-800 hover:bg-blue-900 text-white flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2 px-3 flex flex-col gap-1">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: Home },
                { id: 'qr', label: 'QR hôm nay', icon: QrCode },
                { id: 'today', label: 'Điểm danh', icon: CheckSquare },
                { id: 'briefing', label: 'Giao ban', icon: UserCheck },
                { id: 'history', label: 'Lịch sử cá nhân', icon: History },
                { id: 'statistics', label: 'Báo cáo', icon: BarChart2 },
                { id: 'employees', label: 'Nhân sự', icon: Users },
                { id: 'special_employees', label: 'Đối tượng ưu tiên', icon: UserCheck },
                { id: 'departments', label: 'Khoa phòng', icon: Building },
                { id: 'notifications', label: 'Thông báo', icon: Bell },
                { id: 'failed_logs', label: 'Lỗi điểm danh', icon: AlertTriangle, danger: true },
                { id: 'settings', label: 'Cài đặt', icon: Settings },
              ].map(item => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id as any); setIsMobileSidebarOpen(false); }}
                    className={`flex items-center px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      active 
                        ? (item.danger ? 'bg-red-600 text-white shadow-md' : 'bg-blue-600 text-white shadow-md')
                        : (item.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-3 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="p-3 border-t border-slate-200 flex flex-col gap-2">
              <button 
                type="button"
                onClick={() => { setIsMobileSidebarOpen(false); window.location.href = '/checkin'; }}
                className="flex items-center justify-center w-full px-3 py-2 rounded-xl text-blue-700 bg-blue-50 hover:bg-blue-100 font-bold text-xs transition-colors"
              >
                <Home className="w-4 h-4 mr-2" />
                <span>Về màn hình Điểm danh</span>
              </button>
              <button 
                type="button"
                onClick={async () => {
                  setIsMobileSidebarOpen(false);
                  await logout();
                  window.location.href = '/login';
                }}
                className="flex items-center justify-center w-full px-3 py-2 rounded-xl text-red-600 bg-red-50 hover:bg-red-100 font-bold text-xs transition-colors"
              >
                <LogOut className="w-4 h-4 mr-2" />
                <span>Đăng xuất tài khoản</span>
              </button>
            </div>
          </aside>
        </div>
      )}
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 shrink-0 z-20">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileSidebarOpen(true)} className="text-slate-500 hover:text-slate-700 md:hidden p-1.5 rounded-lg hover:bg-slate-100">
               <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-bold text-slate-800 hidden lg:block">Hệ thống Quản lý Điểm danh GPS & QR</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative hidden md:block">
               <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
               <input type="text" placeholder="Tìm kiếm nhân viên..." className="pl-9 pr-4 py-2 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all w-48 xl:w-64 outline-none" />
            </div>
            <div className="hidden sm:flex items-center gap-3 border-r border-slate-200 pr-3">
              <div className="relative cursor-pointer hover:bg-slate-100 p-2 rounded-full transition-colors">
                <Bell className="w-5 h-5 text-slate-600" />
                <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">5</span>
              </div>
              <div className="hidden xl:flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-full font-medium">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                Tự động làm mới: 30s
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3">
               <div className="text-right hidden xl:block">
                 <div className="text-sm font-bold text-slate-800 leading-tight">{format(currentTime, 'HH:mm:ss')}</div>
                 <div className="text-[11px] text-slate-500 font-medium">Thứ {currentTime.getDay() + 1}, {format(currentTime, 'dd/MM/yyyy')}</div>
               </div>

               {/* Nút chuyển nhanh sang màn hình Điểm danh nhân viên (chỉ hiển thị trên thiết bị di động) */}
               <button
                 type="button"
                 onClick={() => {
                   window.location.href = '/checkin';
                 }}
                 className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 shadow-2xs shrink-0"
                 title="Xem giao diện màn hình Điểm danh trên điện thoại"
               >
                 <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                 <span className="hidden sm:inline">Điểm danh</span>
               </button>

               {/* Visible Exit / Logout Button on all screen sizes */}
               <button
                 type="button"
                 onClick={async () => {
                   await logout();
                   window.location.href = '/login';
                 }}
                 className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-200 shadow-2xs shrink-0"
                 title="Đăng xuất tài khoản"
               >
                 <LogOut className="w-3.5 h-3.5 text-red-600" />
                 <span className="hidden xs:inline">Đăng xuất</span>
               </button>

               {/* User Profile dropdown */}
               <div className="relative">
                 <div 
                   onClick={() => setShowUserDropdown(!showUserDropdown)} 
                   className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded-lg transition-colors"
                 >
                   <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userData?.name || 'Admin')}&background=0D8ABC&color=fff`} alt="Avatar" className="w-9 h-9 rounded-full object-cover border border-slate-200" />
                   <div className="hidden md:block text-left">
                     <div className="text-xs font-bold text-slate-800 leading-tight">{userData?.name || 'Quản trị viên'}</div>
                     <div className="text-[10px] text-slate-500">{userData?.role === 'super_admin' ? 'QTV Cấp cao' : userData?.role === 'admin' ? 'Quản trị viên' : (userData?.department || 'Tài khoản Nội bộ')}</div>
                   </div>
                   <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} />
                 </div>

                 {showUserDropdown && (
                   <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95">
                     <div className="px-3 py-2 border-b border-slate-100">
                       <p className="text-xs font-bold text-slate-800">{userData?.name || 'Quản trị viên'}</p>
                       <p className="text-[11px] text-slate-500 truncate">{userData?.email || (userData as any)?.username || 'admin@local'}</p>
                     </div>
                     <button 
                       type="button"
                       onClick={async () => { 
                         setShowUserDropdown(false); 
                         await logout(); 
                         window.location.href = '/login'; 
                       }} 
                       className="w-full text-left px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 mt-1"
                     >
                       <LogOut className="w-4 h-4 text-red-600" />
                       Đăng xuất tài khoản
                     </button>
                   </div>
                 )}
               </div>
            </div>
          </div>
        </header>
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-transparent relative flex flex-col p-4 md:p-6 gap-6">
{errorMessage && !isEditModalOpen && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-100 text-red-700 px-4 py-2 rounded-lg shadow-lg border border-red-200 flex items-center gap-2">
                <span>{errorMessage}</span>
                <button onClick={() => setErrorMessage(null)} className="font-bold ml-2">X</button>
              </div>
            )}
            {actionToast && (
              <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-xl border flex items-center gap-3 transition-all duration-300 max-w-md ${
                actionToast.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : 'bg-red-50 text-red-900 border-red-300'
              }`}>
                {actionToast.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />}
                <span className="text-xs sm:text-sm font-medium flex-1">{actionToast.message}</span>
                <button onClick={() => setActionToast(null)} className="text-slate-400 hover:text-slate-700 font-bold ml-1">✕</button>
              </div>
            )}
            {loading ? (
              <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <>
                {activeTab === 'dashboard' && (
                  <div className="flex-1 overflow-auto bg-transparent relative flex flex-col p-1 gap-6">
                    <AdminDashboard records={records} users={users} departments={departments} config={config} timeRange={dashboardTimeRange} setTimeRange={setDashboardTimeRange} />
                  </div>
                )}
                {activeTab !== 'dashboard' && (
                  <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative">
                    {activeTab === 'qr' && (
                  <div className="flex flex-col items-center justify-center space-y-4 h-full p-6">
                    <div className="text-center mb-4">
                      <h2 className="text-sm md:text-lg font-bold text-slate-700 uppercase tracking-widest">Sở y tế Thanh Hóa</h2>
                      <h2 className="text-base md:text-xl font-bold text-blue-700 uppercase tracking-widest mt-1">Bệnh viện Đa khoa Thiệu Hóa</h2>
                      <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-widest mt-3">Mã QR Điểm Danh</h2>
                    </div>
                    
                    {qrToken && (
    <div className="flex flex-col items-center justify-center w-full">
      <div className="aspect-square bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center p-6 max-w-sm w-full">
                        <div className="w-full aspect-square bg-white border border-slate-200 p-4 flex items-center justify-center">
                          <QRCodeSVG value={`${appUrl}/checkin/${qrToken}`} size={260} style={{ width: '100%', height: '100%' }} level="H" />
                        </div>
  <p className="text-[10px] text-center mt-3 text-slate-500">
                          Ngày hiện tại: <span className="font-bold text-blue-600">{format(new Date(), 'dd/MM/yyyy')}</span>
                        </p>
                      </div>
                      {typeof window !== 'undefined' && window.location.origin.includes('ais-dev-') && (
  <div className="mt-4 p-4 bg-red-50 border-2 border-red-500 rounded-xl text-red-800 text-sm text-center max-w-sm w-full font-medium shadow-sm animate-pulse">
    <strong>LƯU Ý QUAN TRỌNG:</strong><br/>Để trang quét mã trên điện thoại hoạt động và nhận các bản sửa lỗi mới nhất, bạn <strong>BẮT BUỘC</strong> phải bấm nút <strong>Share (Chia sẻ)</strong> ở góc trên cùng bên phải màn hình ngay bây giờ!
  </div>
)}
                    </div>
                  )}
                  </div>
                )}

                {activeTab === 'briefing' && (
                  <BriefingAdminView canEdit={canEdit} canDelete={canDelete} />
                )}
                
                                {activeTab === 'today' && (
                  <div className="flex flex-col h-full overflow-hidden">
                    <div className="p-3.5 border-b border-slate-100 flex flex-col gap-3 bg-slate-50 shrink-0">
                      <div className="flex flex-wrap gap-3 justify-between items-center">
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
                            <Activity className="w-4 h-4 text-blue-600" />
                            Nhật ký Điểm danh
                          </h2>

                          {/* Date Mode Switcher: Theo ngày vs Khoảng thời gian */}
                          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => { setTodayDateMode('single'); setCurrentPageToday(1); }}
                              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${todayDateMode === 'single' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                              Theo ngày
                            </button>
                            <button
                              type="button"
                              onClick={() => { setTodayDateMode('range'); setCurrentPageToday(1); }}
                              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${todayDateMode === 'range' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              Khoảng thời gian
                            </button>
                          </div>

                          {/* Single Date Picker & Quick Select */}
                          {todayDateMode === 'single' ? (
                            <div className="flex items-center gap-1.5">
                              <input 
                                type="date" 
                                value={dateStr}
                                onChange={(e) => { setDateStr(e.target.value); setCurrentPageToday(1); }}
                                className="px-2.5 py-1 border border-slate-200 rounded text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white shadow-2xs"
                              />
                              <button
                                type="button"
                                onClick={() => { setDateStr(getVnTodayDateString()); setCurrentPageToday(1); }}
                                className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${dateStr === getVnTodayDateString() ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                              >
                                Hôm nay
                              </button>
                              <button
                                type="button"
                                onClick={() => { setDateStr(format(subDays(new Date(), 1), 'yyyy-MM-dd')); setCurrentPageToday(1); }}
                                className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${dateStr === format(subDays(new Date(), 1), 'yyyy-MM-dd') ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                              >
                                Hôm qua
                              </button>
                            </div>
                          ) : (
                            /* Range Date Picker (Từ ngày - Đến ngày) & Presets */
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs">
                                <span className="text-[11px] text-slate-500 font-medium">Từ:</span>
                                <input 
                                  type="date" 
                                  value={todayStartDate}
                                  onChange={(e) => { setTodayStartDate(e.target.value); setTodayRangePreset('custom'); setCurrentPageToday(1); }}
                                  className="px-1 py-0.5 text-xs font-semibold text-slate-800 focus:outline-none"
                                />
                                <span className="text-xs text-slate-400 font-bold">→</span>
                                <span className="text-[11px] text-slate-500 font-medium">Đến:</span>
                                <input 
                                  type="date" 
                                  value={todayEndDate}
                                  onChange={(e) => { setTodayEndDate(e.target.value); setTodayRangePreset('custom'); setCurrentPageToday(1); }}
                                  className="px-1 py-0.5 text-xs font-semibold text-slate-800 focus:outline-none"
                                />
                              </div>

                              <div className="flex items-center gap-1">
                                {(['today', 'yesterday', '7days', '30days', 'this_month'] as const).map(p => {
                                  const label = p === 'today' ? 'Hôm nay' : p === 'yesterday' ? 'Hôm qua' : p === '7days' ? '7 ngày' : p === '30days' ? '30 ngày' : 'Tháng này';
                                  const isActive = todayRangePreset === p;
                                  return (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() => handleSelectTodayRangePreset(p)}
                                      className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow-2xs' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium shadow-xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>Đồng bộ: <strong>{format(lastSyncTime, 'HH:mm:ss')}</strong></span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => fetchTodayRecords()}
                            disabled={loading}
                            className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-xs"
                            title="Tải lại ngay danh sách điểm danh mới nhất"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-600'}`} />
                            Đồng bộ ngay
                          </button>

                          <div className="relative inline-flex">
                            <button
                              onClick={() => exportToExcel(false)}
                              disabled={records.length === 0 && users.length === 0}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-l text-xs font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-xs"
                              title="Tải file Excel mẫu: STT | [Ngày] | Mã NV | Họ và tên | Khoa / Phòng | Trạng thái | Giờ vào | Giờ ra"
                            >
                              <Download className="w-3.5 h-3.5" /> Xuất Excel
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowTodayExportMenu(!showTodayExportMenu)}
                              disabled={records.length === 0 && users.length === 0}
                              className="px-1.5 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-r text-xs font-semibold border-l border-blue-500 disabled:opacity-50 transition-colors flex items-center shadow-xs"
                              title="Tùy chọn xuất Excel"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>

                            {showTodayExportMenu && (
                              <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs text-slate-700">
                                <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                  Tùy chọn tải file Excel ({todayDateMode === 'range' ? `${format(parseISO(todayStartDate), 'dd/MM/yyyy')} - ${format(parseISO(todayEndDate), 'dd/MM/yyyy')}` : format(parseISO(dateStr), 'dd/MM/yyyy')})
                                </div>
                                <button
                                  type="button"
                                  onClick={() => exportToExcel(false)}
                                  className="w-full text-left px-3 py-2 hover:bg-blue-50 hover:text-blue-700 flex flex-col transition-colors cursor-pointer"
                                >
                                  <span className="font-bold text-slate-800">1. Danh sách đã điểm danh (Mẫu chuẩn)</span>
                                  <span className="text-[11px] text-slate-500">STT, {todayDateMode === 'range' ? 'Ngày, ' : ''}Mã NV, Họ tên, Khoa/Phòng, Trạng thái, Giờ vào, Giờ ra</span>
                                </button>
                                {todayDateMode === 'single' && (
                                  <button
                                    type="button"
                                    onClick={() => exportToExcel(true)}
                                    className="w-full text-left px-3 py-2 hover:bg-blue-50 hover:text-blue-700 flex flex-col transition-colors cursor-pointer border-t border-slate-100"
                                  >
                                    <span className="font-bold text-slate-800">2. Toàn bộ nhân sự (Kèm Chưa điểm danh)</span>
                                    <span className="text-[11px] text-slate-500">Bao gồm toàn bộ nhân viên khoa phòng, đánh dấu Chưa điểm danh</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => exportRawLogsToExcel()}
                                  className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-600 flex flex-col transition-colors cursor-pointer border-t border-slate-100"
                                >
                                  <span className="font-medium text-slate-700">3. Nhật ký quét chi tiết</span>
                                  <span className="text-[11px] text-slate-400">Dữ liệu thô kèm tọa độ GPS và thiết bị quét</span>
                                </button>
                              </div>
                            )}
                          </div>

                          <button
                            onClick={handleExportToGoogleSheets}
                            disabled={records.length === 0 || isExportingSheets}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-xs"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" /> 
                            {isExportingSheets ? 'Đang xuất...' : 'Xuất Sheets'}
                          </button>
                        </div>
                      </div>

                      {/* Search and Filters Bar */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60">
                        {/* Lọc theo cá nhân (Dropdown chọn nhân sự) */}
                        <div className="min-w-[210px] max-w-xs">
                          <select 
                            value={todayUserFilter} 
                            onChange={e => { setTodayUserFilter(e.target.value); setCurrentPageToday(1); }} 
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                            title="Lọc lịch sử theo từng cá nhân nhân viên"
                          >
                            <option value="">-- Tất cả nhân viên (Lọc cá nhân) --</option>
                            {users.map(u => (
                              <option key={u.uid} value={u.uid}>
                                {u.name} ({u.uid || 'Không mã'}) {u.department ? ` - ${u.department}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Search Input */}
                        <div className="relative flex-1 min-w-[180px] max-w-xs">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input 
                            type="text" 
                            placeholder="Tìm tên nhân viên hoặc Mã NV..." 
                            value={todaySearchText} 
                            onChange={e => { setTodaySearchText(e.target.value); setCurrentPageToday(1); }}
                            className="w-full pl-8 pr-7 py-1.5 border border-slate-200 rounded text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                          />
                          {todaySearchText && (
                            <button 
                              onClick={() => { setTodaySearchText(''); setCurrentPageToday(1); }} 
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-0.5"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        <select 
                          value={todayDepartmentFilter} 
                          onChange={e => { setTodayDepartmentFilter(e.target.value); setCurrentPageToday(1); }} 
                          className="px-2.5 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                        >
                          <option value="">Tất cả khoa phòng</option>
                          {departments.map(d => (
                            <option key={d.id} value={d.name}>{d.name}</option>
                          ))}
                        </select>

                        <select 
                          value={todayLateFilter} 
                          onChange={e => { setTodayLateFilter(e.target.value); setCurrentPageToday(1); }} 
                          className="px-2.5 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                        >
                          <option value="">Tất cả trạng thái</option>
                          <option value="late_morning">Đi muộn (Ca sáng)</option>
                          <option value="late_afternoon">Đi muộn (Ca chiều)</option>
                        </select>

                        <select 
                          value={todaySortOrder} 
                          onChange={e => { setTodaySortOrder(e.target.value as any); setCurrentPageToday(1); }} 
                          className="px-2.5 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                        >
                          <option value="desc">Mới nhất trước</option>
                          <option value="asc">Sớm nhất trước</option>
                        </select>

                        <select 
                          value={itemsPerPageToday} 
                          onChange={e => { setItemsPerPageToday(Number(e.target.value)); setCurrentPageToday(1); }} 
                          className="px-2.5 py-1.5 border border-slate-200 rounded text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                        >
                          <option value={20}>20 dòng/trang</option>
                          <option value={50}>50 dòng/trang</option>
                          <option value={100}>100 dòng/trang</option>
                          <option value={9999}>Xem tất cả</option>
                        </select>

                        {/* Reset Filters Button */}
                        {(todayUserFilter || todaySearchText || todayDepartmentFilter || todayLateFilter || todayDateMode === 'range') && (
                          <button
                            type="button"
                            onClick={() => {
                              setTodayUserFilter('');
                              setTodaySearchText('');
                              setTodayDepartmentFilter('');
                              setTodayLateFilter('');
                              setTodayDateMode('single');
                              setDateStr(getVnTodayDateString());
                              setCurrentPageToday(1);
                            }}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-xs font-semibold transition-colors flex items-center gap-1"
                            title="Đặt lại toàn bộ bộ lọc về mặc định"
                          >
                            <X className="w-3.5 h-3.5" />
                            Xóa bộ lọc
                          </button>
                        )}
                      </div>

                      {/* Active Filter Chips Bar */}
                      {(todayDateMode === 'range' || todayUserFilter || todayDepartmentFilter || todayLateFilter || todaySearchText) && (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 bg-blue-50/70 border border-blue-200/60 rounded-lg px-3 py-1.5">
                          <span className="font-bold text-blue-900 flex items-center gap-1">
                            <Filter className="w-3 h-3 text-blue-600" />
                            Đang lọc:
                          </span>
                          {todayDateMode === 'range' ? (
                            <span className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-800 font-medium">
                              Từ {format(parseISO(todayStartDate), 'dd/MM/yyyy')} đến {format(parseISO(todayEndDate), 'dd/MM/yyyy')}
                            </span>
                          ) : (
                            <span className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-800 font-medium">
                              Ngày {format(parseISO(dateStr), 'dd/MM/yyyy')}
                            </span>
                          )}
                          {todayUserFilter && (
                            <span className="inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded border border-blue-300 text-blue-800 font-semibold shadow-xs">
                              <User className="w-3 h-3 text-blue-600" />
                              Cá nhân: {users.find(u => u.uid === todayUserFilter)?.name || todayUserFilter}
                              <button
                                onClick={() => { setTodayUserFilter(''); setCurrentPageToday(1); }}
                                className="ml-1 hover:text-red-600 text-slate-400 p-0.5 rounded font-bold"
                                title="Bỏ lọc cá nhân"
                              >
                                ✕
                              </button>
                            </span>
                          )}
                          {todayDepartmentFilter && (
                            <span className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-800 font-medium">
                              Khoa/Phòng: {todayDepartmentFilter}
                            </span>
                          )}
                          {todayLateFilter && (
                            <span className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-800 font-medium">
                              {todayLateFilter === 'late_morning' ? 'Đi muộn ca sáng' : 'Đi muộn ca chiều'}
                            </span>
                          )}
                          {todaySearchText && (
                            <span className="bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-800 font-medium">
                              Từ khóa: "{todaySearchText}"
                            </span>
                          )}
                        </div>
                      )}

                      {/* Personal Filter Snapshot Strip */}
                      {todayUserFilter && (() => {
                        const targetUser = users.find(u => u.uid === todayUserFilter);
                        const targetName = targetUser?.name?.trim().toLowerCase();
                        const userRecords = records.filter(r => 
                          r.userId === todayUserFilter || 
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
                                  <span className="font-bold text-slate-900 text-sm">{targetUser?.name || todayUserFilter}</span>
                                  <span className="text-[11px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                    Mã NV: {targetUser?.uid || todayUserFilter}
                                  </span>
                                  {targetUser?.department && (
                                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded">
                                      {targetUser.department}
                                    </span>
                                  )}
                                </div>
                                <div className="text-slate-600 mt-0.5">
                                  Lịch sử điểm danh {todayDateMode === 'range' ? `từ ${format(parseISO(todayStartDate), 'dd/MM/yyyy')} đến ${format(parseISO(todayEndDate), 'dd/MM/yyyy')}` : `ngày ${format(parseISO(dateStr), 'dd/MM/yyyy')}`}
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
                              <button
                                onClick={() => {
                                  setHistorySelectedUserId(todayUserFilter);
                                  setActiveTab('history');
                                }}
                                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-xs"
                                title="Xem đầy đủ biểu đồ và chi tiết điểm danh cá nhân"
                              >
                                Xem hồ sơ chi tiết
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    
                    <div className="flex-1 overflow-auto">
                      {records.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                          Chưa có dữ liệu điểm danh.
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                            <tr>
                              {todayDateMode === 'range' && (
                                <th className="px-4 py-3">Ngày</th>
                              )}
                              <th className="px-4 py-3">Nhân viên</th>
                              <th className="px-4 py-3">Khoa/Phòng</th>
                              <th colSpan={2} className="px-4 py-3 text-center border-l border-slate-200">Ca Sáng<br/><span className="text-[9px] text-slate-400 font-normal flex justify-around"><span>Vào</span><span>Ra</span></span></th>
                              <th colSpan={2} className="px-4 py-3 text-center border-l border-slate-200">Ca Chiều<br/><span className="text-[9px] text-slate-400 font-normal flex justify-around"><span>Vào</span><span>Ra</span></span></th>
                              <th colSpan={2} className="px-4 py-3 text-center border-l border-slate-200 border-r">Ca Tối<br/><span className="text-[9px] text-slate-400 font-normal flex justify-around"><span>Vào</span><span>Ra</span></span></th>
                              <th className="px-4 py-3 text-center">Đi muộn</th>
                              <th className="px-4 py-3 text-right">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="text-sm divide-y divide-slate-100 bg-white">
                            {(() => {
                              let grouped = groupRecordsByUser(records, todaySortOrder, todayDateMode === 'range');
                              if (todayUserFilter) {
                                const targetUser = users.find(u => u.uid === todayUserFilter);
                                const targetName = targetUser?.name?.trim().toLowerCase();
                                grouped = grouped.filter(u => 
                                  u.userId === todayUserFilter || 
                                  (targetName && u.userName && u.userName.trim().toLowerCase() === targetName)
                                );
                              }
                              if (todayDepartmentFilter) {
                                grouped = grouped.filter(u => u.department === todayDepartmentFilter);
                              }
                              if (todayLateFilter === 'late_morning') {
                                grouped = grouped.filter(u => u.morningIn && u.morningIn.lateMinutes && u.morningIn.lateMinutes > 0);
                              } else if (todayLateFilter === 'late_afternoon') {
                                grouped = grouped.filter(u => u.afternoonIn && u.afternoonIn.lateMinutes && u.afternoonIn.lateMinutes > 0);
                              }
                              if (todaySearchText.trim()) {
                                const q = todaySearchText.trim().toLowerCase();
                                grouped = grouped.filter(u => 
                                  (u.userName && u.userName.toLowerCase().includes(q)) || 
                                  (u.userId && String(u.userId).toLowerCase().includes(q)) ||
                                  (u.department && u.department.toLowerCase().includes(q))
                                );
                              }
                              const perPage = itemsPerPageToday || 20;
                              const totalPages = Math.ceil(grouped.length / perPage) || 1;
                              const startIndex = (currentPageToday - 1) * perPage;
                              const paginated = grouped.slice(startIndex, startIndex + perPage);

                              if (grouped.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={todayDateMode === 'range' ? 11 : 10} className="px-4 py-12 text-center text-slate-500 text-sm">
                                      Không tìm thấy nhân viên hoặc bản ghi điểm danh nào phù hợp.
                                    </td>
                                  </tr>
                                );
                              }
                              
                              return paginated.map((user, i) => (
                              <tr key={todayDateMode === 'range' ? `${user.userId}_${user._dateStr || i}` : (user.userId || i)} className="hover:bg-slate-50 transition-colors">
                                {todayDateMode === 'range' && (
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="flex flex-col">
                                      <span className="font-bold text-slate-800 text-xs">
                                        {user._dateStr ? format(parseISO(user._dateStr), 'dd/MM/yyyy') : '--'}
                                      </span>
                                      <span className="text-[10px] text-slate-500 font-medium capitalize">
                                        {user._dateStr ? format(parseISO(user._dateStr), 'EEEE', { locale: vi }) : ''}
                                      </span>
                                    </div>
                                  </td>
                                )}
                                <td className="px-4 py-3 flex items-center gap-3">
                                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-blue-100 text-blue-600 font-bold text-xs">
                                    {user.userName.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-slate-900 leading-snug">{user.userName}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">Mã: {user.userId || 'Chưa rõ'}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-slate-600 text-xs font-medium">
                                  {user.department || 'Chưa cập nhật'}
                                </td>
                                
<td className="px-4 py-3 font-mono text-emerald-600 font-bold text-center border-l border-slate-100 bg-emerald-50/30 relative group">
  {user.morningIn ? (
    <div className="flex items-center justify-center gap-1">
      {format(new Date(user.morningIn.timestamp), 'HH:mm')}
      {(canDelete) && (
        <button onClick={() => handleDelete(user.morningIn!.id!)} className="opacity-70 hover:opacity-100 text-red-500 hover:text-red-700 absolute right-1" title="Xóa">
          <XCircle className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  ) : '--:--'}
</td>
<td className="px-4 py-3 font-mono text-orange-500 font-bold text-center border-r border-slate-100 bg-orange-50/30 relative group">
  {user.morningOut ? (
    <div className="flex items-center justify-center gap-1">
      {format(new Date(user.morningOut.timestamp), 'HH:mm')}
      {(canDelete) && (
        <button onClick={() => handleDelete(user.morningOut!.id!)} className="opacity-70 hover:opacity-100 text-red-500 hover:text-red-700 absolute right-1" title="Xóa">
          <XCircle className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  ) : '--:--'}
</td>

                                
<td className="px-4 py-3 font-mono text-emerald-600 font-bold text-center border-l border-slate-100 bg-emerald-50/30 relative group">
  {user.afternoonIn ? (
    <div className="flex items-center justify-center gap-1">
      {format(new Date(user.afternoonIn.timestamp), 'HH:mm')}
      {(canDelete) && (
        <button onClick={() => handleDelete(user.afternoonIn!.id!)} className="opacity-70 hover:opacity-100 text-red-500 hover:text-red-700 absolute right-1" title="Xóa">
          <XCircle className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  ) : '--:--'}
</td>
<td className="px-4 py-3 font-mono text-orange-500 font-bold text-center border-r border-slate-100 bg-orange-50/30 relative group">
  {user.afternoonOut ? (
    <div className="flex items-center justify-center gap-1">
      {format(new Date(user.afternoonOut.timestamp), 'HH:mm')}
      {(canDelete) && (
        <button onClick={() => handleDelete(user.afternoonOut!.id!)} className="opacity-70 hover:opacity-100 text-red-500 hover:text-red-700 absolute right-1" title="Xóa">
          <XCircle className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  ) : '--:--'}
</td>

                                
<td className="px-4 py-3 font-mono text-emerald-600 font-bold text-center border-l border-slate-100 bg-emerald-50/30 relative group">
  {user.eveningIn ? (
    <div className="flex items-center justify-center gap-1">
      {format(new Date(user.eveningIn.timestamp), 'HH:mm')}
      {(canDelete) && (
        <button onClick={() => handleDelete(user.eveningIn!.id!)} className="opacity-70 hover:opacity-100 text-red-500 hover:text-red-700 absolute right-1" title="Xóa">
          <XCircle className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  ) : '--:--'}
</td>
<td className="px-4 py-3 font-mono text-orange-500 font-bold text-center border-r border-slate-100 bg-orange-50/30 relative group">
  {user.eveningOut ? (
    <div className="flex items-center justify-center gap-1">
      {format(new Date(user.eveningOut.timestamp), 'HH:mm')}
      {(canDelete) && (
        <button onClick={() => handleDelete(user.eveningOut!.id!)} className="opacity-70 hover:opacity-100 text-red-500 hover:text-red-700 absolute right-1" title="Xóa">
          <XCircle className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  ) : '--:--'}
</td>

                                <td className="px-4 py-3 text-center">
                                  <div className="flex flex-col gap-1 items-center">
                                    {user.morningIn && user.morningIn.lateMinutes && user.morningIn.lateMinutes > 0 ? (
                                      <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded whitespace-nowrap" title={`Ca sáng: Vào muộn ${user.morningIn.lateMinutes} phút`}>
                                        Sáng muộn {user.morningIn.lateMinutes}p
                                      </span>
                                    ) : null}
                                    {user.afternoonIn && user.afternoonIn.lateMinutes && user.afternoonIn.lateMinutes > 0 ? (
                                      <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded whitespace-nowrap" title={`Ca chiều: Vào muộn ${user.afternoonIn.lateMinutes} phút`}>
                                        Chiều muộn {user.afternoonIn.lateMinutes}p
                                      </span>
                                    ) : null}
                                    {user.earlyLeaveMinutes > 0 && (
                                      <span className="px-2 py-1 bg-orange-100 text-orange-700 text-[10px] font-bold rounded whitespace-nowrap">
                                        Ra sớm {user.earlyLeaveMinutes}p
                                      </span>
                                    )}
                                    {(!user.morningIn || !user.morningIn.lateMinutes || user.morningIn.lateMinutes === 0) && (!user.afternoonIn || !user.afternoonIn.lateMinutes || user.afternoonIn.lateMinutes === 0) && user.earlyLeaveMinutes === 0 && (
                                      <span className="text-slate-400 text-xs">-</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      onClick={() => {
                                        setHistorySelectedUserId(user.userId);
                                        setActiveTab('history');
                                      }}
                                      title="Xem lịch sử điểm danh 1 tháng, 3 tháng của nhân viên này"
                                      className="text-indigo-600 hover:text-indigo-800 text-[11px] font-bold px-2 py-1 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors flex items-center gap-1"
                                    >
                                      <History className="w-3 h-3" />
                                      Lịch sử
                                    </button>
                                    <button
                                      onClick={() => setDetailsModalUser({ userId: user.userId, userName: user.userName, dateStr: (user as any)._dateStr || format(new Date(), 'yyyy-MM-dd') })}
                                      className="text-blue-600 hover:text-blue-800 text-[11px] font-bold px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                                    >
                                      Chi tiết
                                    </button>
                                    {(canDelete) && (
                                      <button
                                        onClick={() => {
                                          const dateToDel = (user as any)._dateStr || format(new Date(), 'yyyy-MM-dd');
                                          if (deleteUserDayConfirmId === user.userId + '_' + dateToDel) {
                                            handleDeleteUserDayRecords(user.userId, dateToDel);
                                            setDeleteUserDayConfirmId(null);
                                          } else {
                                            setDeleteUserDayConfirmId(user.userId + '_' + dateToDel);
                                          }
                                        }}
                                        className="text-red-600 hover:text-red-800 text-[11px] font-bold px-2 py-1 bg-red-50 rounded"
                                      >
                                        {deleteUserDayConfirmId === user.userId + '_' + ((user as any)._dateStr || format(new Date(), 'yyyy-MM-dd')) ? 'Chắc chắn?' : 'Xóa'}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ));
                            })()}
                          </tbody>
                        </table>
                      )}
                    </div>
                    
                    {/* Phân trang Today */}
                    {records.length > 0 && (() => {
                      let grouped = groupRecordsByUser(records, todaySortOrder, todayDateMode === 'range');
                      if (todayUserFilter) {
                        const targetUser = users.find(u => u.uid === todayUserFilter);
                        const targetName = targetUser?.name?.trim().toLowerCase();
                        grouped = grouped.filter(u => 
                          u.userId === todayUserFilter || 
                          (targetName && u.userName && u.userName.trim().toLowerCase() === targetName)
                        );
                      }
                      if (todayDepartmentFilter) {
                        grouped = grouped.filter(u => u.department === todayDepartmentFilter);
                      }
                      if (todayLateFilter === 'late_morning') {
                        grouped = grouped.filter(u => u.morningIn && u.morningIn.lateMinutes && u.morningIn.lateMinutes > 0);
                      } else if (todayLateFilter === 'late_afternoon') {
                        grouped = grouped.filter(u => u.afternoonIn && u.afternoonIn.lateMinutes && u.afternoonIn.lateMinutes > 0);
                      }
                      if (todaySearchText.trim()) {
                        const q = todaySearchText.trim().toLowerCase();
                        grouped = grouped.filter(u => 
                          (u.userName && u.userName.toLowerCase().includes(q)) || 
                          (u.userId && String(u.userId).toLowerCase().includes(q)) ||
                          (u.department && u.department.toLowerCase().includes(q))
                        );
                      }
                      const perPage = itemsPerPageToday || 20;
                      const totalPages = Math.ceil(grouped.length / perPage) || 1;
                      const startIndex = (currentPageToday - 1) * perPage;

                      return (
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-200 bg-white">
                          <div className="text-xs text-slate-500">
                            Hiển thị <span className="font-bold text-slate-700">{grouped.length > 0 ? startIndex + 1 : 0}</span> - <span className="font-bold text-slate-700">{Math.min(startIndex + perPage, grouped.length)}</span> trong tổng số <span className="font-bold text-blue-600">{grouped.length}</span> {todayDateMode === 'range' ? 'lượt theo ngày' : 'nhân sự'} ({records.length} lượt điểm danh)
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">
                              Trang {currentPageToday} / {totalPages}
                            </span>
                            <div className="flex gap-1">
                              <button 
                                disabled={currentPageToday === 1}
                                onClick={() => setCurrentPageToday(1)}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded text-xs font-medium transition-colors"
                                title="Về trang đầu"
                              >
                                Đầu
                              </button>
                              <button 
                                disabled={currentPageToday === 1}
                                onClick={() => setCurrentPageToday(p => Math.max(1, p - 1))}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded text-xs font-medium transition-colors"
                              >
                                Trước
                              </button>
                              <button 
                                disabled={currentPageToday >= totalPages}
                                onClick={() => setCurrentPageToday(p => p + 1)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded text-xs font-medium transition-colors"
                              >
                                Sau
                              </button>
                              <button 
                                disabled={currentPageToday >= totalPages}
                                onClick={() => setCurrentPageToday(totalPages)}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded text-xs font-medium transition-colors"
                                title="Đến trang cuối"
                              >
                                Cuối
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {activeTab === 'history' && (
                  <AttendanceHistory
                    users={users}
                    departments={departments}
                    config={config}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    initialUserId={historySelectedUserId || (users[0]?.uid || '')}
                  />
                )}
                
                {activeTab === 'month' && (
                  <div className="flex flex-col h-full overflow-hidden bg-slate-100">
                    <div className="bg-slate-800 px-4 py-2 flex items-center justify-between gap-3 border-b border-slate-700 text-white shrink-0">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-400" />
                        <span className="font-bold text-xs uppercase tracking-wide">QUẢN LÝ LỊCH TRỰC BỆNH VIỆN</span>
                      </div>
                      <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-700 text-xs font-bold">
                        <button
                          onClick={() => setDutySubTab('hospital')}
                          className={`px-3 py-1 rounded-lg transition-all ${
                            dutySubTab === 'hospital' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Mẫu Lịch trực Bệnh viện (Chuẩn BV Thiệu Hóa)
                        </button>
                        <button
                          onClick={() => setDutySubTab('staff_matrix')}
                          className={`px-3 py-1 rounded-lg transition-all ${
                            dutySubTab === 'staff_matrix' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Phân ca & Danh sách nhân viên
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-hidden">
                      {dutySubTab === 'hospital' ? (
                        <HospitalDutyScheduleView
                          users={users}
                          departments={departments}
                          canEdit={canEdit}
                          canDelete={canDelete}
                        />
                      ) : (
                        <DutyScheduleManager
                          users={users}
                          departments={departments}
                          canEdit={canEdit}
                          canDelete={canDelete}
                        />
                      )}
                    </div>
                  </div>
                )}
                
                {activeTab === 'statistics' && (
                  <div className="flex flex-col h-full overflow-hidden bg-slate-100">
                    {/* Header Chuyển đổi Báo cáo */}
                    <div className="bg-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 text-white shrink-0">
                      <div className="flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-blue-400" />
                        <span className="font-bold text-xs uppercase tracking-wide">TRUNG TÂM BÁO CÁO & THỐNG KÊ</span>
                      </div>
                      <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-700 text-xs font-bold">
                        <button
                          onClick={() => setReportSubTab('department_month')}
                          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                            reportSubTab === 'department_month' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <Building className="w-3.5 h-3.5" />
                          <span>Báo cáo Khoa/Phòng & Vắng chấm công cả tháng</span>
                        </button>
                        <button
                          onClick={() => setReportSubTab('charts')}
                          className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                            reportSubTab === 'charts' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <BarChart2 className="w-3.5 h-3.5" />
                          <span>Biểu đồ Chuyên cần Tổng quan</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-hidden">
                      {reportSubTab === 'department_month' ? (
                        <DepartmentMonthlyReport
                          users={users}
                          departments={departments}
                          canEdit={canEdit}
                          canDelete={canDelete}
                        />
                      ) : (
                        <div className="flex flex-col h-full overflow-hidden bg-slate-50">
                          <div className="p-4 border-b border-slate-200 bg-white shrink-0">
                            <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide">
                              Thống kê tỷ lệ chuyên cần (Năm {format(new Date(), 'yyyy')})
                            </h2>
                          </div>
                          
                          <div className="flex-1 overflow-auto p-4 flex flex-col gap-6">
                            {records.length === 0 ? (
                              <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                                Chưa có dữ liệu để thống kê.
                              </div>
                            ) : (
                              <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
                                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 text-center">Tỉ lệ điểm danh tổng quát</h3>
                                    <div className="h-48 w-full">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                          <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={40}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                          >
                                            {pieData.map((entry, index) => (
                                              <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                          </Pie>
                                          <Tooltip 
                                            formatter={(value: number) => [`${value} lượt`, 'Số lượng']}
                                          />
                                          <Legend verticalAlign="bottom" height={36}/>
                                        </PieChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>

                                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center items-center gap-4">
                                    <div className="text-center w-full">
                                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tổng lượt thành công</p>
                                      <p className="text-4xl font-bold text-green-600">{pieData[0]?.value || 0}</p>
                                    </div>
                                    <div className="text-center w-full">
                                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tổng lượt thất bại/lỗi</p>
                                      <p className="text-3xl font-bold text-red-500">{pieData[1]?.value || 0}</p>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-1 min-h-[300px]">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Biểu đồ chuyên cần theo ngày</h3>
                                    <div className="h-64 w-full">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                          data={chartData}
                                          margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                                        >
                                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                          <Tooltip 
                                            cursor={{fill: '#f1f5f9'}}
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                          />
                                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                          <Bar dataKey="success" name="Thành công" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                          <Bar dataKey="failed" name="Thất bại" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        </BarChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>
                                  
                                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-1 min-h-[300px]">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Biểu đồ chuyên cần theo khoa / phòng</h3>
                                    <div className="h-64 w-full">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                          data={deptChartData}
                                          layout="vertical"
                                          margin={{ top: 5, right: 10, left: 30, bottom: 5 }}
                                        >
                                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                          <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                          <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} width={80} />
                                          <Tooltip 
                                            cursor={{fill: '#f1f5f9'}}
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                          />
                                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                          <Bar dataKey="success" name="Thành công" fill="#16a34a" radius={[0, 4, 4, 0]} maxBarSize={30} />
                                          <Bar dataKey="failed" name="Thất bại" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={30} />
                                        </BarChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 gap-4 mt-4">
                                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex-1 min-h-[300px]">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Tỷ lệ đi làm đúng giờ / đi muộn theo tháng</h3>
                                    <div className="h-64 w-full">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                          data={monthlyChartData}
                                          margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                                        >
                                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                                          <Tooltip 
                                            cursor={{fill: '#f1f5f9'}}
                                            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                          />
                                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                          <Bar dataKey="onTime" name="Đúng giờ" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                          <Bar dataKey="late" name="Đi muộn" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        </BarChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}


                                {activeTab === 'departments' && (
                  <div className="flex flex-col h-full overflow-hidden bg-slate-50">
                    <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
                      <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide">
                        Quản lý Khoa/Phòng
                      </h2>
                    </div>
                    
                    <div className="p-4 bg-white border-b border-slate-200 shrink-0">
                      <form onSubmit={handleAddDepartment} className="flex gap-4 items-end">
                        <div className="flex-1">
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Tên Khoa/Phòng mới</label>
                          <input 
                            type="text" 
                            value={newDepartmentName}
                            onChange={(e) => setNewDepartmentName(e.target.value)}
                            placeholder="Nhập tên khoa/phòng..."
                            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        {canEdit && (<button 
                          type="submit"
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm transition-colors shadow-sm"
                        >
                          Thêm
                        </button>)}
                      </form>
                    </div>

                    <div className="flex-1 overflow-auto p-4">
                      {loadingDepartments ? (
                        <div className="p-8 text-center text-slate-500 text-sm">Đang tải danh sách...</div>
                      ) : (
                        <div className="bg-white rounded border border-slate-200 overflow-hidden">
                          <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                              <tr>
                                <th className="px-4 py-3">ID</th>
                                <th className="px-4 py-3">Tên Khoa/Phòng</th>
                                <th className="px-4 py-3 text-right">Thao tác</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {departments.slice((departmentsCurrentPage - 1) * departmentsPerPage, departmentsCurrentPage * departmentsPerPage).map((d, index) => (
                                <tr key={d.id} className="hover:bg-slate-50">
                                  <td className="px-4 py-3 text-slate-500 text-xs font-mono">{(departmentsCurrentPage - 1) * departmentsPerPage + index + 1}</td>
                                  <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                                  <td className="px-4 py-3 text-right">
                                    <button
                                      onClick={() => setEditingDepartment(d)}
                                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded transition-colors mr-2"
                                    >
                                      Sửa
                            </button>
                                                                        {deleteDeptConfirmId === d.id ? (
                                      <button
                                        onClick={() => handleDeleteDepartment(d.id)}
                                        className="text-xs text-white hover:text-white font-semibold bg-red-600 hover:bg-red-700 px-3 py-1 rounded transition-colors"
                                      >
                                        Chắc chắn?
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => setDeleteDeptConfirmId(d.id)}
                                        className="text-xs text-red-600 hover:text-red-800 font-semibold bg-red-50 hover:bg-red-100 px-3 py-1 rounded transition-colors"
                                      >
                                        Xóa
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {departments.length === 0 && (
                                <tr>
                                  <td colSpan={3} className="px-4 py-8 text-center text-slate-500 text-xs italic">
                                    Chưa có khoa phòng nào
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                      
                      {departments.length > 0 && !loadingDepartments && (
                        <div className="p-4 flex items-center justify-between border-t border-slate-200 bg-white shrink-0 mt-auto sticky bottom-0">
                          <span className="text-sm text-slate-500">
                            Hiển thị {(departmentsCurrentPage - 1) * departmentsPerPage + 1} - {Math.min(departmentsCurrentPage * departmentsPerPage, departments.length)} trong {departments.length} khoa/phòng
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setDepartmentsCurrentPage(p => Math.max(1, p - 1))}
                              disabled={departmentsCurrentPage === 1}
                              className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
                            >
                              Trước
                            </button>
                            <span className="text-sm font-medium">Trang {departmentsCurrentPage} / {Math.ceil(departments.length / departmentsPerPage) || 1}</span>
                            <button
                              onClick={() => setDepartmentsCurrentPage(p => Math.min(Math.ceil(departments.length / departmentsPerPage) || 1, p + 1))}
                              disabled={departmentsCurrentPage === (Math.ceil(departments.length / departmentsPerPage) || 1)}
                              className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
                            >
                              Sau
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                

                {activeTab === 'employees' && (
                  <div className="flex flex-col h-full overflow-hidden bg-slate-50">
                    <div className="p-4 border-b border-slate-200 bg-white flex flex-col md:flex-row md:justify-between md:items-center shrink-0 gap-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide mr-1">
                          Danh sách nhân sự
                        </h2>

                        {/* Status filter tabs */}
                        <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                          <button
                            onClick={() => { setUsersFilterStatus('all'); setUsersCurrentPage(1); }}
                            className={`px-2.5 py-1 rounded-md font-bold transition-all ${usersFilterStatus === 'all' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            Tất cả ({users.length})
                          </button>
                          <button
                            onClick={() => { setUsersFilterStatus('active'); setUsersCurrentPage(1); }}
                            className={`px-2.5 py-1 rounded-md font-bold transition-all ${usersFilterStatus === 'active' ? 'bg-green-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            Đang làm việc ({users.filter(u => !u.is_hidden && u.status !== 'inactive' && u.status !== 'locked').length})
                          </button>
                          <button
                            onClick={() => { setUsersFilterStatus('hidden'); setUsersCurrentPage(1); }}
                            className={`px-2.5 py-1 rounded-md font-bold transition-all ${usersFilterStatus === 'hidden' ? 'bg-red-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            Đã ẩn / Khóa ({users.filter(u => u.is_hidden || u.status === 'inactive' || u.status === 'locked').length})
                          </button>
                        </div>

                        <input
                          type="text"
                          placeholder="Tìm tên, mã NV, lý do..."
                          className="border border-slate-300 rounded px-2.5 py-1 text-sm bg-white min-w-[180px]"
                          value={usersSearchQuery}
                          onChange={(e) => {
                            setUsersSearchQuery(e.target.value);
                            setUsersCurrentPage(1);
                          }}
                        />
                        <select 
                          className="border border-slate-300 rounded px-2 py-1 text-sm bg-slate-50"
                          value={usersFilterDept}
                          onChange={(e) => {
                            setUsersFilterDept(e.target.value);
                            setUsersCurrentPage(1);
                          }}
                        >
                          <option value="">Tất cả khoa / phòng</option>
                          {departments.map(d => (
                            <option key={d.id} value={d.name}>{d.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* NÚT XUẤT EXCEL NHÂN SỰ */}
                        <div className="relative inline-flex items-center">
                          <button
                            type="button"
                            onClick={() => exportEmployeesToExcel(usersFilterDept || 'ALL')}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-l text-xs font-bold transition-all shadow-xs cursor-pointer"
                            title={usersFilterDept ? `Xuất Excel nhân sự Khoa / Phòng: ${usersFilterDept}` : 'Xuất Excel toàn bộ nhân sự'}
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Xuất Excel {usersFilterDept ? `(${usersFilterDept})` : 'toàn viện'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowEmployeeExportMenu(!showEmployeeExportMenu)}
                            className="px-2 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-r text-xs font-semibold border-l border-emerald-500 transition-colors flex items-center shadow-xs cursor-pointer"
                            title="Tùy chọn xuất Excel nhân sự"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>

                          {showEmployeeExportMenu && (
                            <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-150">
                              <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 flex items-center justify-between">
                                <span>Tùy chọn xuất Excel nhân sự</span>
                                <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">{users.length} người</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  exportEmployeesToExcel('ALL');
                                  setShowEmployeeExportMenu(false);
                                }}
                                className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 hover:text-emerald-800 flex flex-col transition-colors cursor-pointer"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-800">1. Xuất toàn bộ nhân sự (Tất cả khoa/phòng)</span>
                                  <span className="text-[10px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{users.length} NV</span>
                                </div>
                                <span className="text-[11px] text-slate-500 mt-0.5">Đầy đủ STT, Mã NV, Họ và tên, Khoa/Phòng, Chức danh, Vai trò, Trạng thái</span>
                              </button>

                              {usersFilterDept && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    exportEmployeesToExcel(usersFilterDept);
                                    setShowEmployeeExportMenu(false);
                                  }}
                                  className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 hover:text-emerald-800 flex flex-col transition-colors cursor-pointer border-t border-slate-100"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-emerald-700">2. Xuất riêng: {usersFilterDept}</span>
                                    <span className="text-[10px] font-bold bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-800">
                                      {users.filter(u => u.department === usersFilterDept).length} NV
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-slate-500 mt-0.5">Chỉ xuất danh sách nhân sự của khoa phòng đang lọc trên màn hình</span>
                                </button>
                              )}

                              <div className="border-t border-slate-100 px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Hoặc chọn một khoa / phòng cụ thể:
                              </div>
                              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                                {departments.map(d => {
                                  const count = users.filter(u => u.department === d.name).length;
                                  return (
                                    <button
                                      key={d.id}
                                      type="button"
                                      onClick={() => {
                                        exportEmployeesToExcel(d.name);
                                        setShowEmployeeExportMenu(false);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-slate-700 flex items-center justify-between transition-colors cursor-pointer"
                                    >
                                      <span className="truncate pr-2">{d.name}</span>
                                      <span className="text-[10px] font-semibold text-slate-400 shrink-0">{count} NV</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        {canEdit && (<button
                          onClick={handleOpenAddUserModal}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm transition-colors shadow-sm whitespace-nowrap cursor-pointer"
                        >
                          + Thêm nhân sự
                        </button>)}
                      </div>
                    </div>
                      
                    <div className="flex-1 overflow-auto flex flex-col">
                      {loadingUsers ? (
                        <div className="p-8 text-center text-slate-500 text-sm">Đang tải danh sách...</div>
                      ) : (
                        <>
                          <table className="w-full text-left border-collapse flex-1">
                            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                              <tr>
                                <th className="px-4 py-3 w-28">Mã NV</th>
                                <th className="px-4 py-3">Tên Nhân viên</th>
                                <th className="px-4 py-3">Vai trò</th>
                                <th className="px-4 py-3">Khoa/Phòng</th>
                                <th className="px-4 py-3">Chức vụ</th>
                                <th className="px-4 py-3">Trạng thái / Khóa</th>
                                <th className="px-4 py-3">Thiết bị chính chủ</th>
                                <th className="px-4 py-3 text-right">Thao tác</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {currentUsers.map((u, index) => {
                                const boundDev = userDevices.find(d => d.user_id === u.uid || (d.user_name?.toLowerCase() === u.name?.toLowerCase() && d.department === u.department));
                                const isLocked = u.is_hidden || u.status === 'inactive' || u.status === 'locked';
                                return (
                                <tr key={u.uid} className={`hover:bg-slate-50 transition-colors ${isLocked ? 'bg-red-50/20' : ''}`}>
                                  <td className="px-4 py-3 text-slate-500 font-mono text-xs font-semibold">
                                    {u.uid}
                                  </td>
                                  <td className="px-4 py-3 font-medium text-slate-900">
                                    <div className="flex items-center gap-1.5">
                                      <span>{u.name}</span>
                                      {isLocked && (
                                        <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.2 rounded font-bold">
                                          Khóa
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] text-slate-400 block font-normal">{u.email ? u.email.split('@')[0] : ''}</span>
                                  </td>
                                  <td className="px-4 py-3 text-slate-600 text-xs font-semibold">
                                    {u.role === 'super_admin' ? <span className="text-purple-600">QTV Cấp cao</span> : 
                                     u.role === 'admin' ? <span className="text-blue-600">Quản lý</span> : 
                                     <span className="text-slate-500">Nhân viên</span>}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600 text-xs">
                                    {u.department || <span className="text-red-500 italic">Chưa cập nhật</span>}
                                  </td>
                                  <td className="px-4 py-3 text-xs">
                                      <span className={`px-2 py-1 inline-block rounded font-semibold uppercase tracking-wider text-[10px] border ${getPositionBadgeClass(u.position || 'Nhân viên')}`}>
                                        {u.position || 'Nhân viên'}
                                      </span>
                                  </td>
                                  <td className="px-4 py-3 text-xs">
                                    {isLocked ? (
                                      <div className="flex flex-col gap-0.5 items-start">
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200" title={u.lock_reason || 'Đã ẩn/khóa'}>
                                          <Lock className="w-3 h-3 text-red-600 shrink-0" />
                                          Đã ẩn / Khóa
                                        </span>
                                        {u.lock_reason && (
                                          <span className="text-[10px] text-red-700 font-medium italic truncate max-w-[140px]" title={u.lock_reason}>
                                            {u.lock_reason}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                                        <CheckCircle className="w-3 h-3 text-green-600 shrink-0" />
                                        Đang làm việc
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-xs">
                                    {boundDev ? (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200" title={`Model: ${boundDev.device_info?.deviceModel || 'Di động'} (${boundDev.device_info?.os || ''})`}>
                                          <Lock className="w-3 h-3 text-green-600 shrink-0" />
                                          {boundDev.device_info?.deviceModel || 'Đã khóa'}
                                        </span>
                                        {canEdit && (
                                          unbindConfirmId === u.uid ? (
                                            <div className="flex items-center gap-1">
                                              <button
                                                onClick={() => handleUnbindDevice(boundDev.user_id || u.uid, u.name, boundDev.device_fingerprint)}
                                                disabled={unbindingUserId === (boundDev.user_id || u.uid)}
                                                className="text-[10px] text-white font-bold bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded transition-colors shadow-sm animate-pulse flex items-center gap-0.5"
                                              >
                                                {unbindingUserId === (boundDev.user_id || u.uid) ? 'Đang mở...' : 'Xác nhận?'}
                                              </button>
                                              <button
                                                onClick={() => setUnbindConfirmId(null)}
                                                className="text-[10px] text-slate-500 hover:text-slate-700 font-medium bg-slate-100 px-1.5 py-0.5 rounded"
                                              >
                                                Hủy
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => setUnbindConfirmId(u.uid)}
                                              title="Mở khóa để nhân viên đổi điện thoại mới"
                                              className="text-[10px] text-red-600 hover:text-white font-semibold bg-red-50 hover:bg-red-600 px-2 py-0.5 rounded border border-red-200 hover:border-red-600 transition-all flex items-center gap-1 shadow-sm"
                                            >
                                              <Unlock className="w-3 h-3" />
                                              Mở khóa
                                            </button>
                                          )
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 text-xs italic">Chưa liên kết</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right whitespace-nowrap">
                                    {canEdit && (
                                      isLocked ? (
                                        <button
                                          onClick={() => handleToggleLockUser(u, false)}
                                          title="Mở khóa tài khoản để nhân viên điểm danh trở lại"
                                          className="text-xs text-green-700 hover:text-white font-semibold bg-green-50 hover:bg-green-600 px-2.5 py-1 rounded-lg border border-green-300 hover:border-green-600 transition-colors mr-1.5 inline-flex items-center gap-1 shadow-xs"
                                        >
                                          <Unlock className="w-3 h-3" /> Mở khóa
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => {
                                            setLockingUser(u);
                                            setLockReasonChoice('Nghỉ việc');
                                            setCustomLockReason('');
                                          }}
                                          title="Khóa/Ẩn người này (nghỉ việc, đi học, thai sản...) để không hiển thị khi điểm danh"
                                          className="text-xs text-amber-700 hover:text-white font-semibold bg-amber-50 hover:bg-amber-600 px-2.5 py-1 rounded-lg border border-amber-300 hover:border-amber-600 transition-colors mr-1.5 inline-flex items-center gap-1 shadow-xs"
                                        >
                                          <Lock className="w-3 h-3" /> Ẩn / Khóa
                                        </button>
                                      )
                                    )}
                                    <button
                                        onClick={() => setEditingUser(u)}
                                        className="text-xs text-blue-600 hover:text-blue-800 font-semibold bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors mr-1.5"
                                      >
                                        Cập nhật
                                    </button>
                                    {deleteUserConfirmId === u.uid ? (
                                        <button
                                          onClick={() => handleDeleteUser(u.uid)}
                                          className="text-xs text-white hover:text-white font-semibold bg-red-600 hover:bg-red-700 px-2.5 py-1 rounded-lg transition-colors"
                                        >
                                          Chắc chắn?
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => setDeleteUserConfirmId(u.uid)}
                                          className="text-xs text-red-600 hover:text-red-800 font-semibold bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
                                        >
                                          Xóa
                                        </button>
                                      )}
                                  </td>
                                </tr>
                              );
                              })}
                              {users.length === 0 && (
                                <tr>
                                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500 text-xs italic">
                                    Chưa có nhân viên nào trên hệ thống
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                          
                          {/* Pagination */}
                          {filteredUsers.length > 0 && (
                            <div className="p-4 flex items-center justify-between border-t border-slate-200 bg-white shrink-0 mt-auto sticky bottom-0">
                              <span className="text-sm text-slate-500">
                                Hiển thị {(usersCurrentPage - 1) * usersPerPage + 1} - {Math.min(usersCurrentPage * usersPerPage, filteredUsers.length)} trong {filteredUsers.length} nhân sự
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setUsersCurrentPage(p => Math.max(1, p - 1))}
                                  disabled={usersCurrentPage === 1}
                                  className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
                                >
                                  Trước
                                </button>
                                <span className="text-sm font-medium">Trang {usersCurrentPage} / {totalPages}</span>
                                <button
                                  onClick={() => setUsersCurrentPage(p => Math.min(totalPages, p + 1))}
                                  disabled={usersCurrentPage === totalPages}
                                  className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
                                >
                                  Sau
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
                
                {activeTab === 'notifications' && (
                  <div className="flex flex-col h-full overflow-hidden bg-slate-50">
                    <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
                      <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
                        <Bell className="w-5 h-5 text-blue-600"/> Quản lý Thông báo
                      </h2>
                    </div>
                    
                    <div className="p-4 bg-white border-b border-slate-200 shrink-0">
                      <form onSubmit={handleAddNotification} className="flex flex-col gap-4">
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Tiêu đề</label>
                            <input 
                              type="text" 
                              value={newNotif.title}
                              onChange={(e) => setNewNotif({...newNotif, title: e.target.value})}
                              placeholder="Nhập tiêu đề..."
                              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              required
                            />
                          </div>
                          <div className="w-48">
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Loại thông báo</label>
                            <select 
                              value={newNotif.type}
                              onChange={(e) => setNewNotif({...newNotif, type: e.target.value})}
                              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="info">Thông tin (Xanh)</option>
                              <option value="warning">Cảnh báo (Cam)</option>
                              <option value="error">Quan trọng (Đỏ)</option>
                              <option value="success">Tin tốt (Xanh lá)</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Nội dung</label>
                          <textarea 
                            value={newNotif.content}
                            onChange={(e) => setNewNotif({...newNotif, content: e.target.value})}
                            placeholder="Nhập nội dung chi tiết..."
                            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-h-[80px]"
                            required
                          />
                        </div>
                        <div className="flex justify-end">
                          <button 
                            type="submit"
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg text-sm transition-colors flex items-center gap-2"
                          >
                            <Plus className="w-4 h-4" /> Thêm thông báo
                          </button>
                        </div>
                      </form>
                    </div>

                    <div className="flex-1 overflow-auto p-4">
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="min-w-full divide-y divide-slate-200">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Trạng thái</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Loại</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Tiêu đề & Nội dung</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Ngày tạo</th>
                              <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {notifications.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">Chưa có thông báo nào.</td>
                              </tr>
                            ) : notifications.map((notif) => (
                              <tr key={notif.id} className={notif.is_active ? 'bg-white' : 'bg-slate-50 opacity-60'}>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <button 
                                    onClick={() => handleToggleNotification(notif)}
                                    className={`px-2 py-1 rounded text-xs font-bold ${notif.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}
                                  >
                                    {notif.is_active ? 'Đang bật' : 'Đã tắt'}
                                  </button>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`px-2 py-1 rounded text-xs font-bold uppercase
                                    ${notif.type === 'error' ? 'bg-red-100 text-red-700' : 
                                      notif.type === 'warning' ? 'bg-orange-100 text-orange-700' :
                                      notif.type === 'success' ? 'bg-green-100 text-green-700' : 
                                      'bg-blue-100 text-blue-700'}`}
                                  >
                                    {notif.type}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="font-bold text-sm text-slate-800">{notif.title}</div>
                                  <div className="text-sm text-slate-500 truncate max-w-md">{notif.content}</div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-500">
                                  {new Date(notif.created_at).toLocaleString('vi-VN')}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right">
                                  <button 
                                    onClick={() => handleDeleteNotification(notif.id)}
                                    className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                                    title="Xóa"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'failed_logs' && (() => {
                  // Lọc dữ liệu lỗi theo từ khóa tìm kiếm, phòng ban và phân loại lỗi
                  const filteredFailedRecords = failedRecords.filter(r => {
                    if (failedSearchQuery.trim()) {
                      const query = removeVietnameseTones(failedSearchQuery.trim());
                      const nameMatch = removeVietnameseTones(r.userName || r.user_name || '').includes(query);
                      const idMatch = (r.userId || r.user_id || '').toLowerCase().includes(query.toLowerCase());
                      const reasonMatch = removeVietnameseTones(r.reason || '').includes(query);
                      const deptMatch = removeVietnameseTones(r.department || '').includes(query);
                      if (!nameMatch && !idMatch && !reasonMatch && !deptMatch) return false;
                    }
                    if (failedDeptFilter && r.department !== failedDeptFilter) {
                      return false;
                    }
                    if (failedTypeFilter === 'device') {
                      const isDevice = r.status === 'device_mismatch' || r.status === 'device_unauthorized' || (r.reason && r.reason.includes('hộ'));
                      if (!isDevice) return false;
                    } else if (failedTypeFilter === 'range') {
                      const isRange = r.status === 'out_of_range' || (r.reason && r.reason.toLowerCase().includes('khoảng cách'));
                      if (!isRange) return false;
                    } else if (failedTypeFilter === 'other') {
                      const isDevice = r.status === 'device_mismatch' || r.status === 'device_unauthorized' || (r.reason && r.reason.includes('hộ'));
                      const isRange = r.status === 'out_of_range' || (r.reason && r.reason.toLowerCase().includes('khoảng cách'));
                      if (isDevice || isRange) return false;
                    }
                    return true;
                  });

                  const totalFailedCount = filteredFailedRecords.length;
                  // Số trang được tạo CHÍNH XÁC dựa trên số dòng có dữ liệu, không tạo trang trống
                  const failedTotalPages = totalFailedCount > 0 ? Math.ceil(totalFailedCount / failedPerPage) : 0;
                  const safeFailedCurrentPage = failedTotalPages > 0 ? Math.min(Math.max(1, failedCurrentPage), failedTotalPages) : 1;
                  
                  // Chỉ lấy dữ liệu cho trang hiện tại
                  const paginatedFailedRecords = totalFailedCount > 0
                    ? filteredFailedRecords.slice((safeFailedCurrentPage - 1) * failedPerPage, safeFailedCurrentPage * failedPerPage)
                    : [];

                  const countDeviceMismatch = filteredFailedRecords.filter(r => r.status === 'device_mismatch' || r.status === 'device_unauthorized' || (r.reason && r.reason.includes('hộ'))).length;
                  const countOutOfRange = filteredFailedRecords.filter(r => r.status === 'out_of_range' || (r.reason && r.reason.toLowerCase().includes('khoảng cách'))).length;

                  // Hàm tạo danh sách số trang hiển thị
                  const getPageNumbers = () => {
                    if (failedTotalPages <= 7) {
                      return Array.from({ length: failedTotalPages }, (_, i) => i + 1);
                    }
                    const pages: (number | string)[] = [1];
                    if (safeFailedCurrentPage > 3) pages.push('...');
                    const start = Math.max(2, safeFailedCurrentPage - 1);
                    const end = Math.min(failedTotalPages - 1, safeFailedCurrentPage + 1);
                    for (let i = start; i <= end; i++) pages.push(i);
                    if (safeFailedCurrentPage < failedTotalPages - 2) pages.push('...');
                    pages.push(failedTotalPages);
                    return pages;
                  };

                  return (
                    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
                      {/* HEADER & THANH ĐIỀU HƯỚNG BỘ LỌC */}
                      <div className="p-4 border-b border-slate-200 bg-white shrink-0 space-y-3 shadow-xs">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600 font-bold shrink-0">
                              <AlertTriangle className="w-4 h-4" />
                            </div>
                            <div>
                              <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
                                Nhật ký điểm danh Lỗi / Thất bại
                                {totalFailedCount > 0 && (
                                  <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                                    {totalFailedCount}
                                  </span>
                                )}
                              </h2>
                              <p className="text-[11px] text-slate-500">
                                Giám sát các lần điểm danh không thành công, phát hiện điểm danh hộ và ngoài bán kính
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => {
                                setFailedCurrentPage(1);
                                fetchFailedRecords(failedDateRangeMode, failedCustomDate);
                              }} 
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors shadow-xs"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 
                              Làm mới
                            </button>
                          </div>
                        </div>

                        {/* THANH CHỌN MỐC THỜI GIAN */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                          <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            Thời gian:
                          </span>
                          
                          <div className="flex flex-wrap gap-1">
                            {[
                              { id: 'today', label: 'Hôm nay' },
                              { id: 'yesterday', label: 'Hôm qua' },
                              { id: '7days', label: '7 ngày qua' },
                              { id: '30days', label: '30 ngày qua' },
                              { id: 'all', label: 'Tất cả' },
                              { id: 'custom', label: 'Chọn ngày' }
                            ].map((tab) => (
                              <button
                                key={tab.id}
                                onClick={() => {
                                  setFailedDateRangeMode(tab.id as any);
                                  setFailedCurrentPage(1);
                                  fetchFailedRecords(tab.id as any, failedCustomDate);
                                }}
                                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                                  failedDateRangeMode === tab.id
                                    ? 'bg-blue-600 text-white shadow-xs'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>

                          {failedDateRangeMode === 'custom' && (
                            <input 
                              type="date" 
                              value={failedCustomDate}
                              onChange={(e) => {
                                setFailedCustomDate(e.target.value);
                                setFailedCurrentPage(1);
                                fetchFailedRecords('custom', e.target.value);
                              }}
                              className="px-2 py-0.5 border border-blue-300 rounded text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                            />
                          )}
                        </div>

                        {/* BỘ LỌC TÌM KIẾM VÀ PHÂN LOẠI */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-1">
                          {/* Search Input */}
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              placeholder="Tìm theo tên, mã NV, lý do..."
                              value={failedSearchQuery}
                              onChange={(e) => {
                                setFailedSearchQuery(e.target.value);
                                setFailedCurrentPage(1);
                              }}
                              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all font-medium"
                            />
                          </div>

                          {/* Department Filter */}
                          <div>
                            <select
                              value={failedDeptFilter}
                              onChange={(e) => {
                                setFailedDeptFilter(e.target.value);
                                setFailedCurrentPage(1);
                              }}
                              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-slate-700"
                            >
                              <option value="">Tất cả Khoa / Phòng</option>
                              {departments.map(d => (
                                <option key={d.id} value={d.name}>{d.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Error Type Filter */}
                          <div>
                            <select
                              value={failedTypeFilter}
                              onChange={(e) => {
                                setFailedTypeFilter(e.target.value as any);
                                setFailedCurrentPage(1);
                              }}
                              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold text-slate-700"
                            >
                              <option value="all">Tất cả loại lỗi ({filteredFailedRecords.length})</option>
                              <option value="device">🛡️ Phát hiện điểm danh hộ ({countDeviceMismatch})</option>
                              <option value="range">📍 Ngoài bán kính GPS ({countOutOfRange})</option>
                              <option value="other">⚠️ Lỗi hệ thống / Khác</option>
                            </select>
                          </div>

                          {/* Items Per Page Selector */}
                          <div className="flex items-center justify-end gap-1.5 text-xs text-slate-500 font-medium">
                            <span>Hiển thị:</span>
                            <select
                              value={failedPerPage}
                              onChange={(e) => {
                                setFailedPerPage(Number(e.target.value));
                                setFailedCurrentPage(1);
                              }}
                              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-slate-700 focus:outline-none"
                            >
                              <option value={10}>10 dòng/trang</option>
                              <option value={15}>15 dòng/trang</option>
                              <option value={25}>25 dòng/trang</option>
                              <option value={50}>50 dòng/trang</option>
                              <option value={100}>100 dòng/trang</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      
                      {/* BẢNG DỮ LIỆU ĐIỂM DANH LỖI (CHIA TRANG THỰC SỰ - KHÔNG CÓ TRANG TRẮNG) */}
                      <div className="flex-1 overflow-auto p-4 flex flex-col justify-between">
                        {loading ? (
                          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mb-3"></div>
                            <p className="text-xs text-slate-500 font-medium">Đang tải nhật ký điểm danh lỗi...</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                            <table className="w-full text-left whitespace-nowrap">
                              <thead className="bg-slate-50 text-xs text-slate-500 font-bold border-b border-slate-200">
                                <tr>
                                  <th className="px-4 py-3 text-center w-12">STT</th>
                                  <th className="px-4 py-3">Thời gian</th>
                                  <th className="px-4 py-3">Họ tên & Mã NV</th>
                                  <th className="px-4 py-3">Khoa / Phòng</th>
                                  <th className="px-4 py-3 text-center">Ca</th>
                                  <th className="px-4 py-3">Nguyên nhân & Thiết bị</th>
                                  <th className="px-4 py-3 text-right">Thao tác</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                                {paginatedFailedRecords.length === 0 ? (
                                  <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                                      <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-3">
                                          <CheckCircle className="w-6 h-6 text-emerald-500" />
                                        </div>
                                        <p className="font-bold text-slate-700 text-sm mb-1">Không có dữ liệu lỗi điểm danh</p>
                                        <p className="text-xs text-slate-400">
                                          {failedSearchQuery || failedDeptFilter || failedTypeFilter !== 'all' 
                                            ? 'Không tìm thấy kết quả nào phù hợp với bộ lọc hiện tại.' 
                                            : 'Không ghi nhận trường hợp điểm danh lỗi nào trong khoảng thời gian này.'}
                                        </p>
                                      </div>
                                    </td>
                                  </tr>
                                ) : (
                                  paginatedFailedRecords.map((r, idx) => {
                                    const stt = (safeFailedCurrentPage - 1) * failedPerPage + idx + 1;
                                    const isDeviceMismatch = r.status === 'device_mismatch' || r.status === 'device_unauthorized' || (r.reason && r.reason.includes('hộ'));
                                    const isOutOfRange = r.status === 'out_of_range' || (r.reason && r.reason.toLowerCase().includes('khoảng cách'));

                                    return (
                                      <tr key={r.id || idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-center text-xs font-mono font-bold text-slate-400">
                                          {stt}
                                        </td>
                                        <td className="px-4 py-3">
                                          <div className="font-bold text-slate-900 text-xs">
                                            {format(new Date(r.timestamp), 'HH:mm:ss')}
                                          </div>
                                          <div className="text-[11px] text-slate-400 font-mono">
                                            {r.dateStr || (r.timestamp ? format(new Date(r.timestamp), 'dd/MM/yyyy') : '-')}
                                          </div>
                                        </td>
                                        <td className="px-4 py-3">
                                          <div className="font-bold text-slate-900 text-sm">{r.userName || r.user_name || 'Không xác định'}</div>
                                          <div className="flex items-center gap-1 mt-0.5">
                                            <span className="text-[10.5px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded inline-block">
                                              Mã NV: {r.userId || r.user_id || '-'}
                                            </span>
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700 font-medium text-xs">
                                          <span className="bg-slate-100 px-2 py-1 rounded text-slate-700 font-semibold inline-block">
                                            {r.department || 'Chưa cập nhật'}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          {r.type === 'in' ? (
                                            <span className="text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full text-[11px] font-bold inline-block">
                                              Vào ca
                                            </span>
                                          ) : (
                                            <span className="text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full text-[11px] font-bold inline-block">
                                              Ra ca
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3">
                                          {isDeviceMismatch ? (
                                            <div className="space-y-1">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="bg-red-100 text-red-800 text-[10px] font-extrabold px-2 py-0.5 rounded border border-red-300 uppercase inline-flex items-center gap-1">
                                                  <ShieldCheck className="w-3 h-3 text-red-600 shrink-0" />
                                                  Phát hiện điểm danh hộ
                                                </span>
                                                <span className="text-red-700 font-bold text-xs">{r.reason}</span>
                                              </div>
                                              {r.deviceInfo && (
                                                <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2 flex-wrap">
                                                  {r.deviceInfo.deviceType && <span>Thiết bị: {r.deviceInfo.deviceType}</span>}
                                                  {r.deviceInfo.browser && <span>Duyệt: {r.deviceInfo.browser}</span>}
                                                  {r.deviceInfo.os && <span>HĐH: {r.deviceInfo.os}</span>}
                                                </div>
                                              )}
                                            </div>
                                          ) : isOutOfRange ? (
                                            <div className="space-y-1">
                                              <div className="flex items-center gap-1.5">
                                                <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded border border-amber-300 uppercase inline-flex items-center gap-1">
                                                  <MapPin className="w-3 h-3 text-amber-600 shrink-0" />
                                                  Ngoài bán kính
                                                </span>
                                                <span className="text-amber-800 font-semibold text-xs">{r.reason || 'Vượt quá khoảng cách điểm danh cho phép'}</span>
                                              </div>
                                              {r.distance !== undefined && (
                                                <div className="text-[11px] text-slate-500 font-mono">
                                                  Khoảng cách ghi nhận: <b className="text-amber-700">{Math.round(r.distance)}m</b> (Cho phép: {config.radius}m)
                                                </div>
                                              )}
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-1.5">
                                              <span className="bg-slate-100 text-slate-700 text-[10px] font-extrabold px-2 py-0.5 rounded border border-slate-300 uppercase">
                                                Lỗi khác
                                              </span>
                                              <span className="text-red-600 font-medium text-xs">{r.reason || r.status}</span>
                                            </div>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                          {isDeviceMismatch && canEdit ? (
                                            unbindConfirmId === (r.userId || r.user_id) ? (
                                              <div className="flex items-center justify-end gap-1">
                                                <button
                                                  onClick={() => handleUnbindDevice(r.userId || r.user_id, r.userName || r.user_name, r.deviceInfo?.fingerprint)}
                                                  disabled={unbindingUserId === (r.userId || r.user_id)}
                                                  className="text-[10px] text-white font-bold bg-red-600 hover:bg-red-700 px-2 py-1 rounded transition-colors shadow-xs animate-pulse"
                                                >
                                                  {unbindingUserId === (r.userId || r.user_id) ? 'Đang mở...' : 'Xác nhận mở?'}
                                                </button>
                                                <button
                                                  onClick={() => setUnbindConfirmId(null)}
                                                  className="text-[10px] text-slate-500 hover:text-slate-700 font-medium bg-slate-100 px-1.5 py-1 rounded"
                                                >
                                                  Hủy
                                                </button>
                                              </div>
                                            ) : (
                                              <button
                                                onClick={() => setUnbindConfirmId(r.userId || r.user_id)}
                                                className="text-[11px] text-blue-700 hover:text-white font-bold bg-blue-50 hover:bg-blue-600 px-2.5 py-1 rounded border border-blue-200 hover:border-blue-600 transition-all inline-flex items-center gap-1 shadow-xs"
                                                title="Cho phép nhân viên sử dụng thiết bị mới để điểm danh"
                                              >
                                                <Unlock className="w-3 h-3" />
                                                Mở khóa máy
                                              </button>
                                            )
                                          ) : (
                                            <span className="text-[11px] text-slate-300">-</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* THANH PHÂN TRANG (CHỈ XUẤT HIỆN KHI CÓ DỮ LIỆU - KHÔNG TẠO TRANG TRỐNG) */}
                        {failedTotalPages > 0 && (
                          <div className="mt-4 px-4 py-3 bg-white rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                            <div className="text-xs text-slate-600 font-medium">
                              Hiển thị <b className="text-slate-800">{(safeFailedCurrentPage - 1) * failedPerPage + 1}</b> - <b className="text-slate-800">{Math.min(safeFailedCurrentPage * failedPerPage, totalFailedCount)}</b> trên tổng số <b className="text-red-600">{totalFailedCount}</b> bản ghi lỗi
                            </div>

                            {failedTotalPages > 1 && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setFailedCurrentPage(1)}
                                  disabled={safeFailedCurrentPage === 1}
                                  className="px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-xs font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  title="Trang đầu"
                                >
                                  «
                                </button>
                                <button
                                  onClick={() => setFailedCurrentPage(p => Math.max(1, p - 1))}
                                  disabled={safeFailedCurrentPage === 1}
                                  className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-xs font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  Trước
                                </button>

                                <div className="flex items-center gap-1 mx-1">
                                  {getPageNumbers().map((page, pIdx) => {
                                    if (page === '...') {
                                      return <span key={`ellipsis-${pIdx}`} className="px-1.5 text-xs text-slate-400 font-bold">...</span>;
                                    }
                                    const pageNum = page as number;
                                    const isActive = pageNum === safeFailedCurrentPage;
                                    return (
                                      <button
                                        key={pageNum}
                                        onClick={() => setFailedCurrentPage(pageNum)}
                                        className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition-all ${
                                          isActive
                                            ? 'bg-blue-600 text-white shadow-xs scale-105'
                                            : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-700'
                                        }`}
                                      >
                                        {pageNum}
                                      </button>
                                    );
                                  })}
                                </div>

                                <button
                                  onClick={() => setFailedCurrentPage(p => Math.min(failedTotalPages, p + 1))}
                                  disabled={safeFailedCurrentPage === failedTotalPages}
                                  className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-xs font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  Sau
                                </button>
                                <button
                                  onClick={() => setFailedCurrentPage(failedTotalPages)}
                                  disabled={safeFailedCurrentPage === failedTotalPages}
                                  className="px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-xs font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  title="Trang cuối"
                                >
                                  »
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {activeTab === 'settings' && (
                  <div className="flex flex-col h-full overflow-hidden bg-slate-50">
                    <div className="p-4 border-b border-slate-200 bg-white shrink-0">
                      <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide">
                        Cài đặt hệ thống
                      </h2>
                    </div>
                    
                    <div className="flex-1 overflow-auto p-4 flex flex-col gap-6">
                      <form onSubmit={handleSaveConfig} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-2xl">
                        {saveConfigSuccess && (
                          <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200">
                            {saveConfigSuccess}
                          </div>
                        )}
                        <h3 className="text-sm font-bold text-slate-700 mb-4 border-b pb-2">Khung giờ điểm danh</h3>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Ca Sáng Bắt Đầu (24h)</label>
                            <input 
                              type="text"
                              pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$"
                              placeholder="VD: 07:30"
                              title="Nhập thời gian định dạng 24h (VD: 07:30)"
                              value={config.morningStart} 
                              onChange={e => setConfig({...config, morningStart: e.target.value})}
                              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Ca Sáng Kết Thúc (24h)</label>
                            <input 
                              type="text"
                              pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$"
                              placeholder="VD: 11:30"
                              title="Nhập thời gian định dạng 24h (VD: 11:30)"
                              value={config.morningEnd} 
                              onChange={e => setConfig({...config, morningEnd: e.target.value})}
                              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Ca Chiều Bắt Đầu (24h)</label>
                            <input 
                              type="text"
                              pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$"
                              placeholder="VD: 13:30"
                              title="Nhập thời gian định dạng 24h (VD: 13:30)"
                              value={config.afternoonStart} 
                              onChange={e => setConfig({...config, afternoonStart: e.target.value})}
                              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Ca Chiều Kết Thúc (24h)</label>
                            <input 
                              type="text"
                              pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$"
                              placeholder="VD: 17:00"
                              title="Nhập thời gian định dạng 24h (VD: 17:00)"
                              value={config.afternoonEnd} 
                              onChange={e => setConfig({...config, afternoonEnd: e.target.value})}
                              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                            />
                          </div>
                        </div>
                        {canEdit && (
                          <div className="flex justify-start mt-2">
                            <button 
                              type="button"
                              onClick={() => alert('Tính năng thêm ca mới sẽ được cập nhật trong phiên bản sau.')}
                              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-sm transition-colors border border-slate-300"
                            >
                              + Thêm khung giờ khác
                            </button>
                          </div>
                        )}

                        <h3 className="text-sm font-bold text-slate-700 mb-4 border-b pb-2 mt-8 flex items-center justify-between">
                          <span>Cấu hình Vị trí & Khoảng cách</span>
                          <button
                            type="button"
                            onClick={handleGetCurrentGpsForAdmin}
                            disabled={gettingAdminGps}
                            className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            <MapPin className="w-3.5 h-3.5 text-blue-600" />
                            {gettingAdminGps ? 'Đang lấy toạ độ GPS...' : 'Lấy toạ độ GPS hiện tại làm tâm'}
                          </button>
                        </h3>
                        <div className="grid grid-cols-1 gap-4 mb-6">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Bán kính giới hạn điểm danh (mét)</label>
                            <input 
                              type="number" 
                              value={config.radius ?? ''} 
                              onChange={e => setConfig({...config, radius: e.target.value === '' ? ('' as any) : Number(e.target.value)})}
                              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono" 
                            />
                            <p className="text-[10px] text-slate-500 mt-1">Khoảng cách tối đa từ tâm bệnh viện mà nhân viên có thể điểm danh thành công.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mt-2">
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1">Vĩ độ tâm (Target Lat)</label>
                              <input 
                                type="number" 
                                step="any"
                                value={config.targetLat ?? ''} 
                                onChange={e => setConfig({...config, targetLat: e.target.value === '' ? ('' as any) : Number(e.target.value)})}
                                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono" 
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1">Kinh độ tâm (Target Lng)</label>
                              <input 
                                type="number" 
                                step="any"
                                value={config.targetLng ?? ''} 
                                onChange={e => setConfig({...config, targetLng: e.target.value === '' ? ('' as any) : Number(e.target.value)})}
                                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono" 
                              />
                            </div>
                          </div>
                        </div>

                        <h3 className="text-sm font-bold text-slate-700 mb-4 border-b pb-2 mt-8">Cấu hình Logo Hệ thống</h3>
                        <div className="flex flex-col gap-4 mb-6">
                          <div className="flex items-center gap-6">
                            <div className="w-24 h-24 rounded-full border border-slate-200 shadow-sm overflow-hidden bg-slate-50 flex items-center justify-center shrink-0">
                              <img src={config.logoBase64 || "/logo.svg"} alt="Current Logo" className="w-full h-full object-contain bg-white" />
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs font-semibold text-slate-600 mb-2">Tải lên logo mới (Khuyên dùng ảnh hình vuông, định dạng PNG/JPG)</label>
                              {canEdit && (
                                <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg shadow-sm cursor-pointer hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700">
                                  <Upload className="w-4 h-4 text-slate-500" />
                                  Chọn ảnh từ thiết bị
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      
                                      if (file.size > 2 * 1024 * 1024) {
                                        alert('Kích thước ảnh quá lớn. Vui lòng chọn ảnh dưới 2MB.');
                                        return;
                                      }

                                      const reader = new FileReader();
                                      reader.onload = async (event) => {
                                        const base64 = event.target?.result as string;
                                        const newConfig = { ...config, logoBase64: base64 };
                                        setConfig(newConfig);
                                        
                                        try {
                                          await setDoc(doc(db, 'settings', 'config'), newConfig);
                                          await fetch('/api/settings/config', {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(newConfig)
                                          });
                                          alert('Đã cập nhật logo thành công!');
                                        } catch (err) {
                                          console.error('Error saving logo', err);
                                          alert('Lỗi khi lưu logo!');
                                        }
                                      };
                                      reader.readAsDataURL(file);
                                    }} 
                                  />
                                </label>
                              )}
                              <p className="text-[10px] text-slate-500 mt-2">Logo sẽ được hiển thị trên trang đăng nhập, trang điểm danh và trang quản trị.</p>
                            </div>
                          </div>
                        </div>

                        <h3 className="text-sm font-bold text-slate-700 mb-4 border-b pb-2 mt-8 flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-blue-600" />
                            Bảo mật & Khóa thiết bị
                          </span>
                        </h3>
                        <div className="flex flex-col gap-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-bold text-slate-800">Khóa thiết bị 1 nhân viên - 1 máy</p>
                              <p className="text-xs text-slate-500">Chống điểm danh hộ: Mỗi tài khoản tự động liên kết với điện thoại đầu tiên thực hiện điểm danh.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={config.enableDeviceLock !== false} 
                                onChange={e => setConfig({ ...config, enableDeviceLock: e.target.checked })} 
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                          </div>

                          <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                            <div>
                              <p className="text-sm font-bold text-slate-800">Cho phép điểm danh trên máy tính / Laptop</p>
                              <p className="text-xs text-slate-500">Cho phép nhân viên và Quản trị viên thực hiện điểm danh trên trình duyệt máy tính.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={config.allowDesktopCheckIn !== false} 
                                onChange={e => setConfig({ ...config, allowDesktopCheckIn: e.target.checked })} 
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                          </div>

                          {canEdit && (
                            <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
                              <div>
                                <p className="text-sm font-bold text-slate-800">Mở khóa toàn bộ thiết bị (Reset tất cả máy)</p>
                                <p className="text-xs text-slate-500">Xóa liên kết thiết bị hiện tại của toàn bộ nhân viên để tất cả mọi người có thể điểm danh từ thiết bị mới.</p>
                              </div>
                              {showUnlockAllConfirm ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={handleUnlockAllDevices}
                                    disabled={unlockingAllDevices}
                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 animate-pulse"
                                  >
                                    {unlockingAllDevices ? 'Đang mở khóa...' : 'Xác nhận mở khóa?'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setShowUnlockAllConfirm(false)}
                                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"
                                  >
                                    Hủy
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setShowUnlockAllConfirm(true)}
                                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                                >
                                  <Unlock className="w-3.5 h-3.5 text-red-600" />
                                  Mở khóa tất cả thiết bị
                                </button>
                              )}
                            </div>
                          )}

                          {/* Chỉ định nhân viên có quyền mở khóa thiết bị */}
                          <div className="border-t border-slate-200 pt-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                              <div>
                                <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                                  Chỉ định nhân viên có quyền mở khóa thiết bị
                                </p>
                                <p className="text-xs text-slate-500">
                                  Chỉ nhân viên được chỉ định tại đây mới có quyền mở khóa máy. Nếu Admin chưa chỉ định, thiết bị sẽ không được phép mở khóa.
                                </p>
                              </div>
                              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                                {(config.designatedUnlockers || []).length} người được ủy quyền
                              </span>
                            </div>

                            {canEdit && (
                              <div className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-200">
                                <div className="flex gap-2">
                                  <select
                                    id="select-designated-unlocker"
                                    className="flex-1 text-xs border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={selectedEmployeeToDesignate}
                                    onChange={(e) => setSelectedEmployeeToDesignate(e.target.value)}
                                  >
                                    <option value="">-- Chọn nhân viên để chỉ định quyền mở khóa --</option>
                                    {users
                                      .filter(u => u.status !== 'locked' && !u.is_hidden)
                                      .filter(u => !(config.designatedUnlockers || []).some(d => d.uid === u.uid))
                                      .map(u => (
                                        <option key={u.uid} value={u.uid}>
                                          {u.name} (Mã: {u.uid}) {u.department ? `- ${u.department}` : ''}
                                        </option>
                                      ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={handleAddDesignatedUnlocker}
                                    disabled={!selectedEmployeeToDesignate}
                                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Chỉ định</span>
                                  </button>
                                </div>

                                {/* Danh sách nhân viên được chỉ định */}
                                {(config.designatedUnlockers && config.designatedUnlockers.length > 0) ? (
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    {config.designatedUnlockers.map((emp) => (
                                      <div 
                                        key={emp.uid} 
                                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 font-semibold"
                                      >
                                        <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                                        <span>{emp.name} <span className="text-blue-600 font-mono text-[11px]">({emp.uid})</span></span>
                                        {emp.department && <span className="text-[10px] text-slate-500 bg-white/80 px-1.5 py-0.5 rounded border border-blue-100">{emp.department}</span>}
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveDesignatedUnlocker(emp.uid)}
                                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-0.5 rounded-full transition-colors ml-1"
                                          title="Xóa chỉ định"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                    <span><b>Chưa có nhân viên nào được chỉ định:</b> Khi Admin chưa chỉ định, các thiết bị bị khóa sẽ không được phép mở khóa.</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-end mt-8">
                          {canEdit && (<button
                            type="submit"
                            disabled={savingConfig}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center"
                          >
                            {savingConfig && <span className="animate-spin h-4 w-4 mr-2 border-b-2 border-white rounded-full"></span>}
                            Lưu Cài Đặt
                          </button>)}
                        </div>
                      </form>
                    </div>
                  </div>
                )}
                
        {activeTab === 'special_employees' && (
          <div className="flex flex-col h-full overflow-hidden bg-slate-50">
            <div className="p-4 border-b border-slate-200 bg-white shrink-0">
              <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600"/> Quản lý đối tượng ưu tiên (Về sớm)
              </h2>
            </div>
            
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-6">
              {/* Statistics Chart for Special Employees */}
              {specialEmployees.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                  <h3 className="font-bold text-slate-700 mb-4 border-b pb-2">Thống kê nhân viên ưu tiên theo Khoa/Phòng và Chu kỳ</h3>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={departments.map(d => {
                          const emps = specialEmployees.filter(e => e.department === d.name);
                          const byPeriod: any = { name: d.name, 'Luôn luôn': 0, 'Theo ngày': 0, 'Theo tuần': 0, 'Theo tháng': 0 };
                          emps.forEach(e => {
                            if (e.period_type === 'daily') byPeriod['Theo ngày']++;
                            else if (e.period_type === 'weekly') byPeriod['Theo tuần']++;
                            else if (e.period_type === 'monthly') byPeriod['Theo tháng']++;
                            else byPeriod['Luôn luôn']++;
                          });
                          return emps.length > 0 ? byPeriod : null;
                        }).filter(Boolean)}
                        margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                        <Bar dataKey="Luôn luôn" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Theo ngày" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Theo tuần" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Theo tháng" stackId="a" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm border border-blue-100">
                <p>
                  <strong>Quản lý đối tượng ưu tiên & Ca đặc thù:</strong> Đối tượng <em>"Nuôi con nhỏ"</em> được cho phép về sớm theo số phút quy định. Nhóm ca đặc thù <em>"Đi làm sớm"</em> (phòng khám, CĐHA, CTXH...) chỉ bắt lỗi chấm vào theo giờ quy định, riêng thời gian chấm ra được phép chấm bất kỳ lúc nào và ghi nhận thời gian chấm ra mà không bắt lỗi về sớm.
                </p>
              </div>
              
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h3 className="font-bold text-slate-700 mb-4 border-b pb-2">Thêm nhân viên ưu tiên</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select 
                    value={newSpecialEmployee.department} 
                    onChange={e => setNewSpecialEmployee({...newSpecialEmployee, department: e.target.value, user_name: ''})} 
                    className="border border-slate-300 rounded-lg p-2.5 text-sm"
                  >
                    <option value="">Chọn khoa/phòng</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                  <select 
                    value={newSpecialEmployee.user_name} 
                    onChange={e => {
                      setNewSpecialEmployee({
                        ...newSpecialEmployee, 
                        user_name: e.target.value
                      });
                    }} 
                    className="border border-slate-300 rounded-lg p-2.5 text-sm"
                  >
                    <option value="">Chọn nhân viên...</option>
                    {users
                      .filter(u => !newSpecialEmployee.department || u.department === newSpecialEmployee.department)
                      .map(u => (
                        <option key={u.uid} value={u.name}>{u.name} (Mã: {u.uid})</option>
                      ))}
                  </select>
                  <select value={newSpecialEmployee.employee_type} onChange={e => {
                      const type = e.target.value;
                      const updates: any = { employee_type: type };
                      if (type.includes('Đi làm sớm')) {
                        updates.custom_start_time = '06:00';
                        updates.custom_end_time = '10:20';
                      } else {
                        updates.custom_start_time = '';
                        updates.custom_end_time = '';
                      }
                      setNewSpecialEmployee({...newSpecialEmployee, ...updates});
                  }} className="border border-slate-300 rounded-lg p-2.5 text-sm">
                    <option value="Nuôi con nhỏ">Nuôi con nhỏ (Về sớm theo phút)</option>
                    <option value="Đi làm sớm phòng khám">Đi làm sớm phòng khám</option>
                    <option value="Đi làm sớm chẩn đoán hình ảnh">Đi làm sớm chẩn đoán hình ảnh</option>
                    <option value="Đi làm sớm tổ CTXH">Đi làm sớm tổ CTXH</option>
                    <option value="Vệ sinh">Vệ sinh</option>
                    <option value="Khác">Khác</option>
                  </select>
                  <select value={newSpecialEmployee.period_type} onChange={e => setNewSpecialEmployee({...newSpecialEmployee, period_type: e.target.value})} className="border border-slate-300 rounded-lg p-2.5 text-sm">
                    <option value="always">Luôn luôn</option>
                    <option value="daily">Theo ngày</option>
                    <option value="weekly">Theo tuần</option>
                    <option value="monthly">Theo tháng</option>
                  </select>
                </div>
                {newSpecialEmployee.period_type !== 'always' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-slate-500">Từ ngày</span>
                      <input type="date" value={newSpecialEmployee.valid_from} onChange={e => setNewSpecialEmployee({...newSpecialEmployee, valid_from: e.target.value})} className="border border-slate-300 rounded-lg p-2.5 text-sm" />
                    </div>
                    {['weekly', 'monthly'].includes(newSpecialEmployee.period_type) && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-slate-500">Đến ngày</span>
                        <input type="date" value={newSpecialEmployee.valid_until} onChange={e => setNewSpecialEmployee({...newSpecialEmployee, valid_until: e.target.value})} className="border border-slate-300 rounded-lg p-2.5 text-sm" />
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 items-end">
                  {newSpecialEmployee.employee_type.includes('Đi làm sớm') ? (
                    <>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-slate-500">Giờ vào ca</span>
                        <input type="time" value={newSpecialEmployee.custom_start_time} onChange={e => setNewSpecialEmployee({...newSpecialEmployee, custom_start_time: e.target.value})} className="border border-slate-300 rounded-lg p-2.5 text-sm" placeholder="Giờ vào ca (VD: 06:00)" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-slate-500">Giờ tan ca</span>
                        <input type="time" value={newSpecialEmployee.custom_end_time} onChange={e => setNewSpecialEmployee({...newSpecialEmployee, custom_end_time: e.target.value})} className="border border-slate-300 rounded-lg p-2.5 text-sm" placeholder="Giờ tan ca (VD: 10:20)" />
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2 flex flex-col gap-1">
                       <span className="text-xs font-semibold text-slate-500">Số phút về sớm:</span>
                       <input type="number" min="0" value={newSpecialEmployee.early_minutes} onChange={e => setNewSpecialEmployee({...newSpecialEmployee, early_minutes: parseInt(e.target.value) || 0})} className="border border-slate-300 rounded-lg p-2.5 text-sm w-32" placeholder="Phút về sớm" />
                    </div>
                  )}
                  <button onClick={handleAddSpecialEmployee} className="bg-blue-600 text-white font-bold rounded-lg p-2.5 hover:bg-blue-700 text-sm flex items-center justify-center gap-2 transition-colors">
                    <UserCheck className="w-4 h-4"/> Thêm vào DS
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700">Danh sách nhân viên được ưu tiên</h3>
                  <div className="relative w-64">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Tìm kiếm nhân viên..." 
                      value={specialEmployeeSearch}
                      onChange={(e) => {
                          setSpecialEmployeeSearch(e.target.value);
                          setSpecialEmployeesPage(1); // Reset page on search
                      }}
                      className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-white text-slate-500 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Họ và tên</th>
                        <th className="px-4 py-3">Khoa / Phòng</th>
                        <th className="px-4 py-3">Phân loại / Chu kỳ</th>
                        <th className="px-4 py-3">Cấu hình thời gian</th>
                        <th className="px-4 py-3">Đếm ngược tự xóa</th>
                        <th className="px-4 py-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(() => {
                        const startIndex = (specialEmployeesPage - 1) * SPECIAL_EMPLOYEES_PER_PAGE;
                        const paginated = filteredSpecialEmployees.slice(startIndex, startIndex + SPECIAL_EMPLOYEES_PER_PAGE);
                        return paginated.map((emp) => (
                        <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-800">{emp.user_name}</td>
                          <td className="px-4 py-3">{emp.department}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1 items-start">
                               <span className="bg-purple-50 border border-purple-200 text-purple-700 px-2 py-1 rounded text-[11px] font-bold tracking-wide">
                                 {emp.employee_type}
                               </span>
                               <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                 {emp.period_type === 'daily' ? `Ngày: ${emp.valid_from || ''}` : emp.period_type === 'weekly' ? `Tuần: ${emp.valid_from || ''} - ${emp.valid_until || ''}` : emp.period_type === 'monthly' ? `Tháng: ${emp.valid_from || ''} - ${emp.valid_until || ''}` : 'Luôn luôn'}
                               </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-sm font-medium">
                            {emp.employee_type.includes('Đi làm sớm') ? (
                               <div className="flex flex-col text-xs font-semibold gap-0.5 text-blue-700">
                                  <span>Vào: {emp.custom_start_time || '-'}</span>
                                  <span className="text-emerald-600 font-bold">Ra: Bất kỳ lúc nào</span>
                               </div>
                            ) : (
                               <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md border border-blue-100 font-bold text-xs">{emp.early_minutes || 30} phút (Về sớm)</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {emp.period_type !== 'always' && (emp.valid_until || emp.valid_from) ? (
                              <LiveCountdown 
                                until={emp.valid_until || emp.valid_from} 
                                onExpire={() => handleDeleteSpecialEmployee(emp.id)} 
                              />
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => handleDeleteSpecialEmployee(emp.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition-colors" title="Xóa khỏi danh sách">
                              <XCircle className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ));
                      })()}
                      {filteredSpecialEmployees.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Chưa có nhân viên nào trong danh sách.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                
                {/* Pagination Controls */}
                {filteredSpecialEmployees.length > SPECIAL_EMPLOYEES_PER_PAGE && (
                  <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-white shrink-0 mt-auto">
                    <span className="text-sm text-slate-500 font-medium">
                      Hiển thị {((specialEmployeesPage - 1) * SPECIAL_EMPLOYEES_PER_PAGE) + 1} - {Math.min(specialEmployeesPage * SPECIAL_EMPLOYEES_PER_PAGE, filteredSpecialEmployees.length)} trong tổng số {filteredSpecialEmployees.length} nhân viên
                    </span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSpecialEmployeesPage(p => Math.max(1, p - 1))}
                        disabled={specialEmployeesPage === 1}
                        className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Trước
                      </button>
                      <button 
                        onClick={() => setSpecialEmployeesPage(p => Math.min(Math.ceil(filteredSpecialEmployees.length / SPECIAL_EMPLOYEES_PER_PAGE), p + 1))}
                        disabled={specialEmployeesPage >= Math.ceil(filteredSpecialEmployees.length / SPECIAL_EMPLOYEES_PER_PAGE)}
                        className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Sau
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
                  </div>
                )}
              </>
            )}
        </main>
        
        <footer className="h-12 bg-slate-900 text-white px-6 flex items-center justify-center text-xs shrink-0 z-20 hidden md:flex">
          <div className="text-slate-500">
            Bản quyền © 2026 Phòng Tổ Chức Hành Chính
          </div>
        </footer>
      </div>


      
            {editingDepartment && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Cập nhật Khoa/Phòng</h2>
              <button 
                onClick={() => setEditingDepartment(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleSaveDepartment} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tên Khoa/Phòng</label>
                  <input 
                    type="text" 
                    value={editingDepartment.name} 
                    onChange={e => setEditingDepartment({...editingDepartment, name: e.target.value})}
                    placeholder="Nhập tên khoa/phòng"
                    required
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setEditingDepartment(null)}
                    className="px-4 py-2 text-slate-600 font-semibold text-sm hover:bg-slate-100 rounded transition-colors"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm transition-colors shadow-sm"
                  >
                    Lưu
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {isAddUserModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Thêm nhân sự mới</h2>
              <button 
                onClick={() => setIsAddUserModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <form onSubmit={handleAddUser} className="flex flex-col gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Mã nhân viên (ID) <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const nextId = getNextAvailableEmployeeId(users);
                        setNewUserForm(prev => ({ ...prev, uid: nextId }));
                      }}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-medium hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Gợi ý mã kế tiếp</span>
                    </button>
                  </div>
                  <input 
                    type="text" 
                    value={newUserForm.uid} 
                    onChange={e => {
                      const numericOnly = e.target.value.replace(/[^\d]/g, '');
                      setNewUserForm(prev => ({ ...prev, uid: numericOnly }));
                    }}
                    placeholder="Nhập mã số nhân viên (VD: 102, 314, 490...)"
                    required
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono font-semibold text-blue-900 bg-blue-50/20" 
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    * Bắt buộc là số nguyên (ví dụ: 102, 314, 490) để phục vụ định danh và chấm công GPS.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tên nhân viên</label>
                  <input 
                    type="text" 
                    value={newUserForm.name} 
                    onChange={e => {
                        const newName = e.target.value;
                        const generateUsername = (fullName: string) => {
                          if (!fullName) return '';
                          const noAccent = fullName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
                          const words = noAccent.trim().split(/\s+/);
                          if (words.length === 0) return '';
                          if (words.length === 1) return words[0];
                          const firstName = words[words.length - 1];
                          const initials = words.slice(0, words.length - 1).map(w => w[0].toLowerCase()).join('');
                          return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase() + initials;
                        };
                        setNewUserForm({
                            ...newUserForm, 
                            name: newName,
                            username: generateUsername(newName)
                        });
                    }}
                    placeholder="Nhập tên nhân viên"
                    required
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tên đăng nhập (Username)</label>
                  <input 
                    type="text" 
                    value={newUserForm.username} 
                    onChange={e => setNewUserForm({...newUserForm, username: e.target.value})}
                    placeholder="VD: namnb"
                    required
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Mật khẩu (Tùy chọn, mặc định 123456)</label>
                  <input 
                    type="password" 
                    value={newUserForm.password} 
                    onChange={e => setNewUserForm({...newUserForm, password: e.target.value})}
                    placeholder="Mật khẩu"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Khoa/Phòng ban</label>
                  <select 
                    value={newUserForm.department} 
                    onChange={e => setNewUserForm({...newUserForm, department: e.target.value})}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white" 
                  >
                    <option value="">-- Chọn khoa/phòng ban --</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Chức vụ</label>
                  <select 
                    value={newUserForm.position || ''} 
                    onChange={e => setNewUserForm({...newUserForm, position: e.target.value})}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white" 
                  >
                    <option value="">-- Chọn chức vụ --</option>
                    <option value="Giám đốc">Giám đốc</option>
                    <option value="Phó giám đốc">Phó giám đốc</option>
                    <option value="Trưởng phòng">Trưởng phòng</option>
                    <option value="Phó phòng">Phó phòng</option>
                    <option value="Trưởng Khoa">Trưởng Khoa</option>
                    <option value="Phó khoa">Phó khoa</option>
                    <option value="Điều Dưỡng trưởng">Điều Dưỡng trưởng</option>
                    <option value="Nhân viên">Nhân viên</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Phân quyền</label>
                  <select 
                    value={newUserForm.role} 
                    onChange={e => setNewUserForm({
                      ...newUserForm, 
                      role: e.target.value,
                      permissions: e.target.value === 'admin' 
                        ? { view: true, edit: false, delete: false } 
                        : newUserForm.permissions
                    })}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white" 
                  >
                    <option value="employee">Nhân viên</option>
                    <option value="admin">Quản lý</option>
                    {userData?.role === 'super_admin' && (
                      <option value="super_admin">Quản trị viên (Super Admin)</option>
                    )}
                  </select>
                </div>
                {newUserForm.role === 'admin' && userData?.role === 'super_admin' && (
                  <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <label className="block text-xs font-semibold text-slate-700 mb-2">Quyền hạn (dành cho Quản lý)</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={newUserForm.permissions.view}
                          onChange={e => setNewUserForm({...newUserForm, permissions: {...newUserForm.permissions, view: e.target.checked}})}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                        />
                        <span className="text-sm text-slate-700">Xem (View)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={newUserForm.permissions.edit}
                          onChange={e => setNewUserForm({...newUserForm, permissions: {...newUserForm.permissions, edit: e.target.checked}})}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                        />
                        <span className="text-sm text-slate-700">Thêm / Sửa (Edit)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={newUserForm.permissions.delete}
                          onChange={e => setNewUserForm({...newUserForm, permissions: {...newUserForm.permissions, delete: e.target.checked}})}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                        />
                        <span className="text-sm text-slate-700">Xóa (Delete)</span>
                      </label>
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setIsAddUserModalOpen(false)}
                    className="px-4 py-2 text-slate-600 font-semibold text-sm hover:bg-slate-100 rounded transition-colors"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm transition-colors shadow-sm"
                  >
                    Tạo mới
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Cập nhật thông tin nhân viên</h2>
              <button 
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <form onSubmit={handleSaveUser} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Mã nhân viên (ID)</label>
                  <input 
                    type="text" 
                    value={editingUser.uid} 
                    disabled
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-slate-50 text-slate-700 font-mono font-semibold cursor-not-allowed" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tên nhân viên</label>
                  <input 
                    type="text" 
                    value={editingUser.name} 
                    disabled
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-slate-50 text-slate-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Khoa/Phòng ban</label>
                  <select 
                    value={editingUser.department || ''} 
                    onChange={e => setEditingUser({...editingUser, department: e.target.value})}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white" 
                    autoFocus
                  >
                    <option value="">-- Chọn khoa/phòng ban --</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Chức vụ</label>
                  <select 
                    value={editingUser.position || ''} 
                    onChange={e => setEditingUser({...editingUser, position: e.target.value})}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white" 
                  >
                    <option value="">-- Chọn chức vụ --</option>
                    <option value="Giám đốc">Giám đốc</option>
                    <option value="Phó giám đốc">Phó giám đốc</option>
                    <option value="Trưởng phòng">Trưởng phòng</option>
                    <option value="Phó phòng">Phó phòng</option>
                    <option value="Trưởng Khoa">Trưởng Khoa</option>
                    <option value="Phó khoa">Phó khoa</option>
                    <option value="Điều Dưỡng trưởng">Điều Dưỡng trưởng</option>
                    <option value="Nhân viên">Nhân viên</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Phân quyền</label>
                  <select 
                    value={editingUser.role || 'employee'} 
                    onChange={e => {
                      const newRole = e.target.value as any;
                      setEditingUser({
                        ...editingUser, 
                        role: newRole,
                        permissions: newRole === 'admin' 
                          ? (editingUser.permissions || { view: true, edit: false, delete: false }) 
                          : undefined
                      });
                    }}
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white" 
                  >
                    <option value="employee">Nhân viên</option>
                    <option value="admin">Quản lý</option>
                    {userData?.role === 'super_admin' && (
                      <option value="super_admin">Quản trị viên (Super Admin)</option>
                    )}
                  </select>
                </div>
                {editingUser.role === 'admin' && userData?.role === 'super_admin' && (
                  <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <label className="block text-xs font-semibold text-slate-700 mb-2">Quyền hạn (dành cho Quản lý)</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={editingUser.permissions?.view ?? true}
                          onChange={e => setEditingUser({...editingUser, permissions: {...(editingUser.permissions || {view:true,edit:false,delete:false}), view: e.target.checked}})}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                        />
                        <span className="text-sm text-slate-700">Xem (View)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={editingUser.permissions?.edit ?? false}
                          onChange={e => setEditingUser({...editingUser, permissions: {...(editingUser.permissions || {view:true,edit:false,delete:false}), edit: e.target.checked}})}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                        />
                        <span className="text-sm text-slate-700">Thêm / Sửa (Edit)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={editingUser.permissions?.delete ?? false}
                          onChange={e => setEditingUser({...editingUser, permissions: {...(editingUser.permissions || {view:true,edit:false,delete:false}), delete: e.target.checked}})}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                        />
                        <span className="text-sm text-slate-700">Xóa (Delete)</span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <label className="block text-xs font-bold text-slate-700 mb-2">Trạng thái làm việc & Điểm danh</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input 
                        type="radio" 
                        name="userStatus"
                        checked={!editingUser.is_hidden && editingUser.status !== 'inactive' && editingUser.status !== 'locked'} 
                        onChange={() => setEditingUser({...editingUser, is_hidden: false, status: 'active', lock_reason: ''})}
                        className="text-green-600 focus:ring-green-500"
                      />
                      <span>Đang làm việc</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input 
                        type="radio" 
                        name="userStatus"
                        checked={Boolean(editingUser.is_hidden || editingUser.status === 'inactive' || editingUser.status === 'locked')} 
                        onChange={() => setEditingUser({...editingUser, is_hidden: true, status: 'inactive', lock_reason: editingUser.lock_reason || 'Nghỉ việc'})}
                        className="text-red-600 focus:ring-red-500"
                      />
                      <span className="text-red-700 font-semibold">Đã ẩn / Khóa</span>
                    </label>
                  </div>
                  {(editingUser.is_hidden || editingUser.status === 'inactive' || editingUser.status === 'locked') && (
                    <div className="mt-3">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Lý do khóa / ẩn:</label>
                      <input 
                        type="text" 
                        value={editingUser.lock_reason || ''} 
                        onChange={e => setEditingUser({...editingUser, lock_reason: e.target.value})}
                        placeholder="VD: Nghỉ việc, Đang đi học, Thai sản..."
                        className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-red-500"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 text-slate-600 font-semibold text-sm hover:bg-slate-100 rounded transition-colors"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm transition-colors shadow-sm"
                  >
                    Lưu
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {lockingUser && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-amber-50 shrink-0">
              <div className="flex items-center gap-2 text-amber-900 font-bold">
                <Lock className="w-5 h-5 text-amber-600" />
                <h2 className="text-base">Khóa / Ẩn nhân sự</h2>
              </div>
              <button 
                onClick={() => setLockingUser(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="text-xs text-slate-500 font-medium mb-1">Nhân viên được chọn:</div>
                <div className="font-bold text-slate-900 text-base">{lockingUser.name}</div>
                <div className="text-xs text-slate-600">{lockingUser.department} • Mã NV: {lockingUser.uid}</div>
              </div>

              <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                Khi bị ẩn/khóa, nhân viên này sẽ <strong>không hiển thị</strong> trong danh sách chọn điểm danh và thống kê điểm danh hàng ngày. Nếu họ tự điểm danh, hệ thống sẽ thông báo yêu cầu liên hệ phòng TCHC để mở khóa.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Lý do khóa / ẩn:</label>
                  <select
                    value={lockReasonChoice}
                    onChange={(e) => setLockReasonChoice(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  >
                    <option value="Nghỉ việc">Nghỉ việc</option>
                    <option value="Đang đi học / Đào tạo">Đang đi học / Đào tạo</option>
                    <option value="Đang nghỉ thai sản">Đang nghỉ thai sản</option>
                    <option value="Nghỉ không lương / Tạm hoãn HĐ">Nghỉ không lương / Tạm hoãn HĐ</option>
                    <option value="Nghỉ ốm dài ngày">Nghỉ ốm dài ngày</option>
                    <option value="Chưa khai báo phòng TCHC">Chưa khai báo phòng TCHC</option>
                    <option value="Khác">Lý do khác (tự nhập)</option>
                  </select>
                </div>

                {lockReasonChoice === 'Khác' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Chi tiết lý do:</label>
                    <input
                      type="text"
                      placeholder="Nhập lý do cụ thể..."
                      value={customLockReason}
                      onChange={(e) => setCustomLockReason(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setLockingUser(null)}
                  className="px-4 py-2.5 text-slate-600 font-bold text-sm hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    const finalReason = lockReasonChoice === 'Khác' 
                      ? (customLockReason.trim() || 'Lý do khác') 
                      : lockReasonChoice;
                    handleToggleLockUser(lockingUser, true, finalReason);
                  }}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm transition-colors shadow-md flex items-center gap-1.5"
                >
                  <Lock className="w-4 h-4" /> Xác nhận khóa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      
      {detailsModalUser && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                Chi tiết điểm danh - {detailsModalUser.userName} ({format(new Date(detailsModalUser.dateStr), 'dd/MM/yyyy')})
              </h2>
              <button 
                onClick={() => setDetailsModalUser(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-auto">
              {(canEdit) && (
                <div className="mb-4 flex justify-end">
                  <button
                    onClick={() => {
                      setCurrentRecord({
                        userId: detailsModalUser.userId,
                        userName: detailsModalUser.userName,
                        dateStr: detailsModalUser.dateStr,
                        status: 'success',
                        type: 'in',
                        shift: 'Sáng',
                        timestamp: new Date(detailsModalUser.dateStr + 'T08:00:00').getTime(),
                      });
                      setIsEditModalOpen(true);
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm transition-colors shadow-sm"
                  >
                    + Thêm bản ghi mới
                  </button>
                </div>
              )}
              
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Thời gian</th>
                    <th className="px-4 py-3">Ca</th>
                    <th className="px-4 py-3">Loại</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3">Đi muộn</th>
                    {(canEdit || canDelete) && (
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records
                    .filter(r => r.userId === detailsModalUser.userId && r.dateStr === detailsModalUser.dateStr)
                    .sort((a, b) => a.timestamp - b.timestamp)
                    .map(record => (
                      <tr key={record.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-sm">{format(new Date(record.timestamp), 'HH:mm:ss')}</td>
                        <td className="px-4 py-3 text-sm">{record.shift || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          {record.type === 'in' ? <span className="text-emerald-600 font-bold">Vào</span> : (record.type === 'out' ? <span className="text-orange-500 font-bold">Ra</span> : <span className="text-slate-500">{record.type}</span>)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {record.status === 'success' ? <span className="text-green-600">Thành công</span> : <span className="text-red-600">{record.status}</span>}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {record.lateMinutes ? <span className="text-red-500 font-bold">{record.lateMinutes}p</span> : '-'}
                        </td>
                        {(canEdit || canDelete) && (
                          <td className="px-4 py-3 text-right">
                            {canEdit && (<button
                              onClick={() => {
                                setCurrentRecord(record);
                                setIsEditModalOpen(true);
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800 font-semibold bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors mr-2"
                            >
                              Sửa
                            </button>)}
                            {canDelete && (<button
                              onClick={() => {
                                if (deleteConfirmId === record.id) {
                                  handleDelete(record.id!);
                                  setDeleteConfirmId(null);
                                } else {
                                  setDeleteConfirmId(record.id!);
                                }
                              }}
                              className="text-xs text-red-600 hover:text-red-800 font-semibold bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition-colors"
                            >
                              {deleteConfirmId === record.id ? 'Chắc chắn?' : 'Xóa'}
                            </button>)}
                          </td>
                        )}
                      </tr>
                    ))}
                    {records.filter(r => r.userId === detailsModalUser.userId && r.dateStr === detailsModalUser.dateStr).length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                          Không có bản ghi nào
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {isEditModalOpen && currentRecord && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4">{currentRecord.id ? 'Sửa bản ghi' : 'Thêm bản ghi'}</h2>
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200">
                {errorMessage}
              </div>
            )}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nhân viên</label>
                {currentRecord.id ? (
                  <input
                    readOnly
                    type="text"
                    value={currentRecord.userName || ''}
                    className="w-full px-3 py-2 border rounded-lg bg-slate-50 cursor-not-allowed"
                  />
                ) : (
                  <select
                    required
                    value={currentRecord.userId || ''}
                    onChange={e => {
                      const selectedUser = users.find(u => u.uid === e.target.value);
                      if (selectedUser) {
                        setCurrentRecord({ 
                          ...currentRecord, 
                          userId: selectedUser.uid, 
                          userName: selectedUser.name,
                          department: selectedUser.department
                        });
                      } else {
                        setCurrentRecord({ ...currentRecord, userId: '', userName: '', department: '' });
                      }
                    }}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                  >
                    <option value="">-- Chọn nhân viên --</option>
                    {users.map(u => (
                      <option key={u.uid} value={u.uid}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Thời gian</label>
                <input
                  type="datetime-local"
                  required
                  value={currentRecord.timestamp ? format(new Date(currentRecord.timestamp), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                  onChange={e => {
                    const d = new Date(e.target.value);
                    if (!isNaN(d.getTime())) {
                      setCurrentRecord({
                        ...currentRecord,
                        timestamp: d.getTime(),
                        dateStr: format(d, 'yyyy-MM-dd')
                      });
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Loại điểm danh</label>
                <select
                  value={currentRecord.type || 'in'}
                  onChange={e => setCurrentRecord({ ...currentRecord, type: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="in">VÀO CA</option>
                  <option value="out">RA CA</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Trạng thái</label>
                <select
                  value={currentRecord.status || 'success'}
                  onChange={e => setCurrentRecord({ ...currentRecord, status: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="success">Thành công</option>
                  <option value="invalid_qr">Mã QR lỗi</option>
                  <option value="error">Từ chối GPS / Lỗi</option>
                  <option value="failed">Sai vị trí</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ghi chú / Lý do (nếu có)</label>
                <input
                  type="text"
                  value={currentRecord.reason || ''}
                  onChange={e => setCurrentRecord({ ...currentRecord, reason: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                >
                  {loading ? 'Đang lưu...' : 'Lưu lại'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mapModalRecord && mapModalRecord.location && mapModalRecord.location.lat && mapModalRecord.location.lng && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                Vị trí điểm danh - {mapModalRecord.userName}
              </h2>
              <button 
                onClick={() => setMapModalRecord(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="mb-4 text-sm text-slate-600 flex gap-4">
                <div>Thời gian: <span className="font-bold">{format(new Date(mapModalRecord.timestamp), 'HH:mm:ss dd/MM/yyyy')}</span></div>
                <div>Loại: <span className="font-bold">{mapModalRecord.type === 'in' ? 'VÀO CA' : 'RA CA'}</span></div>
                <div>Trạng thái: <span className={`font-bold ${mapModalRecord.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>{mapModalRecord.status === 'success' ? 'Thành công' : 'Thất bại'}</span></div>
              </div>
              <LocationMap 
                centerLat={config.targetLat}
                centerLng={config.targetLng}
                radius={config.radius}
                markerLat={mapModalRecord.location.lat}
                markerLng={mapModalRecord.location.lng}
              />
            </div>
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setMapModalRecord(null)}
                className="px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded text-sm transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
