/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import CheckIn from './pages/CheckIn';

const Login = lazy(() => import('./pages/Login'));
const Admin = lazy(() => import('./pages/Admin'));

const RouteFallback = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 font-sans">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
    <p className="text-sm font-medium text-slate-600">Đang tải hệ thống...</p>
  </div>
);

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Zalo/i.test(navigator.userAgent);
};

// Component bảo vệ các route Admin & Dashboard: chỉ cho phép Admin và người có tài khoản đã đăng nhập
const AdminProtectedRoute = () => {
  const { user, userData, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return <RouteFallback />;
  }

  // Bắt buộc đăng nhập bằng tài khoản hợp lệ mới được xem Dashboard
  if (!user || !userData) {
    return <Navigate to={`/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  
  return (
    <Suspense fallback={<RouteFallback />}>
      <Admin />
    </Suspense>
  );
};

// Route Trang chủ: Nếu quét mã QR Giao ban / Điểm danh hoặc mở trên điện thoại -> vào thẳng màn hình Điểm danh (không yêu cầu đăng nhập)
const RootRoute = () => {
  const location = useLocation();
  const isQrOrBriefingScan =
    location.search.includes('qr=') ||
    location.search.includes('tab=briefing') ||
    location.search.includes('checkin=') ||
    location.pathname.includes('GIAO_BAN') ||
    location.pathname.includes('giao-ban') ||
    location.pathname.startsWith('/checkin');

  if (isQrOrBriefingScan || isMobileDevice()) {
    return <CheckIn />;
  }

  return <Navigate to="/admin" replace />;
};

export default function App() {
  return (
    // Bọc toàn bộ ứng dụng trong AuthProvider để quản lý state xác thực
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* Tuyến đường Quản trị Hệ thống */}
            <Route path="/admin/*" element={<AdminProtectedRoute />} />
            <Route path="/admin" element={<AdminProtectedRoute />} />
            
            {/* Tuyến đường Điểm danh hàng ngày & Giao ban (không yêu cầu đăng nhập) */}
            <Route path="/giao-ban" element={<CheckIn />} />
            <Route path="/briefing" element={<CheckIn />} />
            <Route path="/checkin/:token/*" element={<CheckIn />} />
            <Route path="/checkin/:token" element={<CheckIn />} />
            <Route path="/checkin/*" element={<CheckIn />} />
            <Route path="/checkin" element={<CheckIn />} />
            
            {/* Trang chủ */}
            <Route path="/" element={<RootRoute />} />
            <Route path="*" element={<RootRoute />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

