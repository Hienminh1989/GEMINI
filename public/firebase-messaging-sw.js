// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyA_UWjnCn0kVFkHipNeMDWJkBbU7zQ8FDM",
  authDomain: "gen-lang-client-0972950100.firebaseapp.com",
  projectId: "gen-lang-client-0972950100",
  storageBucket: "gen-lang-client-0972950100.firebasestorage.app",
  messagingSenderId: "510306047251",
  appId: "1:510306047251:web:874b765f468444e8f3b6e6"
};

firebase.initializeApp(firebaseConfig);

let messaging = null;
try {
  messaging = firebase.messaging();
} catch (err) {
  console.warn('Firebase Messaging SW init error:', err);
}

if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Nhận thông báo nền:', payload);
    const notificationTitle = payload.notification?.title || payload.data?.title || 'Nhắc nhở chấm công';
    const notificationOptions = {
      body: payload.notification?.body || payload.data?.body || 'Đã đến giờ điểm danh theo quy định!',
      icon: '/logo.jpg',
      badge: '/logo.jpg',
      tag: payload.data?.tag || 'checkin-reminder',
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: {
        url: payload.data?.url || '/?action=checkin&reminder=true',
        action: 'TRIGGER_CHECKIN_PROMPT',
        time: Date.now()
      }
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/?action=checkin&reminder=true';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ 
            action: 'TRIGGER_CHECKIN_PROMPT',
            source: 'notification_click',
            url: urlToOpen,
            time: Date.now()
          });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
