export interface BriefingRosterItem {
  id: number;
  department: string;
  departmentOrder: number;
  staffOrder: number;
  name: string;
  specialty: string;
  position: string;
}

export interface BriefingAttendanceRecord {
  id?: number;
  rosterId: number;
  name: string;
  department: string;
  specialty?: string;
  position?: string;
  dateStr: string;
  timeStr: string;
  timestamp: number;
  method?: string;
}

export const BRIEFING_POSTER_IMAGE_URL =
  '/assets/aistudio/1793001995714_120066809766509990_3898913937807997719_3a9801e269b1e7e3ee7f4451e94b00d0_168eb5a8.jpg';

export const OFFICIAL_BRIEFING_QR_TOKEN = 'GIAO_BAN_BV_THIEU_HOA';

export function buildOfficialBriefingQrUrl(customOrigin?: string): string {
  const rawOrigin =
    customOrigin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://ais-pre-wsjbcdu26lxmz4qnqriuix-250396406889.asia-southeast1.run.app');
  // Luôn dùng tên miền công khai ais-pre- để khi quét QR trên điện thoại vào thẳng phần Giao ban mà KHÔNG yêu cầu đăng nhập tài khoản Google
  const publicOrigin = rawOrigin.replace('ais-dev-', 'ais-pre-').replace(/\/$/, '');
  return `${publicOrigin}/checkin/${OFFICIAL_BRIEFING_QR_TOKEN}?qr=${OFFICIAL_BRIEFING_QR_TOKEN}&tab=briefing`;
}

export function isOfficialBriefingQrPayload(payload: string = '', expectedQrPayload: string = ''): boolean {
  const trimmed = (payload || '').trim();
  if (!trimmed) return false;
  if (
    trimmed === OFFICIAL_BRIEFING_QR_TOKEN ||
    trimmed.includes(`qr=${OFFICIAL_BRIEFING_QR_TOKEN}`) ||
    trimmed.includes('GIAO_BAN_BV') ||
    trimmed.includes('/checkin/GIAO_BAN') ||
    trimmed.includes('tab=briefing') ||
    trimmed.includes('/giao-ban')
  ) {
    return true;
  }
  if (expectedQrPayload && trimmed === expectedQrPayload.trim()) {
    return true;
  }
  return false;
}

export const BRIEFING_DEPARTMENTS_ORDER: string[] = [
  'Phòng TC-HC',
  'Phòng TC-KT',
  'Phòng Kế hoạch nghiệp vụ',
  'Khoa YHCT-PHCN',
  'Khoa Ngoại',
  'Khoa Nhi',
  'Khoa Phụ- sản',
  'Khoa RHM-Mắt-TMH',
  'Khoa Xét nghiệm',
  'Khoa Nội',
  'Khoa Lão Khoa',
  'Khoa CC- HSTC và Chống độc',
  'Khoa Khám bệnh',
  'Khoa Chẩn đoán hình ảnh',
  'Khoa Dược - VTYT',
  'Khoa KSNK',
  'Khoa Truyền nhiễm',
];

const RAW_ROSTER_BY_DEPT: {
  department: string;
  staff: { name: string; specialty: string; position: string }[];
}[] = [
  {
    department: 'Phòng TC-HC',
    staff: [
      { name: 'Nguyễn Lê Lâm', specialty: 'BSCKII', position: 'Giám đốc' },
      { name: 'Phạm Văn Nhì', specialty: 'Ths', position: 'TP. TCHC' },
    ],
  },
  {
    department: 'Phòng TC-KT',
    staff: [
      { name: 'Lê Thị Thương Huyền', specialty: 'Ths', position: 'TP. TCKT' },
      { name: 'Phạm Thị Hà', specialty: 'Ths', position: 'PTP. TCKT' },
    ],
  },
  {
    department: 'Phòng Kế hoạch nghiệp vụ',
    staff: [
      { name: 'Ngô Ngọc Đức', specialty: 'BSCKI', position: 'TP. KH-NV' },
      { name: 'Ngô Thị Kim Phượng', specialty: 'Ths ĐD', position: 'PTP. KH-NV' },
      { name: 'Nguyễn Văn Hoàng', specialty: 'DSCKI', position: 'PTP. KH-NV' },
      { name: 'Hoàng Thị Thanh Hương', specialty: 'CNTT', position: 'Tổ CNTT' },
    ],
  },
  {
    department: 'Khoa YHCT-PHCN',
    staff: [
      { name: 'Nguyễn Phương Nam', specialty: 'BSCKI', position: 'TK. YHCT' },
      { name: 'Nguyễn Ngọc Hương', specialty: 'CNĐD', position: 'ĐDT' },
      { name: 'Nguyễn Khắc Quyết', specialty: 'BSYHCT', position: '' },
      { name: 'Trịnh Thùy Linh', specialty: 'BSYHCT', position: '' },
      { name: 'Nguyễn Thị Lượng', specialty: 'BSCK', position: '' },
      { name: 'Tô Thị Kim Thảo', specialty: 'BSYHCT', position: '' },
      { name: 'La Thanh Loan', specialty: 'BSYHCT', position: '' },
      { name: 'Nguyễn Lê Kim Chi', specialty: 'BSYHCT', position: '' },
      { name: 'Đỗ Trang Nhung', specialty: 'BSYHCT', position: '' },
      { name: 'Nguyễn Việt Dũng', specialty: 'BSYHCT', position: '' },
      { name: 'Phạm Hoàng Anh', specialty: 'BSYHCT', position: '' },
      { name: 'Trần Anh Thiên', specialty: 'BSYHCT', position: '' },
      { name: 'Lê Huy Nhượng', specialty: 'BSYHCT', position: '' },
    ],
  },
  {
    department: 'Khoa Ngoại',
    staff: [
      { name: 'Hoàng Văn Tuyên', specialty: 'BSCKII', position: 'Phó Giám đốc' },
      { name: 'Nguyễn Hữu Tuấn', specialty: 'ThsBs', position: 'Phó Khoa' },
      { name: 'Nguyễn Thị Hương', specialty: 'CNĐD', position: 'ĐDT' },
      { name: 'Cầm Bá Đạt', specialty: 'Bác sĩ', position: '' },
      { name: 'Lê Ngọc Hùng', specialty: 'Bác sĩ', position: '' },
      { name: 'Nguyễn Quang Huy', specialty: 'Bác sĩ', position: '' },
      { name: 'Lê Minh Tiến', specialty: 'Bác sĩ', position: '' },
      { name: 'Trần Ngọc Kiên', specialty: 'Bác sĩ', position: '' },
      { name: 'Lê Thiệu Đạt', specialty: 'Bác sĩ', position: '' },
      { name: 'Dương Thị Thuỳ', specialty: 'Bác sĩ', position: '' },
      { name: 'Phùng Thanh Sơn', specialty: 'Bác sĩ', position: '' },
    ],
  },
  {
    department: 'Khoa Nhi',
    staff: [
      { name: 'Nguyễn Thị Hoàng Liên', specialty: 'Bác Sĩ', position: 'Phụ trách khoa' },
      { name: 'Hoàng Thị Thảo', specialty: 'CNĐD', position: 'ĐDT' },
      { name: 'Nguyễn Thị Ngọc Anh', specialty: 'Bác sĩ', position: '' },
      { name: 'Nguyễn Thị Quyên', specialty: 'Bác sĩ', position: '' },
      { name: 'Bùi Thị Mận', specialty: 'Bác sĩ', position: '' },
      { name: 'Nguyễn Thị Hương Giang', specialty: 'Bác sĩ', position: '' },
      { name: 'Nguyễn Thị Thanh Huyền', specialty: 'Bác sĩ', position: '' },
      { name: 'Đàm Thị Chinh', specialty: 'Bác sĩ', position: '' },
      { name: 'Lê Khắc Huy Hoàng', specialty: 'Bác sĩ', position: '' },
    ],
  },
  {
    department: 'Khoa Phụ- sản',
    staff: [
      { name: 'Nguyễn Viết Tùng', specialty: 'BSCKI', position: 'Phụ trách khoa' },
      { name: 'Nguyễn Thị Hiền', specialty: 'Hộ sinh', position: 'HST' },
      { name: 'Lê Thị Thiện Tâm', specialty: 'BSCKI', position: '' },
      { name: 'Nguyễn Thị Huyền', specialty: 'Bác sĩ', position: '' },
      { name: 'Bàn Thị Lệ', specialty: 'Bác sĩ', position: '' },
      { name: 'Đặng Thị Phương', specialty: 'Bác sĩ', position: '' },
    ],
  },
  {
    department: 'Khoa RHM-Mắt-TMH',
    staff: [
      { name: 'Đặng Đình Thắm', specialty: 'BSCKI', position: 'Phó Giám đốc' },
      { name: 'Lê Thị Dự', specialty: 'CĐĐD', position: 'ĐDT' },
      { name: 'Lê Minh Quân', specialty: 'BSCKI', position: '' },
      { name: 'Lê Văn Hoàng', specialty: 'Bác sĩ', position: '' },
      { name: 'Nguyễn Thị Dung', specialty: 'BSCKI', position: '' },
      { name: 'Đặng Thị Trang', specialty: 'BSCKI', position: '' },
      { name: 'Trần Văn Vân', specialty: 'Bác sĩ', position: '' },
    ],
  },
  {
    department: 'Khoa Xét nghiệm',
    staff: [
      { name: 'Lê Thị Thúy', specialty: 'BSCKI', position: 'TK. XN' },
      { name: 'Lê Thị Hải Tâm', specialty: 'Ths', position: '' },
      { name: 'Đỗ Thị Hường', specialty: 'CN KTV', position: 'KTV T' },
    ],
  },
  {
    department: 'Khoa Nội',
    staff: [
      { name: 'Lê Thị Thơm', specialty: 'BSCKI', position: 'Phụ trách khoa' },
      { name: 'Lê Thị Thuỷ', specialty: 'CNĐD', position: 'ĐDT' },
      { name: 'Hoàng Liên Sơn', specialty: 'BSCKI', position: '' },
      { name: 'Lê Nguyễn Hoài An', specialty: 'Bác sĩ', position: '' },
      { name: 'Lê Thị Trang', specialty: 'Bác sĩ', position: '' },
      { name: 'Hoàng Hằng Nga', specialty: 'Bác sĩ', position: '' },
    ],
  },
  {
    department: 'Khoa Lão Khoa',
    staff: [
      { name: 'Lê Hữu Thanh', specialty: 'BSCKI', position: 'TK. Lão khoa' },
      { name: 'Vũ Thị Hằng', specialty: 'CNĐD', position: 'ĐDT' },
      { name: 'Trương Thị Nga', specialty: 'Bác sĩ', position: '' },
      { name: 'Bùi Thị Thu Nguyệt', specialty: 'BSCKI', position: '' },
    ],
  },
  {
    department: 'Khoa CC- HSTC và Chống độc',
    staff: [
      { name: 'Vũ Thị Hà', specialty: 'Ths Bs', position: 'Phụ trách khoa' },
      { name: 'Lê Thị Tuyết', specialty: 'CĐĐD', position: 'Phụ trách ĐD' },
      { name: 'Nguyễn Thị Thu', specialty: 'Bác sĩ', position: '' },
      { name: 'Lê Như Hùng', specialty: 'Bác sĩ', position: '' },
      { name: 'Nguyễn Thị Thảo', specialty: 'Bác sĩ', position: '' },
      { name: 'Nguyễn Thị Lâm Anh', specialty: 'Bác sĩ', position: '' },
      { name: 'Cầm Thị Thanh Huyền', specialty: 'Bác sĩ', position: '' },
      { name: 'Hà Văn Hảo', specialty: 'Bác sĩ', position: '' },
      { name: 'Trần Thu Trang', specialty: 'Bác sĩ', position: '' },
      { name: 'Nguyễn Quang Anh', specialty: 'Bác sĩ', position: '' },
    ],
  },
  {
    department: 'Khoa Khám bệnh',
    staff: [
      { name: 'Lê Xuân Dũng', specialty: 'BSCKI', position: 'Phó Giám đốc' },
      { name: 'Nguyễn Thị Liên', specialty: 'BSCKI', position: 'TK. KB' },
      { name: 'Hồ Thị Loan', specialty: 'CNĐD', position: 'ĐDT' },
      { name: 'Lê Xuân Hoàn', specialty: 'Bác sĩ', position: '' },
      { name: 'Lê Thị Hương', specialty: 'Bác sĩ', position: '' },
      { name: 'Nguyễn Xuân Cương', specialty: 'BSCKI', position: '' },
      { name: 'Lý Thị Nhung', specialty: 'Bác sĩ', position: '' },
      { name: 'Lục Thị Hồng', specialty: 'Bác sĩ', position: '' },
      { name: 'Đặng Thị Dương', specialty: 'Bác sĩ', position: '' },
    ],
  },
  {
    department: 'Khoa Chẩn đoán hình ảnh',
    staff: [
      { name: 'Trần Thị Lài', specialty: 'BSCKI', position: 'TK. CĐHA' },
      { name: 'Trần Thị Thu Hiền', specialty: 'CNĐD', position: 'ĐDT' },
      { name: 'Hoàng Khắc Sơn', specialty: 'BSCKI', position: '' },
      { name: 'Ngô Đức Linh', specialty: 'Bác sĩ', position: '' },
      { name: 'Lê Thị Trang', specialty: 'Bác sĩ', position: '' },
      { name: 'Lê Bá Khánh Dư', specialty: 'Bác sĩ', position: '' },
    ],
  },
  {
    department: 'Khoa Dược - VTYT',
    staff: [
      { name: 'Lê Thị Hằng', specialty: 'DSCKI', position: 'TK. Dược' },
    ],
  },
  {
    department: 'Khoa KSNK',
    staff: [
      { name: 'Lê Thị Vinh', specialty: 'CNYTCC', position: 'TK. KSNK' },
      { name: 'Lê Diệu Linh', specialty: 'CNĐD', position: 'ĐDT' },
    ],
  },
  {
    department: 'Khoa Truyền nhiễm',
    staff: [
      { name: 'Lê Sỹ Đáng', specialty: 'Bác sĩ', position: 'TK. Tr nhiễm' },
      { name: 'Nguyễn Thị Trang', specialty: 'CNĐD', position: 'ĐDT' },
      { name: 'Lê Thị Trang', specialty: 'Bác sĩ', position: '' },
      { name: 'Trần Vân Anh', specialty: 'Bác sĩ', position: '' },
      { name: 'Lê Thị Minh', specialty: 'Bác sĩ', position: '' },
      { name: 'Lê Văn Dương', specialty: 'Bác sĩ', position: '' },
    ],
  },
];

export function formatCleanBriefingName(rawName: string = ''): string {
  const withoutParen = rawName.replace(/\([^)]*\)/g, '').trim();
  if (!withoutParen) return '';
  return withoutParen
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export const DEFAULT_BRIEFING_ROSTER: BriefingRosterItem[] = (() => {
  const list: BriefingRosterItem[] = [];
  let runningId = 1;
  RAW_ROSTER_BY_DEPT.forEach((group, deptIdx) => {
    group.staff.forEach((person, staffIdx) => {
      list.push({
        id: runningId++,
        department: group.department,
        departmentOrder: deptIdx + 1,
        staffOrder: staffIdx + 1,
        name: formatCleanBriefingName(person.name),
        specialty: person.specialty,
        position: person.position,
      });
    });
  });
  return list;
})();

export function normalizeVietnameseText(str: string = ''): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSameBriefingDepartment(deptA: string = '', deptB: string = ''): boolean {
  const a = normalizeVietnameseText(deptA);
  const b = normalizeVietnameseText(deptB);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const aliases: [string[], string[]][] = [
    [['tc hc', 'to chuc hanh chinh'], ['tc hc', 'to chuc hanh chinh']],
    [['tc kt', 'tai chinh ke toan'], ['tc kt', 'tai chinh ke toan']],
    [['ke hoach nghiep vu', 'kh nv', 'khnv'], ['ke hoach nghiep vu', 'kh nv', 'khnv']],
    [['yhct', 'y hoc co truyen', 'phcn'], ['yhct', 'y hoc co truyen', 'phcn']],
    [['phu san', 'khoa san'], ['phu san', 'khoa san']],
    [['rhm', 'rang ham mat', 'mat', 'tmh', 'tai mui hong', 'lien chuyen khoa'], ['rhm', 'rang ham mat', 'mat', 'tmh', 'tai mui hong', 'lien chuyen khoa']],
    [['cc hstc', 'hoi suc', 'cap cuu', 'chong doc'], ['cc hstc', 'hoi suc', 'cap cuu', 'chong doc']],
    [['chan doan hinh anh', 'cdha'], ['chan doan hinh anh', 'cdha']],
    [['duoc', 'vtyt'], ['duoc', 'vtyt']],
    [['ksnk', 'kiem soat nhiem khuan'], ['ksnk', 'kiem soat nhiem khuan']],
  ];

  for (const [group1, group2] of aliases) {
    const matchA = group1.some(k => a.includes(k));
    const matchB = group2.some(k => b.includes(k));
    if (matchA && matchB) return true;
  }
  return false;
}

export function findMatchingRosterStaff(
  roster: BriefingRosterItem[],
  name: string,
  department?: string
): BriefingRosterItem | undefined {
  const normName = normalizeVietnameseText(name);
  if (!normName) return undefined;

  const candidates = roster.filter(item => {
    const itemNorm = normalizeVietnameseText(item.name);
    const itemWithoutParen = normalizeVietnameseText(item.name.replace(/\([^)]*\)/g, ''));
    return itemNorm === normName || itemWithoutParen === normName;
  });

  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  if (department) {
    const deptMatched = candidates.find(c => isSameBriefingDepartment(c.department, department));
    if (deptMatched) return deptMatched;
  }

  return candidates[0];
}
