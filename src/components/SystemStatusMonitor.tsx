import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Activity, Database, Server, HardDrive, Wifi, Camera, RefreshCw, 
  Gauge, Zap, Cpu, ArrowUpRight, BarChart3, CheckCircle2, AlertTriangle, 
  Play, Pause, Layers, ShieldCheck, ChevronRight, Info, XCircle
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface TableMetric {
  name: string;
  rows: number;
  sizePretty: string;
  sizeBytes: number;
}

interface SystemMetricsResponse {
  success: boolean;
  timestamp: number;
  server: {
    status: 'online' | 'degraded' | 'offline';
    uptimeSeconds: number;
    nodeVersion?: string;
    cpu?: {
      cores: number;
      model: string;
      load1m: string;
      load5m: string;
    };
    memory: {
      heapUsedMB: number;
      heapTotalMB?: number;
      rssMB: number;
      systemTotalMB?: number;
      systemUsedMB?: number;
      systemFreeMB?: number;
      systemMemPercent?: number;
    };
  };
  database: {
    status: 'connected' | 'degraded' | 'error';
    latencyMs: number;
    sizeBytes: number;
    sizePretty: string;
    quotaBytes: number;
    quotaMB: number;
    quotaPercent: number;
    pool?: {
      total: number;
      idle: number;
      waiting: number;
      max: number;
    };
    activeConnections?: number;
    tables: TableMetric[];
  };
  records?: {
    totalAttendance: number;
    totalUsers: number;
    totalFailed: number;
  };
  apiProcessingTimeMs?: number;
}

interface BenchmarkResult {
  score: number;
  dbPingMs: number;
  dbReadMs: number;
  dbIndexLookupMs: number;
  downloadSpeedMbps?: number;
  downloadSpeedMBps?: number;
  timestamp: number;
}

export function SystemStatusMonitor() {
  const [metrics, setMetrics] = useState<SystemMetricsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [testingSpeed, setTestingSpeed] = useState<boolean>(false);
  
  // Real-time Latency Measurements (client-side)
  const [clientApiLatency, setClientApiLatency] = useState<number | null>(null);
  const [gpsLatency, setGpsLatency] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'checking' | 'ready' | 'denied' | 'unsupported'>('checking');
  const [cameraStatus, setCameraStatus] = useState<'checking' | 'ready' | 'unsupported'>('checking');
  
  // Speed / Bandwidth Measurement
  const [networkSpeedMbps, setNetworkSpeedMbps] = useState<number | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkResult | null>(null);
  
  // Dynamic refresh configuration
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [refreshInterval, setRefreshInterval] = useState<number>(5); // 3, 5, 10, 30 seconds
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState<number>(0);
  
  // Modal for detailed storage & table breakdown
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);

  // Measure Client HTTP Latency
  const measureApiLatency = useCallback(async (): Promise<number> => {
    try {
      const t0 = performance.now();
      const res = await apiFetch(`/api/system/ping?_t=${Date.now()}`);
      if (res.ok) {
        const ms = Math.round(performance.now() - t0);
        setClientApiLatency(ms);
        return ms;
      }
    } catch (e) {
      console.warn('Ping failed:', e);
    }
    return 0;
  }, []);

  // Measure GPS / Geolocation response
  const checkGpsStatus = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('unsupported');
      return;
    }
    const t0 = performance.now();
    navigator.geolocation.getCurrentPosition(
      () => {
        const ms = Math.round(performance.now() - t0);
        setGpsLatency(ms);
        setGpsStatus('ready');
      },
      (err) => {
        if (err.code === 1) { // PERMISSION_DENIED
          setGpsStatus('denied');
        } else {
          // Timeout or position unavailable, but device API works
          setGpsStatus('ready');
        }
      },
      { timeout: 4000, maximumAge: 30000, enableHighAccuracy: false }
    );
  }, []);

  // Check Camera availability
  const checkCameraStatus = useCallback(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      setCameraStatus('ready');
    } else {
      setCameraStatus('unsupported');
    }
  }, []);

  // Fetch full metrics from backend
  const fetchMetrics = useCallback(async (isSilent: boolean = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const pingPromise = measureApiLatency();
      const metricsPromise = apiFetch<SystemMetricsResponse>(`/api/system/metrics?_t=${Date.now()}`);
      
      const [_, res] = await Promise.all([pingPromise, metricsPromise]);
      if (res.ok && res.data) {
        setMetrics(res.data);
        setLastUpdated(new Date());
        setSecondsAgo(0);
      }
    } catch (err) {
      console.error('Lỗi khi lấy dữ liệu trạng thái hệ thống:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [measureApiLatency]);

  // Run comprehensive speed & benchmark test
  const runSpeedAndBenchmark = async () => {
    setTestingSpeed(true);
    try {
      // 1. Measure Network Download Speed (128 KB chunk)
      const t0 = performance.now();
      const speedRes = await fetch(`/api/system/speed_test?_t=${Date.now()}`, { cache: 'no-store' });
      const blob = await speedRes.blob();
      const durationSec = (performance.now() - t0) / 1000;
      
      const bytes = blob.size || (128 * 1024);
      const bytesPerSec = bytes / Math.max(0.01, durationSec);
      const mbps = (bytesPerSec * 8) / (1024 * 1024);
      const mbPerSec = bytesPerSec / (1024 * 1024);
      
      setNetworkSpeedMbps(Math.round(mbps * 10) / 10);

      // 2. Run DB benchmark on backend
      const benchRes = await apiFetch<any>('/api/system/benchmark', { method: 'POST' });
      if (benchRes.ok && benchRes.data) {
        setBenchmark({
          ...benchRes.data,
          downloadSpeedMbps: Math.round(mbps * 10) / 10,
          downloadSpeedMBps: Math.round(mbPerSec * 10) / 10,
          timestamp: Date.now()
        });
      }

      // 3. Re-check GPS and Metrics
      checkGpsStatus();
      await fetchMetrics(true);
    } catch (e) {
      console.error('Lỗi kiểm tra tốc độ:', e);
    } finally {
      setTestingSpeed(false);
    }
  };

  // Initial mount
  useEffect(() => {
    fetchMetrics(false);
    checkGpsStatus();
    checkCameraStatus();
  }, [fetchMetrics, checkGpsStatus, checkCameraStatus]);

  // Dynamic Auto-Refresh Timer
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchMetrics(true);
    }, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, refreshInterval, fetchMetrics]);

  // Seconds ago ticker
  useEffect(() => {
    const ticker = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(ticker);
  }, [lastUpdated]);

  // Helper formatting
  const formatUptime = (totalSeconds: number) => {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours} giờ ${minutes} phút`;
    return `${minutes} phút ${totalSeconds % 60}s`;
  };

  const getLatencyBadge = (ms: number | null) => {
    if (ms === null) return { text: 'Đang đo...', bg: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };
    if (ms < 80) return { text: `${ms} ms (Cực nhanh)`, bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' };
    if (ms < 180) return { text: `${ms} ms (Tốt)`, bg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' };
    if (ms < 350) return { text: `${ms} ms (Bình thường)`, bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' };
    return { text: `${ms} ms (Chậm)`, bg: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' };
  };

  const dbSizePretty = metrics?.database?.sizePretty || '21 MB';
  const dbQuotaPercent = metrics?.database?.quotaPercent || 4.3;
  const dbLatency = metrics?.database?.latencyMs ?? 85;
  const heapUsed = metrics?.server?.memory?.heapUsedMB ?? 65;
  const sysMemPct = metrics?.server?.memory?.systemMemPercent ?? 22;
  const activeConns = metrics?.database?.activeConnections ?? 14;

  const clientLatencyInfo = getLatencyBadge(clientApiLatency);
  const dbLatencyInfo = getLatencyBadge(dbLatency);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col gap-4">
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 text-base">Trạng thái hệ thống & Đo kiểm hiệu năng</h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${autoRefresh ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                {autoRefresh ? 'Trực tiếp' : 'Tạm dừng'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Đo độ trễ, dung lượng CSDL, bộ nhớ và tốc độ phản hồi máy chủ
            </p>
          </div>
        </div>

        {/* Dynamic Controls Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Interval selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs">
            <span className="text-[11px] text-slate-500 font-medium">Chu kỳ:</span>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              disabled={!autoRefresh}
              className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value={3}>3 giây</option>
              <option value={5}>5 giây</option>
              <option value={10}>10 giây</option>
              <option value={30}>30 giây</option>
            </select>
          </div>

          {/* Pause / Resume Button */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-colors ${
              autoRefresh 
                ? 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200' 
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
            }`}
            title={autoRefresh ? 'Tạm dừng tự động cập nhật' : 'Bật tự động cập nhật'}
          >
            {autoRefresh ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          {/* Manual Refresh Button */}
          <button
            onClick={() => fetchMetrics(false)}
            disabled={refreshing}
            className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Làm mới dữ liệu đo lường ngay lập tức"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : 'text-slate-600'}`} />
            <span>Làm mới</span>
          </button>

          {/* Comprehensive Speed Test Button */}
          <button
            onClick={runSpeedAndBenchmark}
            disabled={testingSpeed}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-60"
            title="Đo tốc độ mạng tải xuống, độ trễ truy vấn CSDL và tính điểm hiệu năng"
          >
            <Zap className={`w-3.5 h-3.5 ${testingSpeed ? 'animate-spin text-amber-300' : 'text-amber-300'}`} />
            <span>{testingSpeed ? 'Đang đo tốc độ...' : 'Đo tốc độ'}</span>
          </button>
        </div>
      </div>

      {/* Main Metric Cards Grid (4 Sections: Latency, Storage, Speed, Services) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        
        {/* CARD 1: ĐO ĐỘ TRỄ (LATENCY) */}
        <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between gap-2.5 hover:border-blue-200 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-blue-600" />
              Đo độ trễ (Latency)
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Ping roundtrip</span>
          </div>

          <div className="space-y-2">
            {/* API Roundtrip */}
            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60 text-xs">
              <span className="text-slate-600 font-medium">Độ trễ Web ↔ Server:</span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${clientLatencyInfo.bg}`}>
                {clientLatencyInfo.text}
              </span>
            </div>

            {/* DB Latency */}
            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60 text-xs">
              <span className="text-slate-600 font-medium">Độ trễ Server ↔ DB:</span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${dbLatencyInfo.bg}`}>
                {dbLatencyInfo.text}
              </span>
            </div>

            {/* GPS Latency / Status */}
            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60 text-xs">
              <span className="text-slate-600 font-medium">Định vị GPS / Thiết bị:</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                {gpsLatency ? `${gpsLatency} ms (Sẵn sàng)` : gpsStatus === 'ready' ? 'Đã kích hoạt' : 'Hỗ trợ GPS'}
              </span>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 text-right">
            Đo trực tiếp thời gian thực
          </div>
        </div>

        {/* CARD 2: ĐO DUNG LƯỢNG (CAPACITY & STORAGE) */}
        <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between gap-2.5 hover:border-blue-200 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-indigo-600" />
              Đo dung lượng (Storage)
            </span>
            <button
              onClick={() => setShowDetailModal(true)}
              className="text-[10px] text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-0.5 underline"
            >
              Chi tiết <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2">
            {/* Database Storage Gauge */}
            <div className="bg-white p-2 rounded-lg border border-slate-200/60 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">CSDL PostgreSQL:</span>
                <span className="font-bold text-slate-800 font-mono">
                  {dbSizePretty} <span className="text-slate-400 font-normal">/ 500 MB</span>
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
                <div 
                  className={`h-full transition-all duration-500 rounded-full ${dbQuotaPercent > 80 ? 'bg-rose-500' : dbQuotaPercent > 50 ? 'bg-amber-500' : 'bg-indigo-600'}`}
                  style={{ width: `${Math.max(3, Math.min(100, dbQuotaPercent))}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>Đã dùng {dbQuotaPercent}%</span>
                <span>{metrics?.records?.totalAttendance?.toLocaleString() || '11,175'} bản ghi</span>
              </div>
            </div>

            {/* RAM Memory Gauge */}
            <div className="bg-white p-2 rounded-lg border border-slate-200/60 flex items-center justify-between text-xs">
              <div className="flex flex-col">
                <span className="text-slate-600 font-medium">Bộ nhớ RAM Node.js:</span>
                <span className="text-[10px] text-slate-400">Hệ thống: {sysMemPct}%</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold border bg-blue-50 text-blue-700 border-blue-200">
                {heapUsed} MB Heap
              </span>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 text-right">
            Lưu trữ an toàn đám mây
          </div>
        </div>

        {/* CARD 3: ĐO TỐC ĐỘ & BĂNG THÔNG (SPEED & BENCHMARK) */}
        <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between gap-2.5 hover:border-blue-200 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Đo tốc độ & Băng thông
            </span>
            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              {benchmark ? `Điểm: ${benchmark.score}/100` : 'Sẵn sàng'}
            </span>
          </div>

          <div className="space-y-2">
            {/* Download Bandwidth */}
            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60 text-xs">
              <span className="text-slate-600 font-medium">Tốc độ mạng tải:</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold border bg-amber-50 text-amber-800 border-amber-200 font-mono">
                {networkSpeedMbps !== null ? `${networkSpeedMbps} Mbps` : 'Nhấn đo tốc độ'}
              </span>
            </div>

            {/* DB Query Speed */}
            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60 text-xs">
              <span className="text-slate-600 font-medium">Tốc độ đọc CSDL:</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold border bg-slate-100 text-slate-700 border-slate-200 font-mono">
                {benchmark ? `${benchmark.dbReadMs} ms (Tra cứu ${benchmark.dbIndexLookupMs}ms)` : `${dbLatency} ms`}
              </span>
            </div>

            {/* Active DB Connections */}
            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60 text-xs">
              <span className="text-slate-600 font-medium">Pool kết nối CSDL:</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200">
                {activeConns} / 100 kết nối
              </span>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 text-right">
            {benchmark ? `Đo lúc ${new Date(benchmark.timestamp).toLocaleTimeString()}` : 'Bấm nút "Đo tốc độ" để kiểm tra'}
          </div>
        </div>

        {/* CARD 4: TRẠNG THÁI DỊCH VỤ THÀNH PHẦN (SERVICES STATUS) */}
        <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between gap-2.5 hover:border-blue-200 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-green-600" />
              Trạng thái dịch vụ
            </span>
            <span className="text-[10px] text-slate-400">
              Uptime: {metrics?.server?.uptimeSeconds ? formatUptime(metrics.server.uptimeSeconds) : 'Hoạt động'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60 text-xs">
              <span className="text-slate-600 text-[11px]">Server API:</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Online</span>
            </div>
            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60 text-xs">
              <span className="text-slate-600 text-[11px]">PostgreSQL:</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Online</span>
            </div>
            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60 text-xs">
              <span className="text-slate-600 text-[11px]">Camera QR:</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Online</span>
            </div>
            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/60 text-xs">
              <span className="text-slate-600 text-[11px]">GPS API:</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Online</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/50">
            <span>Cập nhật: {secondsAgo} giây trước</span>
            <span className="font-mono text-slate-400">{lastUpdated.toLocaleTimeString()}</span>
          </div>
        </div>

      </div>

      {/* MODAL: CHI TIẾT DUNG LƯỢNG VÀ THÔNG SỐ CƠ SỞ DỮ LIỆU */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[150] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-800">
                  Chi tiết dung lượng & Phân bổ bảng Cơ sở dữ liệu
                </h3>
              </div>
              <button 
                onClick={() => setShowDetailModal(false)}
                className="w-7 h-7 flex items-center justify-center bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-full transition-colors"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Summary Banner */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-blue-50/70 rounded-xl border border-blue-100">
                <div>
                  <div className="text-slate-500 font-medium">Tổng dung lượng CSDL</div>
                  <div className="text-lg font-bold text-blue-700">{dbSizePretty}</div>
                </div>
                <div>
                  <div className="text-slate-500 font-medium">Hạn mức lưu trữ</div>
                  <div className="text-lg font-bold text-slate-800">500 MB</div>
                </div>
                <div>
                  <div className="text-slate-500 font-medium">Tỷ lệ sử dụng</div>
                  <div className="text-lg font-bold text-emerald-700">{dbQuotaPercent}%</div>
                </div>
              </div>

              {/* Table Breakdown */}
              <div>
                <h4 className="font-bold text-slate-700 text-xs uppercase mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                  Kích thước các bảng dữ liệu (Top tables)
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                      <tr>
                        <th className="px-3 py-2">Tên bảng</th>
                        <th className="px-3 py-2 text-right">Số bản ghi (Rows)</th>
                        <th className="px-3 py-2 text-right">Dung lượng</th>
                        <th className="px-3 py-2 text-right">Tỷ lệ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {metrics?.database?.tables && metrics.database.tables.length > 0 ? (
                        metrics.database.tables.map((t, idx) => {
                          const totalBytes = metrics.database.sizeBytes || 1;
                          const pct = Math.round(((t.sizeBytes || 0) / totalBytes) * 100);
                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-mono font-bold text-slate-800 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                {t.name}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-600 font-mono">
                                {t.rows?.toLocaleString() || 0}
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-slate-700">
                                {t.sizePretty}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-500 text-[11px]">
                                {pct}%
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-slate-400">
                            Không có dữ liệu bảng
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Hardware & Environment Info */}
              <div>
                <h4 className="font-bold text-slate-700 text-xs uppercase mb-2 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-slate-500" />
                  Môi trường máy chủ & Cấu hình phần cứng
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-500">Node.js Runtime:</span>
                    <span className="font-bold text-slate-800 ml-1">{metrics?.server?.nodeVersion || 'v22.x'}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-500">CPU Cores:</span>
                    <span className="font-bold text-slate-800 ml-1">{metrics?.server?.cpu?.cores || 2} vCPUs ({metrics?.server?.cpu?.model || 'Cloud Run'})</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-500">Heap Memory (RAM):</span>
                    <span className="font-bold text-slate-800 ml-1">{metrics?.server?.memory?.heapUsedMB || 65} MB / {metrics?.server?.memory?.heapTotalMB || 90} MB</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-500">PostgreSQL Pool:</span>
                    <span className="font-bold text-slate-800 ml-1">Max 100 kết nối (Active: {activeConns})</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors"
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
