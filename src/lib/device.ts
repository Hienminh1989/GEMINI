// Persistent Unique Device Fingerprinting & Anti-Proxy Check-In Module

function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// Get or create a cryptographically unique persistent UUID per browser/device
function getOrCreateDeviceUUID(): string {
  const STORAGE_KEY = 'hospital_device_uuid_v2';
  const COOKIE_KEY = 'hosp_dev_uuid_v2';

  // 1. Try reading from localStorage
  try {
    const localId = localStorage.getItem(STORAGE_KEY);
    if (localId && localId.length >= 16) {
      setPersistentCookie(COOKIE_KEY, localId);
      return localId;
    }
  } catch (e) {}

  // 2. Try reading from Cookie
  try {
    const match = document.cookie.match(new RegExp('(^|; )' + COOKIE_KEY + '=([^;]+)'));
    if (match && match[2] && match[2].length >= 16) {
      const cookieId = decodeURIComponent(match[2]);
      try {
        localStorage.setItem(STORAGE_KEY, cookieId);
      } catch (e) {}
      return cookieId;
    }
  } catch (e) {}

  // 3. Generate a new cryptographically strong UUID
  let newUUID = '';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    newUUID = crypto.randomUUID();
  } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    newUUID = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  } else {
    newUUID = 'uid_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 12);
  }

  // 4. Save to both localStorage & Cookie (10-year persistence)
  try {
    localStorage.setItem(STORAGE_KEY, newUUID);
  } catch (e) {}
  setPersistentCookie(COOKIE_KEY, newUUID);

  return newUUID;
}

function setPersistentCookie(name: string, value: string) {
  try {
    const maxAge = 60 * 60 * 24 * 365 * 10; // 10 years
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
  } catch (e) {}
}

function getCanvasFingerprint(): string {
  try {
    if (typeof document === 'undefined') return 'no_canvas';
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no_canvas';

    ctx.textBaseline = 'top';
    ctx.font = '14px Arial, sans-serif';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('CheckIn BV 🏥 ~*!', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('CheckIn BV 🏥 ~*!', 4, 17);
    return cyrb53(canvas.toDataURL());
  } catch (e) {
    return 'canvas_none';
  }
}

function getWebGLFingerprint(): { vendor: string, renderer: string, hash: string } {
  try {
    if (typeof document === 'undefined') return { vendor: 'none', renderer: 'none', hash: 'none' };
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return { vendor: 'no_webgl', renderer: 'no_webgl', hash: 'no_webgl' };

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

    return {
      vendor: String(vendor || 'unknown'),
      renderer: String(renderer || 'unknown'),
      hash: cyrb53(`${vendor}~${renderer}`)
    };
  } catch (e) {
    return { vendor: 'unknown', renderer: 'unknown', hash: 'none' };
  }
}

async function getAudioFingerprint(): Promise<string> {
  try {
    if (typeof window === 'undefined') return 'no_audio';
    const AudioContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AudioContextClass) return 'no_audio';

    const audioWork = new Promise<string>(async (resolve) => {
      try {
        const context = new AudioContextClass(1, 44100, 44100);
        const oscillator = context.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(10000, context.currentTime);

        const compressor = context.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-50, context.currentTime);
        compressor.knee.setValueAtTime(40, context.currentTime);
        compressor.ratio.setValueAtTime(12, context.currentTime);
        compressor.attack.setValueAtTime(0, context.currentTime);
        compressor.release.setValueAtTime(0.25, context.currentTime);

        oscillator.connect(compressor);
        compressor.connect(context.destination);
        oscillator.start(0);

        const audioBuffer = await context.startRendering();
        const channelData = audioBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 4500; i < 5000; i++) {
          sum += Math.abs(channelData[i]);
        }
        resolve(sum.toFixed(6));
      } catch (e) {
        resolve('audio_err');
      }
    });

    const timeout = new Promise<string>((resolve) => {
      setTimeout(() => resolve('audio_timeout'), 800);
    });

    return await Promise.race([audioWork, timeout]);
  } catch (e) {
    return 'audio_none';
  }
}

export interface DeviceProfile {
  fingerprint: string;
  deviceUUID: string;
  os: string;
  browser: string;
  deviceModel: string;
  screenRes: string;
  gpuRenderer: string;
}

let cachedDeviceProfile: DeviceProfile | null = null;
const PROFILE_CACHE_KEY = 'persistent_device_profile_v2';

export async function getDeviceProfile(): Promise<DeviceProfile> {
  if (cachedDeviceProfile) {
    return cachedDeviceProfile;
  }

  const s = window.screen;
  const ua = navigator.userAgent;

  // OS detection
  let os = 'Khác';
  if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (ua.indexOf('Win') > -1) os = 'Windows';
  else if (ua.indexOf('Mac') > -1) os = 'MacOS';
  else if (ua.indexOf('Linux') > -1) os = 'Linux';

  // Browser detection
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

  // Fast path: if we already have a cached profile or persistent fingerprint, return immediately (0ms) without running slow audio rendering
  try {
    const savedProfileRaw = localStorage.getItem(PROFILE_CACHE_KEY);
    const savedFp = localStorage.getItem('persistent_device_fp');
    if (savedProfileRaw) {
      const parsed = JSON.parse(savedProfileRaw);
      if (parsed && parsed.fingerprint && parsed.browser === browser) {
        cachedDeviceProfile = {
          ...parsed,
          fingerprint: savedFp || parsed.fingerprint
        };
        return cachedDeviceProfile!;
      }
    }
  } catch (e) {}

  const deviceUUID = getOrCreateDeviceUUID();

  // Device Model extract
  let deviceModel = `${os} Device`;
  if (/iPhone/i.test(ua)) deviceModel = 'Apple iPhone';
  else if (/iPad/i.test(ua)) deviceModel = 'Apple iPad';
  else {
    const androidMatch = ua.match(/Android[^;]+;\s*([^;)]+)\s*[;)]/);
    if (androidMatch && androidMatch[1]) {
      deviceModel = androidMatch[1].trim();
    }
  }

  const webgl = getWebGLFingerprint();
  const screenRes = `${s.width}x${s.height} (${window.devicePixelRatio || 1}x)`;

  // Preserve any existing bound fingerprint so previously locked devices never mismatch
  let existingFp = '';
  try {
    existingFp = localStorage.getItem('persistent_device_fp') || '';
  } catch (e) {}

  let fingerprint = existingFp;
  if (!fingerprint) {
    const canvasHash = getCanvasFingerprint();
    const audioHash = await getAudioFingerprint();
    const hardwareRaw = [
      `uuid:${deviceUUID}`,
      `screen:${s.width}x${s.height}x${s.colorDepth}@${window.devicePixelRatio || 1}`,
      `cores:${navigator.hardwareConcurrency || 0}`,
      `touch:${navigator.maxTouchPoints || 0}`,
      `tz:${Intl.DateTimeFormat().resolvedOptions().timeZone || ''}`,
      `canvas:${canvasHash}`,
      `webgl_vendor:${webgl.vendor}`,
      `webgl_renderer:${webgl.renderer}`,
      `audio:${audioHash}`,
      `platform:${navigator.platform || ''}`
    ].join('|');

    const cleanUuid = deviceUUID.replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);
    fingerprint = 'dev_' + cleanUuid + '_' + cyrb53(hardwareRaw);
  }

  cachedDeviceProfile = {
    fingerprint,
    deviceUUID,
    os,
    browser,
    deviceModel,
    screenRes,
    gpuRenderer: webgl.renderer
  };

  try {
    localStorage.setItem('persistent_device_fp', fingerprint);
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cachedDeviceProfile));
  } catch (e) {}

  return cachedDeviceProfile;
}

export function getDeviceId(): string {
  if (cachedDeviceProfile) {
    return cachedDeviceProfile.fingerprint;
  }
  const saved = localStorage.getItem('persistent_device_fp');
  if (saved) return saved;

  const deviceUUID = getOrCreateDeviceUUID();
  const s = window.screen;
  const quickFp = 'dev_' + cyrb53([
    `uuid:${deviceUUID}`,
    `screen:${s.width}x${s.height}x${s.colorDepth}@${window.devicePixelRatio || 1}`,
    `cores:${navigator.hardwareConcurrency || 0}`,
    `touch:${navigator.maxTouchPoints || 0}`,
    `tz:${Intl.DateTimeFormat().resolvedOptions().timeZone || ''}`,
    `platform:${navigator.platform || ''}`
  ].join('|'));

  return quickFp;
}
