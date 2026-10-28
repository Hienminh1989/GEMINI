# Nâng Cấp Xuất Báo Cáo Excel & Danh Sách Điểm Danh Toàn Viện

Cập nhật chức năng **Điểm danh** và **Xuất Báo Cáo Excel** nhằm tổng hợp đầy đủ cả nhân viên **Đã điểm danh** và **Chưa điểm danh** vào chung một bảng duy nhất, loại bỏ hoàn toàn các tài khoản Quản trị viên (Admin) cũng như nhân sự đã khóa/nghỉ việc khỏi danh sách điểm danh, và trình bày bảng Excel rõ ràng theo từng cá nhân.

## User Review & Critical Decisions

> [!IMPORTANT]
> Các quyết định thiết kế dưới đây đã được thống nhất dựa trên yêu cầu và phản hồi của bạn:

- **Gộp chung 1 bảng đầy đủ quân số**: Khi bấm nút **Xuất Excel / Xuất Báo Cáo** tại mục Điểm danh, hệ thống mặc định lấy **toàn bộ nhân viên đang làm việc** (gồm cả người **Đã điểm danh** và người **Chưa điểm danh**) vào **chung 1 bảng**, sắp xếp chuẩn theo Khoa/Phòng và Họ tên.
- **Loại bỏ tài khoản Admin & nhân sự nghỉ việc/đã khóa**: Tự động lọc bỏ tất cả các tài khoản có vai trò Quản trị (`admin`, `super_admin`, tài khoản quản trị hệ thống như `namnb`, `admin_default`, mã nhân viên không phải dạng số) và các nhân sự đang ở trạng thái Đã khóa / Tạm dừng / Nghỉ việc khỏi danh sách điểm danh và file Excel xuất ra.
- **Bố cục cột Excel cơ bản, trực quan theo từng người**: Hiển thị rõ ràng các cột **STT, Mã NV, Họ và tên, Khoa / Phòng, Trạng thái, Giờ vào Ca sáng, Giờ ra Ca sáng, Giờ vào Ca chiều, Giờ ra Ca chiều** kèm phần tiêu đề quốc hiệu/bệnh viện và dòng thống kê tổng hợp ở đầu bảng.

---

## 1. Overview & Core Concept

- **What It Does**:
  - Trên giao diện **Điểm danh** của Quản trị viên và khi bấm **Xuất Excel**, hệ thống tự động đối chiếu danh sách nhân sự thực tế đang làm việc tại các Khoa/Phòng với dữ liệu quét chấm công để tạo ra một bảng tổng hợp duy nhất.
  - Mỗi nhân viên có mặt trên một dòng với trạng thái chi tiết (`Đúng giờ`, `Đi muộn (...)`, `Về sớm (...)`, `Đủ ca`, hoặc `Chưa điểm danh`) cùng giờ vào/ra Ca sáng và Ca chiều.
- **Target Audience / Persona**: Ban Giám đốc, Phòng Tổ chức Hành chính, Phòng Kế hoạch Tổng hợp và Quản trị viên tại Bệnh viện Đa khoa Thiệu Hóa.
- **Key Value**: Không cần phải đối chiếu thủ công giữa danh sách nhân sự và danh sách quét QR; chỉ với 1 cú nhấp chuột xuất báo cáo là nắm bắt ngay ai đã đi làm, ai đi muộn và ai chưa điểm danh trong toàn viện hoặc theo từng khoa phòng.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. Quản trị viên mở mục **Điểm danh** (hoặc **Báo cáo**), có thể chọn Ngày (hoặc Khoảng thời gian) và lọc theo Khoa/Phòng hoặc Trạng thái (`Tất cả`, `Đã điểm danh`, `Chưa điểm danh`, `Đi muộn`).
  2. Trong danh sách lọc nhân viên và bảng hiển thị trên màn hình, các tài khoản Admin và nhân sự đã khóa/nghỉ việc được ẩn đi hoàn toàn để số liệu chuyên cần phản ánh đúng 100% quân số thực tế.
  3. Khi bấm nút **Xuất Excel (Toàn bộ Đã & Chưa điểm danh)**, hệ thống tải ngay file Excel được định dạng chỉn chu với tiêu đề Bệnh viện Đa khoa Thiệu Hóa, thống kê nhanh quân số (Tổng số nhân viên, Đã điểm danh, Chưa điểm danh, Đi muộn) và bảng chi tiết từng người.
- **Visual Identity & Theme**:
  - **Aesthetic Direction**: Chuẩn biểu mẫu hành chính y tế hiện đại, rõ ràng, mật độ thông tin hợp lý, dễ đọc trên cả màn hình và khi in ra giấy A4.
  - **Color Palette & Mood**: Nền sáng (`#F8FAFC`), bảng trắng (`#FFFFFF`), điểm nhấn xanh y tế (`#2563EB`) và các nhãn trạng thái ngữ nghĩa: Xanh lá (`#16A34A` - Đúng giờ/Đã điểm danh), Vàng cam (`#D97706` - Đi muộn/Về sớm), Đỏ nhạt/Xám (`#DC2626` / `#64748B` - Chưa điểm danh).
  - **Typography & Hierarchy**: Tất cả các cột thời gian (`HH:mm:ss`) và Mã nhân viên hiển thị dạng `tabular-nums` / `font-mono` giúp căn thẳng hàng tuyệt đối theo chiều dọc.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Mặc định xuất chung 1 bảng bao gồm cả Đã điểm danh và Chưa điểm danh**
  - *Chosen Approach*: Nút chính **Xuất Báo Cáo Excel** sẽ xuất ngay bảng tổng hợp toàn bộ nhân viên (cả người đã điểm danh và chưa điểm danh) thay vì chỉ xuất những người có lượt quét như trước đây.
  - *Why*: Đáp ứng đúng nhu cầu kiểm tra quân số hàng ngày của bệnh viện — người quản lý cần nhìn thấy ngay những ai vắng/chưa điểm danh nằm chung trong danh sách khoa phòng.
  - *Alternatives Considered*: Tách thành 2 nút riêng biệt (chỉ người đã điểm danh vs. toàn bộ). Tuy nhiên việc để mặc định xuất chỉ người đã điểm danh khiến người dùng dễ bỏ sót nhân sự chưa chấm công.

- **Decision 2: Bộ lọc loại trừ tài khoản Admin và nhân sự đã khóa chuẩn hóa xuyên suốt**
  - *Chosen Approach*: Xây dựng bộ kiểm tra nhân sự hợp lệ thống nhất: loại bỏ tài khoản có `role === 'admin' || role === 'super_admin'`, tài khoản hệ thống (`namnb`, `admin_default`, email `@local.app` dành cho admin không thuộc biên chế chấm công), và các nhân sự có `is_hidden === true` hoặc `status === 'inactive' | 'locked'`.
  - *Why*: Tài khoản Admin dùng để vận hành Dashboard, không tham gia chấm công QR hàng ngày; nếu giữ lại sẽ làm sai lệch tổng quân số và luôn bị báo "Chưa điểm danh" trong file Excel.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Dữ Liệu Nguồn (Database / State)                    │
│  ┌───────────────────────────────┐   ┌───────────────────────────────┐  │
│  │ Danh sách Nhân sự (Users)     │   │ Nhật ký Điểm danh (Records)   │  │
│  └───────────────┬───────────────┘   └───────────────┬───────────────┘  │
└──────────────────┼───────────────────────────────────┼──────────────────┘
                   │                                   │
                   ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│            Bộ Lọc Chuẩn Hóa Quân Số (Active Staff Filter)               │
│  • Loại bỏ role: 'admin', 'super_admin', tài khoản quản trị hệ thống    │
│  • Loại bỏ nhân sự đã khóa / nghỉ việc (is_hidden, inactive, locked)    │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│          Bộ Tổng Hợp Bảng Điểm Danh Chung (Unified Roster Merger)       │
│  • Kết hợp Nhân sự + Lượt quét theo Ngày (hoặc Khoảng ngày)             │
│  • Phân loại Ca Sáng (Giờ vào / Giờ ra) & Ca Chiều (Giờ vào / Giờ ra)   │
│  • Xác định Trạng thái: Đúng giờ | Đi muộn | Về sớm | Chưa điểm danh    │
│  • Sắp xếp theo: Khoa/Phòng (A-Z) ──► Họ và tên (A-Z) ──► Mã NV         │
└─────────────────┬────────────────────────────────────┬──────────────────┘
                  │                                    │
                  ▼                                    ▼
┌──────────────────────────────────┐ ┌────────────────────────────────────┐
│ Giao Diện Bảng Điểm Danh (UI)    │ │ Xuất Báo Cáo Excel (.xlsx)         │
│ • Xem trực tiếp cả Đã & Chưa ĐD  │ │ • Tiêu đề BVĐK Thiệu Hóa & Ngày    │
│ • Lọc theo Khoa, Trạng thái, Tên │ │ • Thống kê: Tổng | Có mặt | Vắng   │
│ • Ẩn hoàn toàn tài khoản Admin   │ │ • Bảng chuẩn: Mã NV, Họ tên, Khoa, │
│                                  │ │   Trạng thái, Ca Sáng, Ca Chiều    │
└──────────────────────────────────┘ └────────────────────────────────────┘
```

### Cấu trúc Bảng Excel Xuất Ra

1. **Phần Tiêu đề & Thống kê tổng quan (Dòng 1 – 4)**:
   - Dòng 1: `BỆNH VIỆN ĐA KHOA THIỆU HÓA - BÁO CÁO CHI TIẾT ĐIỂM DANH NHÂN VIÊN`
   - Dòng 2: `Ngày báo cáo: dd/MM/yyyy` (hoặc `Từ ngày ... đến ngày ...`) | `Khoa/Phòng: Tất cả khoa phòng (hoặc tên khoa đang lọc)`
   - Dòng 3: `Tổng quân số: X người | Đã điểm danh: Y người | Chưa điểm danh: Z người | Đi muộn: M người`
2. **Phần Bảng dữ liệu chi tiết (Từ dòng 5 trở đi)**:
   - Các cột:
     - `STT`
     - `Ngày` *(nếu xuất theo khoảng nhiều ngày)*
     - `Mã NV`
     - `Họ và tên`
     - `Khoa / Phòng`
     - `Trạng thái` *(Đúng giờ / Đi muộn (Xp) / Về sớm (Yp) / Chưa điểm danh)*
     - `CA SÁNG - Giờ vào`
     - `CA SÁNG - Giờ ra`
     - `CA CHIỀU - Giờ vào`
     - `CA CHIỀU - Giờ ra`
   - Căn chỉnh độ rộng cột tự động (`!cols`) và gộp ô tiêu đề (`!merges`) giúp mở file trên Microsoft Excel hoặc Google Sheets đều hiển thị đẹp mắt, không bị khuất chữ.
