import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  Building2,
  Smartphone,
  BarChart3,
  Clock
} from 'lucide-react';
import { apiFetch } from '../lib/api';

export default function Login() {
  const { user, userData, loginWithUsername, registerUser, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    apiFetch<{ logoBase64?: string }>('/api/settings/config')
      .then(res => {
        if (res.ok && res.data?.logoBase64) {
          setLogoUrl(res.data.logoBase64);
        }
      })
      .catch(e => console.warn('Error fetching config logo', e));
  }, []);

  useEffect(() => {
    if (user && userData) {
      const searchParams = new URLSearchParams(location.search);
      const returnUrl = searchParams.get('returnUrl');

      if (returnUrl && returnUrl !== '/' && returnUrl !== '/login' && !returnUrl.startsWith('/checkin')) {
        navigate(returnUrl, { replace: true });
      } else {
        navigate('/admin', { replace: true });
      }
    }
  }, [user, userData, navigate, location]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center text-white">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400 mb-4"></div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">
            Đang xác thực phiên làm việc...
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser || !password) {
      setError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }

    setIsSubmitting(true);
    try {
      await loginWithUsername(cleanUser, password);
    } catch (err: any) {
      if (cleanUser === 'namnb' && password === '112021') {
        try {
          await registerUser(cleanUser, password);
          return;
        } catch (regErr: any) {
          setError('Lỗi khởi tạo tài khoản quản trị: ' + (regErr.message || 'Vui lòng thử lại.'));
        }
      } else {
        setError(err.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formattedTime = currentTime.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const formattedDate = currentTime.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-12 font-sans text-slate-900">
      {/* Cột trái: Nhận diện thương hiệu & Chính sách truy cập (Hiển thị trên màn hình lớn) */}
      <div className="hidden lg:flex lg:col-span-7 bg-slate-900 text-white flex-col justify-between p-12 xl:p-16 relative overflow-hidden">
        {/* Hiệu ứng nền kiến trúc tinh tế */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 right-10 w-96 h-96 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Thanh trên cùng: Logo & Đồng hồ thời gian thực */}
        <div className="relative z-10 flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white p-1.5 shadow-lg flex items-center justify-center shrink-0">
              <img
                src={logoUrl || '/logo.svg'}
                alt="Bệnh viện Đa khoa Thiệu Hóa"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-blue-400">
                Sở Y Tế Thanh Hóa
              </p>
              <h1 className="text-lg font-extrabold tracking-tight text-white uppercase">
                Bệnh viện Đa khoa Thiệu Hóa
              </h1>
            </div>
          </div>

          <div className="text-right bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5">
            <div className="flex items-center justify-end gap-1.5 text-blue-300 text-xs font-medium mb-0.5">
              <Clock className="w-3.5 h-3.5" />
              <span className="capitalize">{formattedDate}</span>
            </div>
            <div className="text-xl font-mono font-bold tracking-wider text-white tabular-nums">
              {formattedTime}
            </div>
          </div>
        </div>

        {/* Nội dung trung tâm */}
        <div className="relative z-10 my-auto py-8 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-blue-500/15 border border-blue-400/25 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-5">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>Cổng Quản trị & Giám sát Nội bộ</span>
          </div>

          <h2 className="text-3xl xl:text-4xl font-extrabold tracking-tight text-white leading-tight mb-4">
            Hệ thống Quản trị Dashboard & Điểm danh Điện tử
          </h2>

          <p className="text-slate-300 text-base leading-relaxed mb-8">
            Nền tảng điều hành tập trung phục vụ công tác giám sát quân số, quản lý lịch trực, điểm danh giao ban và thống kê chuyên cần theo thời gian thực tại Bệnh viện Đa khoa Thiệu Hóa.
          </p>

          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.04] border border-white/10">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0 mt-0.5">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white mb-1">
                  Báo cáo & Thống kê Dashboard Trực quan
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Tra cứu dữ liệu điểm danh ca làm việc, điểm danh giao ban và xuất báo cáo tổng hợp theo từng khoa phòng.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.04] border border-white/10">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0 mt-0.5">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white mb-1">
                  Chính sách Không Điểm danh Trên Máy tính
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Hệ thống chặn hoàn toàn việc điểm danh trên máy tính. Cán bộ nhân viên chỉ thực hiện điểm danh bằng điện thoại di động cá nhân.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.04] border border-white/10">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0 mt-0.5">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white mb-1">
                  Kiểm soát Truy cập Tài khoản Nội bộ
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Chỉ Quản trị viên và cán bộ có tài khoản được cấp phép mới có quyền đăng nhập để xem bảng điều khiển Dashboard.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Chân trang cột trái */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 border-t border-white/10 pt-6">
          <span>© {currentTime.getFullYear()} Bệnh viện Đa khoa Thiệu Hóa</span>
          <span>Hệ thống Quản trị Nhân sự & Chấm công GPS/QR</span>
        </div>
      </div>

      {/* Cột phải: Khung Đăng nhập */}
      <div className="lg:col-span-5 flex flex-col justify-center items-center min-h-screen p-6 sm:p-10 lg:p-12 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Header hiển thị trên điện thoại / máy tính bảng */}
          <div className="lg:hidden text-center mb-6">
            <img
              src={logoUrl || '/logo.svg'}
              alt="Bệnh viện Đa khoa Thiệu Hóa"
              className="h-20 w-20 mx-auto object-contain mb-3 bg-white rounded-2xl shadow-sm p-1.5 border border-slate-200"
            />
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
              Bệnh viện Đa khoa Thiệu Hóa
            </p>
            <h1 className="text-xl font-extrabold text-slate-900 mt-0.5">
              Hệ thống Quản trị & Điểm danh
            </h1>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xl shadow-slate-900/5 p-7 sm:p-9">
            {/* Tiêu đề Form */}
            <div className="mb-7">
              <div className="hidden lg:flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center p-1.5">
                  <img
                    src={logoUrl || '/logo.svg'}
                    alt="Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
                  <Lock className="w-3.5 h-3.5 text-blue-600" />
                  Xác thực Nội bộ
                </span>
              </div>

              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                Đăng nhập Dashboard
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Dành cho Quản trị viên và cán bộ có tài khoản hệ thống
              </p>
            </div>

            {/* Thông báo lỗi */}
            {error && (
              <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="font-medium leading-snug">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
                >
                  Tên đăng nhập / Mã nhân viên
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="login-username"
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50/70 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                    placeholder="Nhập tên tài khoản hoặc mã NV"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2"
                >
                  Mật khẩu
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-10 pr-11 py-2.5 bg-slate-50/70 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                    placeholder="Nhập mật khẩu của bạn"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    tabIndex={-1}
                    title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-medium text-slate-600">
                    Duy trì đăng nhập
                  </span>
                </label>

                <span className="text-xs font-medium text-slate-400">
                  Cấp tài khoản: Phòng TCHC / CNTT
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl text-sm font-bold text-white shadow-sm transition-all cursor-pointer whitespace-nowrap ${
                  isSubmitting
                    ? 'bg-blue-400 cursor-wait'
                    : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99]'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Đang đăng nhập...</span>
                  </>
                ) : (
                  <>
                    <span>Đăng nhập vào Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Ghi chú quy định thiết bị */}
            <div className="mt-6 pt-5 border-t border-slate-100">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex items-start gap-3">
                <Smartphone className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-800">Quy định điểm danh:</span> Không điểm danh trên máy tính. Cán bộ nhân viên điểm danh ca trực hoặc giao ban vui lòng quét mã QR trên <span className="font-semibold text-slate-800">điện thoại di động</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
