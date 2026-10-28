import { apiFetch } from './api';

export interface OfflineAttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  department: string;
  type: 'in' | 'out';
  timestamp: number;
  location: {
    lat: number;
    lng: number;
    accuracy?: number;
    distance?: number;
  };
  deviceFingerprint: string;
  deviceInfo: any;
  forceRebind?: boolean;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
  createdAt: number;
}

const STORAGE_KEY = 'attendance_offline_queue_v1';

/**
 * Lấy danh sách bản ghi điểm danh ngoại tuyến đang lưu tạm trên máy
 */
export function getOfflineQueue(): OfflineAttendanceRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[offlineSync] Lỗi đọc dữ liệu offline từ localStorage:', e);
    return [];
  }
}

/**
 * Lưu danh sách bản ghi điểm danh ngoại tuyến vào localStorage
 */
function setOfflineQueue(queue: OfflineAttendanceRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    // Phát sự kiện thông báo thay đổi số lượng bản ghi offline
    window.dispatchEvent(new CustomEvent('attendance_offline_queue_changed', {
      detail: { count: queue.length, queue }
    }));
  } catch (e) {
    console.error('[offlineSync] Lỗi ghi dữ liệu offline vào localStorage:', e);
  }
}

/**
 * Thêm một lượt điểm danh vào hàng đợi ngoại tuyến
 */
export function saveToOfflineQueue(
  record: Omit<OfflineAttendanceRecord, 'id' | 'createdAt' | 'status'>
): OfflineAttendanceRecord {
  const queue = getOfflineQueue();
  const newRecord: OfflineAttendanceRecord = {
    ...record,
    id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'pending',
    createdAt: Date.now()
  };

  // Tránh lưu trùng lặp cùng user, cùng loại ca trong vòng 30 giây
  const isDuplicate = queue.some(
    q => q.userId === newRecord.userId &&
         q.type === newRecord.type &&
         Math.abs(q.timestamp - newRecord.timestamp) < 30000
  );

  if (!isDuplicate) {
    queue.push(newRecord);
    setOfflineQueue(queue);
  }

  return newRecord;
}

/**
 * Xóa một bản ghi khỏi hàng đợi sau khi đồng bộ thành công
 */
export function removeFromOfflineQueue(id: string): void {
  const queue = getOfflineQueue();
  const next = queue.filter(r => r.id !== id);
  setOfflineQueue(next);
}

/**
 * Xóa toàn bộ hàng đợi ngoại tuyến
 */
export function clearOfflineQueue(): void {
  setOfflineQueue([]);
}

let isSyncing = false;

/**
 * Đồng bộ một bản ghi cụ thể lên máy chủ
 */
export async function syncSingleRecord(
  record: OfflineAttendanceRecord
): Promise<{ success: boolean; error?: string; duplicate?: boolean }> {
  try {
    const payload = {
      userId: record.userId,
      userName: record.userName,
      department: record.department,
      type: record.type,
      location: record.location,
      deviceFingerprint: record.deviceFingerprint,
      deviceInfo: record.deviceInfo,
      forceRebind: record.forceRebind,
      offlineTimestamp: record.timestamp,
      isOfflineSync: true,
      reason: 'Điểm danh ngoại tuyến (Offline) - Đã tự động đồng bộ khi có mạng'
    };

    const res = await apiFetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: 12000
    });

    if (res.ok && res.data?.id) {
      return { success: true };
    }

    // Nếu máy chủ báo đã tồn tại lượt điểm danh (trùng lặp) thì coi như đã đồng bộ an toàn
    if (res.status === 400 && (res.data?.status === 'duplicate' || res.data?.status === 'duplicate_already_synced')) {
      return { success: true, duplicate: true };
    }

    return { 
      success: false, 
      error: res.error || res.data?.error || 'Lỗi từ máy chủ khi gửi bản ghi' 
    };
  } catch (err: any) {
    return { 
      success: false, 
      error: err.message || 'Lỗi mạng khi đồng bộ bản ghi' 
    };
  }
}

export interface SyncSummary {
  total: number;
  success: number;
  failed: number;
  syncedRecords: OfflineAttendanceRecord[];
}

/**
 * Đồng bộ toàn bộ các bản ghi điểm danh ngoại tuyến đang chờ trong hàng đợi
 */
export async function syncAllOfflineRecords(): Promise<SyncSummary> {
  if (isSyncing) {
    return { total: 0, success: 0, failed: 0, syncedRecords: [] };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { total: 0, success: 0, failed: 0, syncedRecords: [] };
  }

  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return { total: 0, success: 0, failed: 0, syncedRecords: [] };
  }

  isSyncing = true;
  const syncedRecords: OfflineAttendanceRecord[] = [];
  let successCount = 0;
  let failedCount = 0;

  try {
    for (const record of queue) {
      const result = await syncSingleRecord(record);
      if (result.success) {
        removeFromOfflineQueue(record.id);
        syncedRecords.push(record);
        successCount++;
      } else {
        failedCount++;
        // Cập nhật lỗi vào bản ghi để người dùng theo dõi nếu cần
        const currentQueue = getOfflineQueue();
        const target = currentQueue.find(r => r.id === record.id);
        if (target) {
          target.status = 'failed';
          target.error = result.error;
          setOfflineQueue(currentQueue);
        }
      }
    }

    if (syncedRecords.length > 0) {
      window.dispatchEvent(new CustomEvent('attendance_offline_synced', {
        detail: {
          syncedCount: syncedRecords.length,
          syncedRecords
        }
      }));
    }

    return {
      total: queue.length,
      success: successCount,
      failed: failedCount,
      syncedRecords
    };
  } finally {
    isSyncing = false;
  }
}

/**
 * Khởi động tiến trình giám sát và tự động đồng bộ khi có kết nối Internet trở lại
 */
let serviceStarted = false;
export function startOfflineSyncService(
  onSyncComplete?: (summary: SyncSummary) => void
): () => void {
  if (typeof window === 'undefined' || serviceStarted) {
    return () => {};
  }
  serviceStarted = true;

  const handleOnline = async () => {
    console.log('[offlineSync] Kết nối Internet đã được phục hồi, tiến hành đồng bộ dữ liệu điểm danh...');
    const result = await syncAllOfflineRecords();
    if (result.success > 0 && onSyncComplete) {
      onSyncComplete(result);
    }
  };

  const handleVisibilityOrFocus = async () => {
    if (navigator.onLine && getOfflineQueue().length > 0) {
      const result = await syncAllOfflineRecords();
      if (result.success > 0 && onSyncComplete) {
        onSyncComplete(result);
      }
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('focus', handleVisibilityOrFocus);

  // Định kỳ mỗi 20 giây kiểm tra nếu có bản ghi chờ và có mạng
  const intervalId = setInterval(async () => {
    if (navigator.onLine && getOfflineQueue().length > 0 && !isSyncing) {
      const result = await syncAllOfflineRecords();
      if (result.success > 0 && onSyncComplete) {
        onSyncComplete(result);
      }
    }
  }, 20000);

  // Chạy thử 1 lần ngay khi khởi tạo
  setTimeout(handleVisibilityOrFocus, 1500);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('focus', handleVisibilityOrFocus);
    clearInterval(intervalId);
    serviceStarted = false;
  };
}
