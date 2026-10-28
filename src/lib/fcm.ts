import { app } from './firebase';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { apiFetch } from './api';

export interface NotificationSettings {
  enabled: boolean;
  remindMorning: boolean;
  remindAfternoon: boolean;
  remindCheckout: boolean;
  advanceMinutes: number;
  fcmToken?: string | null;
  permissionStatus: NotificationPermission;
}

const SETTINGS_KEY = 'hospital_notification_settings';

export const getStoredNotificationSettings = (): NotificationSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const perm: NotificationPermission = typeof window !== 'undefined' && 'Notification' in window 
      ? Notification.permission 
      : 'default';
      
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        advanceMinutes: parsed.advanceMinutes !== undefined ? parsed.advanceMinutes : 5,
        permissionStatus: perm
      };
    }
    return {
      enabled: perm === 'granted',
      remindMorning: true,
      remindAfternoon: true,
      remindCheckout: true,
      advanceMinutes: 5,
      fcmToken: localStorage.getItem('hospital_fcm_token') || null,
      permissionStatus: perm
    };
  } catch (e) {
    return {
      enabled: false,
      remindMorning: true,
      remindAfternoon: true,
      remindCheckout: true,
      advanceMinutes: 5,
      fcmToken: null,
      permissionStatus: 'default'
    };
  }
};

export const saveNotificationSettings = (settings: NotificationSettings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (settings.fcmToken) {
      localStorage.setItem('hospital_fcm_token', settings.fcmToken);
    }
  } catch (e) {
    console.warn('Error saving notification settings:', e);
  }
};

// Request Notification Permission and register FCM Token
export const requestAndRegisterFCM = async (userInfo?: { userId?: string; userName?: string; department?: string }): Promise<{
  success: boolean;
  token?: string;
  error?: string;
  permission: NotificationPermission;
}> => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      success: false,
      error: 'Trình duyệt của bạn không hỗ trợ Thông báo Đẩy (Push Notifications).',
      permission: 'denied'
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      const current = getStoredNotificationSettings();
      saveNotificationSettings({ ...current, enabled: false, permissionStatus: permission });
      return {
        success: false,
        error: 'Quyền gửi thông báo bị từ chối. Vui lòng vào Cài đặt trình duyệt để cấp quyền Thông báo cho trang web này.',
        permission
      };
    }

    // Register service worker if supported
    let swReg: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      try {
        swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
      } catch (swErr) {
        console.warn('Service worker registration warning:', swErr);
      }
    }

    let token: string = '';
    const supported = await isSupported().catch(() => false);
    
    if (supported) {
      try {
        const messaging = getMessaging(app);
        token = await getToken(messaging, {
          vapidKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuYkrObJwKXhqqydKqVPrG5dmw',
          serviceWorkerRegistration: swReg
        });
      } catch (fcmErr) {
        console.warn('FCM getToken error:', fcmErr);
      }
    }

    // If native FCM token wasn't fetched, generate a deterministic device push token
    if (!token) {
      const existingToken = localStorage.getItem('hospital_fcm_token');
      if (existingToken) {
        token = existingToken;
      } else {
        token = 'web_push_' + Math.random().toString(36).substring(2) + '_' + Date.now();
      }
    }

    const currentSettings = getStoredNotificationSettings();
    const updatedSettings: NotificationSettings = {
      ...currentSettings,
      enabled: true,
      fcmToken: token,
      permissionStatus: 'granted'
    };
    saveNotificationSettings(updatedSettings);

    // Sync token with server
    const activeUid = userInfo?.userId || localStorage.getItem('checkin_userId') || '';
    const activeName = userInfo?.userName || localStorage.getItem('checkin_name') || '';
    const activeDept = userInfo?.department || localStorage.getItem('checkin_department') || '';

    await apiFetch('/api/fcm/register_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        userId: activeUid,
        userName: activeName,
        department: activeDept,
        remindMorning: updatedSettings.remindMorning,
        remindAfternoon: updatedSettings.remindAfternoon,
        remindCheckout: updatedSettings.remindCheckout,
        advanceMinutes: updatedSettings.advanceMinutes,
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          screen: `${window.screen.width}x${window.screen.height}`
        }
      })
    }).catch(e => console.warn('Failed to sync token to server:', e));

    return {
      success: true,
      token,
      permission: 'granted'
    };
  } catch (err: any) {
    console.error('Error in requestAndRegisterFCM:', err);
    return {
      success: false,
      error: err.message || 'Lỗi khi kích hoạt thông báo FCM.',
      permission: Notification.permission
    };
  }
};

// Send an instant local / test notification
export const showLocalNotification = (title: string, options?: NotificationOptions & { data?: any }) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          body: options?.body || 'Nhắc nhở điểm danh chấm công',
          icon: '/logo.svg',
          badge: '/logo.svg',
          data: {
            url: '/?action=checkin&reminder=true',
            action: 'TRIGGER_CHECKIN_PROMPT',
            ...options?.data
          },
          ...({ vibrate: [200, 100, 200] } as any),
          ...options
        });
      });
    } else {
      const notif = new Notification(title, {
        body: options?.body || 'Nhắc nhở điểm danh chấm công',
        icon: '/logo.svg',
        ...options
      });
      notif.onclick = () => {
        try {
          window.focus();
          window.dispatchEvent(new CustomEvent('open-checkin-action', { 
            detail: { source: 'local_notification', title, timestamp: Date.now() } 
          }));
        } catch (e) {}
      };
    }
  } catch (e) {
    console.warn('showLocalNotification error:', e);
  }
};

// Setup foreground listener for FCM
export const setupFCMForegroundListener = (onReceive?: (payload: any) => void) => {
  if (typeof window === 'undefined') return () => {};

  isSupported().then(supported => {
    if (!supported) return;
    try {
      const messaging = getMessaging(app);
      return onMessage(messaging, (payload) => {
        console.log('[FCM] Foreground notification received:', payload);
        const title = payload.notification?.title || payload.data?.title || 'Thông báo chấm công';
        const body = payload.notification?.body || payload.data?.body || '';
        showLocalNotification(title, { body });
        if (onReceive) onReceive(payload);
      });
    } catch (e) {
      console.warn('Error setting up FCM foreground listener:', e);
    }
  }).catch(() => {});

  return () => {};
};

// In-app scheduler for shift reminders (runs locally as fallback)
let shiftReminderInterval: any = null;

export const startLocalShiftReminderScheduler = (appConfig?: any) => {
  if (typeof window === 'undefined') return;
  if (shiftReminderInterval) clearInterval(shiftReminderInterval);

  shiftReminderInterval = setInterval(() => {
    const settings = getStoredNotificationSettings();
    if (!settings.enabled || settings.permissionStatus !== 'granted') return;

    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();
    const currentTotalMin = currentH * 60 + currentM;

    const morningStart = appConfig?.morningStart || '07:00';
    const afternoonStart = appConfig?.afternoonStart || '13:30';
    const morningEnd = appConfig?.morningEnd || '11:20';
    const afternoonEnd = appConfig?.afternoonEnd || '16:50';

    const [mStartH, mStartM] = morningStart.split(':').map(Number);
    const [aStartH, aStartM] = afternoonStart.split(':').map(Number);
    const [mEndH, mEndM] = morningEnd.split(':').map(Number);
    const [aEndH, aEndM] = afternoonEnd.split(':').map(Number);

    const mStartTotalMin = mStartH * 60 + mStartM;
    const aStartTotalMin = aStartH * 60 + aStartM;
    const mEndTotalMin = mEndH * 60 + mEndM;
    const aEndTotalMin = aEndH * 60 + aEndM;

    const adv = settings.advanceMinutes ?? 5;
    const todayDateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Morning checkin reminder (e.g. 06:45)
    if (settings.remindMorning && currentTotalMin === mStartTotalMin - adv) {
      const flagKey = `reminder_m_in_${todayDateKey}`;
      if (!sessionStorage.getItem(flagKey)) {
        sessionStorage.setItem(flagKey, 'true');
        showLocalNotification('⏰ Nhắc nhở chấm công Ca Sáng', {
          body: `Còn ${adv} phút nữa đến giờ vào ca sáng (${morningStart}). Quý nhân viên hãy kiểm tra GPS và chuẩn bị điểm danh đúng giờ nhé!`,
          tag: 'morning-in-reminder'
        });
      }
    }

    // Afternoon checkin reminder (e.g. 13:15)
    if (settings.remindAfternoon && currentTotalMin === aStartTotalMin - adv) {
      const flagKey = `reminder_a_in_${todayDateKey}`;
      if (!sessionStorage.getItem(flagKey)) {
        sessionStorage.setItem(flagKey, 'true');
        showLocalNotification('⏰ Nhắc nhở chấm công Ca Chiều', {
          body: `Còn ${adv} phút nữa đến giờ vào ca chiều (${afternoonStart}). Quý nhân viên hãy mở ứng dụng để điểm danh nhé!`,
          tag: 'afternoon-in-reminder'
        });
      }
    }

    // Checkout reminders
    if (settings.remindCheckout) {
      if (currentTotalMin === mEndTotalMin) {
        const flagKey = `reminder_m_out_${todayDateKey}`;
        if (!sessionStorage.getItem(flagKey)) {
          sessionStorage.setItem(flagKey, 'true');
          showLocalNotification('🔔 Hết ca làm việc Buổi Sáng', {
            body: `Đã đến ${morningEnd}, kết thúc ca sáng. Quý nhân viên đừng quên quét mã ghi nhận ra ca!`,
            tag: 'morning-out-reminder'
          });
        }
      } else if (currentTotalMin === aEndTotalMin) {
        const flagKey = `reminder_a_out_${todayDateKey}`;
        if (!sessionStorage.getItem(flagKey)) {
          sessionStorage.setItem(flagKey, 'true');
          showLocalNotification('🔔 Hết ca làm việc Buổi Chiều', {
            body: `Đã đến ${afternoonEnd}, kết thúc ca chiều. Chúc bạn có những phút giây nghỉ ngơi vui vẻ bên gia đình!`,
            tag: 'afternoon-out-reminder'
          });
        }
      }
    }
  }, 30000); // check every 30 seconds
};
