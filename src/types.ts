// Các kiểu vai trò người dùng trong hệ thống
export type Role = 'super_admin' | 'admin' | 'employee';

// Cấu trúc dữ liệu người dùng lưu trong Firestore
export interface Department {
  id: string;
  name: string;
}

export interface UserData {
  uid: string; // ID người dùng (từ Firebase Auth)
  email: string; // Địa chỉ email
  name: string; // Tên hiển thị
  role: Role; // Phân quyền
  permissions?: {
    view: boolean;
    edit: boolean;
    delete: boolean;
  };
  department?: string; // Khoa, phòng
  position?: string; // Chức vụ
  status?: 'active' | 'inactive' | 'locked'; // Trạng thái làm việc
  is_hidden?: boolean; // Đã ẩn/khóa khỏi danh sách điểm danh
  lock_reason?: string; // Lý do khóa (nghỉ việc, đi học, thai sản...)
  locked_at?: number; // Thời điểm khóa
}

// Cấu trúc dữ liệu của một bản ghi điểm danh
export interface AttendanceRecord {
  id?: string; // ID bản ghi (tự tạo bởi Firestore)
  userId: string; // ID người nhân viên điểm danh
  userName: string; // Tên nhân viên
  department?: string; // Khoa, phòng
  timestamp: number; // Thời điểm quét (unix timestamp)
  dateStr: string; // Ngày quét định dạng YYYY-MM-DD để dễ query
  status: 'success' | 'failed' | 'invalid_qr' | 'error';
  type?: 'in' | 'out'; // Loại điểm danh: vào ca hay ra ca // Trạng thái điểm danh
  location?: {
    lat: number; // Vĩ độ
    lng: number; // Kinh độ
  };
  deviceInfo?: {
    os: string; // Hệ điều hành
    browser: string; // Trình duyệt
    deviceType: string; // Loại thiết bị (mobile/desktop)
    deviceId?: string; // Mã thiết bị giả lập (để chống điểm danh hộ)
  };
  reason?: string; // Lý do nếu điểm danh thất bại
  shift?: string; // Ca làm việc (Sáng, Chiều, Đêm)
  shiftId?: string; // shift_id identifier ('morning', 'afternoon', 'evening', etc.)
  lateMinutes?: number;
  earlyLeaveMinutes?: number; // Số phút đi muộn
  distance?: number;
  note?: string;
}

// Cấu trúc dữ liệu mã QR hàng ngày
export interface QRCodeData {
  id?: string;
  dateStr: string; // Ngày của mã QR (đóng vai trò như Document ID)
  token: string; // Chuỗi token ngẫu nhiên để chống gian lận (không thể dùng mã của ngày hôm qua)
}

export interface DesignatedUnlocker {
  uid: string;
  name: string;
  department?: string;
}

// Cấu trúc dữ liệu cài đặt chung
export interface AppConfig {
  morningStart: string; // "07:00"
  morningEnd: string; // "11:30"
  afternoonStart: string; // "13:30"
  afternoonEnd: string; // "17:00"
  radius: number; // 600
  targetLat?: number; // 19.866034
  targetLng?: number; // 105.656531
  logoBase64?: string;
  enableDeviceLock?: boolean; // Khóa thiết bị 1 nhân viên 1 máy (mặc định: false hoặc true tuỳ cấu hình)
  allowDesktopCheckIn?: boolean; // Cho phép điểm danh trên máy tính / Laptop
  designatedUnlockers?: DesignatedUnlocker[]; // Danh sách nhân viên được Admin chỉ định có quyền mở khóa thiết bị
}

// Cấu trúc dữ liệu ca trực / Lịch trực tuần
export interface DutyShift {
  id?: number | string;
  userId?: string; // Mã nhân viên
  userName: string; // Họ và tên
  department?: string; // Khoa, phòng
  dutyRole?: string; // Vị trí trực: Trực Lãnh đạo, Trực Bác sĩ, Trực Điều dưỡng, Trực Cấp cứu, Trực Gây mê, Trực Hành chính, Trực Dược...
  shiftName?: string; // Ca trực: Trực 24/24, Ca Đêm, Ca Sáng, Ca Chiều...
  dateStr: string; // Ngày trực định dạng YYYY-MM-DD
  dayOfWeek?: string; // Thứ 2, Thứ 3, ..., Chủ Nhật
  weekNumber?: number; // Tuần thứ mấy trong năm
  year?: number; // Năm
  weekStartDate?: string; // Ngày bắt đầu tuần YYYY-MM-DD
  weekEndDate?: string; // Ngày kết thúc tuần YYYY-MM-DD
  startTime?: string; // Giờ bắt đầu trực (07:30)
  endTime?: string; // Giờ kết thúc trực (07:30 hôm sau)
  note?: string; // Ghi chú / Địa điểm trực
  createdAt?: string;
}

// Cấu trúc một dòng ngày trong bảng Lịch trực chuẩn Bệnh viện
export interface HospitalDutyDayRow {
  dayLabel: string; // T2, T3, ..., CN
  dateStr: string; // 17/8 hoặc 2026-08-17
  dateIso?: string; // YYYY-MM-DD
  leader: string; // Lãnh đạo
  // Trực nội viện
  doctor1: string; // Bác sỹ chính (dòng 1)
  doctor2: string; // Bác sỹ kèm (dòng 2)
  doctor9Floor: string; // BS Trực nhà 9 tầng (Bôi vàng)
  nurse1: string; // Điều dưỡng trực chung CC 1
  nurse2: string; // Điều dưỡng trực chung CC 2
  nhi_lck1: string; // Nhi + LCK 1
  nhi_lck2: string; // Nhi + LCK 2
  noi_lao1: string; // Nội - Lão 1
  noi_lao2: string; // Nội - Lão 2
  truyen_nhiem: string; // Truyền nhiễm
  ngoai1: string; // Ngoại 1
  ngoai2: string; // Ngoại 2
  dong_y1: string; // Đông y 1
  dong_y2: string; // Đông y 2
  ho_sinh1: string; // Hộ sinh 1
  ho_sinh2: string; // Hộ sinh 2
  sa_xquang1: string; // S.Âm X.Quang 1
  sa_xquang2: string; // S.Âm X.Quang 2
  danh_may1: string; // Đánh máy SA 1
  danh_may2: string; // Đánh máy SA 2
  xet_nghiem: string; // Xét nghiệm
  lai_xe: string; // Lái xe
  // Trực ngoại viện
  phau_thuat: string; // P. Thuật (Kèm PT)
  gay_me: string; // G. Mê
  // Phân luồng
  phan_luong1: string; // Phân luồng HD-BN tại PK 1
  phan_luong2: string; // Phân luồng HD-BN tại PK 2
  // Đi làm phòng khám (T7, CN)
  pk_ca_ngay1: string;
  pk_ca_ngay2: string;
  pk_ca_ngay3: string;
  pk_ca_ngay4: string;
  pk_t7_cn: string;
  pk_san: string;
}

// Bảng đi làm hộ lý các khoa (T7, CN)
export interface HospitalHolyRow {
  dayLabel: string; // Thứ 7, Chủ nhật
  tang1_2: string;
  tang3_4: string;
  tang5_6: string;
  tang7_8: string;
  pk_hscc: string;
}

// Bảng Lịch trực tuần tổng thể Bệnh viện
export interface HospitalDutySchedule {
  id?: number;
  weekNumber: number;
  year: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  title: string;
  leaderOnDuty: string;
  organization?: string;
  documentNo?: string;
  notes?: string[];
  scheduleData: HospitalDutyDayRow[];
  holyData?: HospitalHolyRow[];
  createdAt?: string;
  updatedAt?: string;
}


