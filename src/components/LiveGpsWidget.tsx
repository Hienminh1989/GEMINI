import React, { useState, useEffect, useCallback } from 'react';
import { 
  MapPin, Navigation, RefreshCw, CheckCircle2, AlertCircle, 
  Wifi, ShieldCheck, ChevronRight, HelpCircle 
} from 'lucide-react';
import { checkLocationValid, getAccurateLocation } from '../lib/location';
import { AppConfig } from '../types';
import { apiFetch } from '../lib/api';

interface LiveGpsWidgetProps {
  appConfig: AppConfig | null;
  onLocationHelpClick?: () => void;
}

export const LiveGpsWidget: React.FC<LiveGpsWidgetProps> = ({
  appConfig: initialConfig,
  onLocationHelpClick
}) => {
  const [checking, setChecking] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<AppConfig | null>(initialConfig);
  const [locationData, setLocationData] = useState<{
    distance: number;
    accuracy?: number;
    lat?: number;
    lng?: number;
    lastUpdated?: Date;
    errorMessage?: string;
  } | null>(null);

  // Sync with prop when parent updates
  useEffect(() => {
    if (initialConfig) {
      setCurrentConfig(initialConfig);
    }
  }, [initialConfig]);

  // Dynamic radius & coordinates (Single Source of Truth)
  const radius = Number(currentConfig?.radius) || 600;
  const hospitalLat = currentConfig?.targetLat;
  const hospitalLng = currentConfig?.targetLng;

  // Fetch latest config dynamically
  const refreshConfig = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/settings/config?_t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      if (res.ok && res.data) {
        setCurrentConfig(res.data);
        return res.data as AppConfig;
      }
    } catch (e) {
      console.warn("Could not sync live config for GPS widget:", e);
    }
    return null;
  }, []);

  // Poll config periodically every 20s and on focus to catch Admin changes immediately
  useEffect(() => {
    const interval = setInterval(refreshConfig, 20000);
    const onFocus = () => refreshConfig();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshConfig]);

  const handleCheckLocation = async () => {
    setChecking(true);
    try {
      // Refresh latest config in parallel to ensure exact current radius
      const [freshConfig, position] = await Promise.all([
        refreshConfig(),
        getAccurateLocation()
      ]);

      const effectiveRadius = Number(freshConfig?.radius || currentConfig?.radius) || 600;
      const effectiveLat = freshConfig?.targetLat ?? hospitalLat;
      const effectiveLng = freshConfig?.targetLng ?? hospitalLng;

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      const result = checkLocationValid(lat, lng, effectiveRadius, effectiveLat, effectiveLng);

      setLocationData({
        distance: Math.round(result.distance),
        accuracy: Math.round(accuracy),
        lat,
        lng,
        lastUpdated: new Date(),
        errorMessage: undefined
      });
    } catch (err: any) {
      console.warn("GPS Check error:", err);
      setLocationData({
        distance: 999999,
        lastUpdated: new Date(),
        errorMessage: err.message || 'Không thể truy cập GPS. Vui lòng bật vị trí trên điện thoại.'
      });
    } finally {
      setChecking(false);
    }
  };

  // Run initial lightweight check on mount if permitted
  useEffect(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.permissions && typeof navigator.permissions.query === 'function') {
        navigator.permissions.query({ name: 'geolocation' as any }).then((result) => {
          if (result && result.state === 'granted') {
            handleCheckLocation();
          }
        }).catch(() => {});
      }
    } catch (e) {}
  }, [hospitalLat, hospitalLng]);

  // Dynamically calculate validity based on current live radius
  const isWithinRadius = locationData && !locationData.errorMessage && locationData.distance !== 999999 && locationData.distance <= radius;

  return (
    <div className="bg-white rounded-2xl p-3 sm:p-3.5 shadow-xs border border-slate-100 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Navigation className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-xs sm:text-sm flex items-center gap-1.5">
              Trạng thái GPS & Vị trí
              {isWithinRadius && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              )}
            </h3>
            <p className="text-[10.5px] text-slate-500 flex items-center gap-1">
              Bán kính cho phép: 
              <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200/60 font-mono text-xs">
                {radius}m
              </span>
            </p>
          </div>
        </div>

        <button
          onClick={handleCheckLocation}
          disabled={checking}
          className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg transition-all active:scale-95 border border-blue-200/60 shadow-2xs shrink-0"
        >
          <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin text-blue-600' : ''}`} />
          <span>{checking ? 'Đang dò...' : 'Dò vị trí'}</span>
        </button>
      </div>

      {/* Main Readiness Status Card */}
      {!locationData ? (
        <div className="bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white text-slate-400 flex items-center justify-center border border-slate-200 shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700">Chưa kiểm tra vị trí</p>
              <p className="text-[10.5px] text-slate-500">Nhấn &quot;Dò vị trí&quot; để kiểm tra khoảng cách (Bán kính: {radius}m)</p>
            </div>
          </div>
        </div>
      ) : locationData.errorMessage ? (
        <div className="bg-rose-50 p-2.5 sm:p-3 rounded-xl border border-rose-200 text-rose-800 space-y-1.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-rose-900">Không nhận diện được vị trí</p>
              <p className="text-[10.5px] text-rose-700 leading-relaxed mt-0.5">{locationData.errorMessage}</p>
            </div>
          </div>
          {onLocationHelpClick && (
            <button
              onClick={onLocationHelpClick}
              className="text-[10.5px] font-bold text-rose-700 hover:text-rose-900 underline flex items-center gap-1 pl-6"
            >
              <HelpCircle className="w-3 h-3" /> Hướng dẫn bật GPS trên điện thoại
            </button>
          )}
        </div>
      ) : isWithinRadius ? (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50 p-2.5 sm:p-3 rounded-xl border border-emerald-200/90 text-emerald-900 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-black uppercase text-emerald-900 tracking-wide">
                    ĐỦ ĐIỀU KIỆN ĐIỂM DANH
                  </span>
                  <span className="px-1 py-0.2 bg-emerald-200/80 text-emerald-900 text-[9.5px] font-bold rounded">
                    ≤ {radius}m
                  </span>
                </div>
                <p className="text-[10.5px] text-emerald-700">
                  Khoảng cách: <b className="text-emerald-950 font-mono text-xs">{locationData.distance}m</b> / Giới hạn: <b className="text-emerald-900 font-mono">{radius}m</b>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-emerald-700/90 pt-1 border-t border-emerald-200/60">
            <span className="flex items-center gap-1">
              <Wifi className="w-3 h-3 text-emerald-600" />
              Sai số GPS: ±{locationData.accuracy || 15}m
            </span>
            <span className="text-[9.5px] text-emerald-600 font-mono">
              Vừa cập nhật
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 p-2.5 sm:p-3 rounded-xl border border-amber-200 text-amber-900 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-black uppercase text-amber-900 tracking-wide">
                    NGOÀI BÁN KÍNH
                  </span>
                  <span className="px-1 py-0.2 bg-amber-200 text-amber-900 text-[9.5px] font-bold rounded">
                    Vượt {locationData.distance - radius}m
                  </span>
                </div>
                <p className="text-[10.5px] text-amber-800">
                  Khoảng cách: <b className="text-amber-950 font-mono text-xs">{locationData.distance}m</b> (Bán kính: <b className="font-mono">{radius}m</b>)
                </p>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-amber-700 leading-relaxed pt-1 border-t border-amber-200/60">
            Bạn đang ở ngoài bán kính {radius}m. Vui lòng di chuyển vào trong khuôn viên trước khi điểm danh.
          </p>
        </div>
      )}
    </div>
  );
};

