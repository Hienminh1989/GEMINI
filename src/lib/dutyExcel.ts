import * as XLSX from 'xlsx';
import { format, startOfWeek, endOfWeek, addDays, parseISO, getISOWeek, getYear } from 'date-fns';
import { vi } from 'date-fns/locale';
import { DutyShift, UserData, Department, HospitalDutySchedule, HospitalDutyDayRow, HospitalHolyRow } from '../types';

export const DAY_NAMES_VI = [
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
  'Chủ Nhật'
];

export const DUTY_ROLES = [
  'Trực Lãnh đạo',
  'Bác sỹ trực cấp cứu',
  'BS Trực nhà 9 tầng',
  'Điều dưỡng trực chung CC',
  'Trực Nhi + LCK',
  'Trực Nội - Lão',
  'Trực Truyền nhiễm',
  'Trực Ngoại',
  'Trực Đông y',
  'Trực Hộ sinh',
  'Trực Siêu âm - X.Quang',
  'Đánh máy Siêu âm',
  'Trực Xét nghiệm',
  'Trực Lái xe cấp cứu',
  'Trực Phẫu thuật (Ngoại viện)',
  'Trực Gây mê (Ngoại viện)',
  'Phân luồng, HD-BN tại PK',
  'Đi làm phòng khám',
  'Hộ lý các tầng'
];

export const SHIFT_TYPES = [
  { name: 'Trực 24/24', startTime: '07:30', endTime: '07:30', description: 'Trực cả ngày lẫn đêm (24 giờ)' },
  { name: 'Ca Đêm', startTime: '17:00', endTime: '07:30', description: 'Trực qua đêm từ 17h00 đến 07h30 sáng hôm sau' },
  { name: 'Ca Sáng', startTime: '07:30', endTime: '11:30', description: 'Trực buổi sáng' },
  { name: 'Ca Chiều', startTime: '13:30', endTime: '17:00', description: 'Trực buổi chiều' },
  { name: 'Trực Cấp cứu 12h', startTime: '19:00', endTime: '07:00', description: 'Trực ca 12 tiếng' }
];

export function normalizeText(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Intelligent Vietnamese Hospital Duty Schedule Name Matcher
 * Matches combinations such as:
 * - "Quân" with "Lê Văn Quân"
 * - "Quyết đy" with "Lê Văn Quyết"
 * - "P.Trang đy" with "Nguyễn Thị Phương Trang"
 * - "L.Anh cc hv" with "Trần Thị Lan Anh"
 * - "Giang nhi (kèm)" with "Nguyễn Thị Giang"
 * - "Thu cc" with "Trần Thị Thu"
 * - "Mẫn" with "Nguyễn Hồng Tuệ Mẫn"
 */
export function isUserNameMatch(shiftUserName: string | null | undefined, currentFullName: string | null | undefined): boolean {
  if (!shiftUserName || !currentFullName) return false;
  
  const sRaw = shiftUserName.trim();
  const uRaw = currentFullName.trim();
  if (!sRaw || !uRaw) return false;

  const sNorm = normalizeText(sRaw);
  const uNorm = normalizeText(uRaw);

  // 1. Direct match
  if (sNorm === uNorm) return true;
  if (uNorm.includes(sNorm)) return true;

  // 2. Clean out hospital department annotations, roles, and status tags
  const cleanShift = sNorm
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\b(cc|dy|nhi|noi|ngoa|ngoai|cdha|sa|xquang|xn|ck|pk|gm|gmhs|hs|tn|lck|lx|san|hv|nb|kem|phu|chinh|bs|dd|hscc)\b/gi, '')
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanShift) return false;
  if (cleanShift === uNorm || uNorm.includes(cleanShift)) return true;

  // 3. Match Vietnamese First Name (Tên chính)
  const userWords = uNorm.split(/\s+/).filter(Boolean);
  if (userWords.length === 0) return false;

  const userLastName = userWords[userWords.length - 1]; // e.g. "man" in "nguyen hong tue man"
  const userMiddleName = userWords.length >= 2 ? userWords[userWords.length - 2] : '';
  const userTwoLastNames = `${userMiddleName} ${userLastName}`.trim(); // e.g. "tue man", "lan anh", "phuong trang"

  const shiftTokens = cleanShift.replace(/[.\-_]/g, ' ').split(/\s+/).filter(Boolean);
  const shiftLastName = shiftTokens[shiftTokens.length - 1];

  // Direct match on main first name (at least 2 letters)
  if (userLastName && shiftLastName && userLastName === shiftLastName && userLastName.length >= 2) {
    // If shift has initial prefix like "L.Đạt" or "P.Trang" or "B.Hiền"
    if (cleanShift.includes('.')) {
      const initial = cleanShift.split('.')[0].trim();
      const userFirstNameInitial = userWords[0]?.[0] || '';
      const userMiddleNameInitial = userMiddleName?.[0] || '';
      if (initial && (initial === userFirstNameInitial || initial === userMiddleNameInitial)) {
        return true;
      }
    }
    return true;
  }

  // Composite last name match (e.g. "tue man" in "nguyen hong tue man")
  if (userTwoLastNames && (cleanShift.includes(userTwoLastNames) || userTwoLastNames.includes(cleanShift))) {
    return true;
  }

  return false;
}

export function getWeekDates(baseDate: Date = new Date()) {
  const start = startOfWeek(baseDate, { weekStartsOn: 1 });
  const end = endOfWeek(baseDate, { weekStartsOn: 1 });
  const days: { date: Date; dateStr: string; dayName: string; dayIndex: number; dayShort: string }[] = [];
  
  const dayShorts = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    days.push({
      date: d,
      dateStr: format(d, 'yyyy-MM-dd'),
      dayName: DAY_NAMES_VI[i],
      dayShort: `${dayShorts[i]} ${format(d, 'dd/M')}`,
      dayIndex: i
    });
  }

  return {
    start,
    end,
    weekStartDateStr: format(start, 'yyyy-MM-dd'),
    weekEndDateStr: format(end, 'yyyy-MM-dd'),
    weekNumber: getISOWeek(baseDate),
    year: getYear(baseDate),
    days
  };
}

/**
 * Creates default sample Hospital Duty Schedule matching exact PDF/image template
 */
export function getDefaultHospitalSchedule(baseDate: Date = new Date()): HospitalDutySchedule {
  const weekInfo = getWeekDates(baseDate);

  const sampleDays: HospitalDutyDayRow[] = [
    {
      dayLabel: 'T2',
      dateStr: format(weekInfo.days[0].date, 'dd/M'),
      dateIso: weekInfo.days[0].dateStr,
      leader: 'Đức',
      doctor1: 'Quân\nQuyết đy',
      doctor2: 'Huyền cc\nGiang nhi (kèm)',
      doctor9Floor: 'Dương',
      nurse1: 'Thu cc\nTú đy',
      nurse2: 'Dương\nL.Anh cc hv',
      nhi_lck1: 'Yến cc',
      nhi_lck2: 'Thương ck',
      noi_lao1: 'Vinh nhi',
      noi_lao2: 'K.Phượng',
      truyen_nhiem: 'Tuyết nội\nPhúc',
      ngoai1: 'Đ.Thuỷ',
      ngoai2: 'Quyên',
      dong_y1: 'Hải',
      dong_y2: 'P.Trang đy',
      ho_sinh1: 'Hiền\nB.Hiền',
      ho_sinh2: 'Thịnh',
      sa_xquang1: 'Viết',
      sa_xquang2: 'Tho',
      danh_may1: '',
      danh_may2: '',
      xet_nghiem: 'L. Hà',
      lai_xe: 'Trọng',
      phau_thuat: 'Tùng - Vân\nHuyền',
      gay_me: '',
      phan_luong1: 'Quân',
      phan_luong2: 'Tâm',
      pk_ca_ngay1: '',
      pk_ca_ngay2: '',
      pk_ca_ngay3: '',
      pk_ca_ngay4: '',
      pk_t7_cn: '',
      pk_san: ''
    },
    {
      dayLabel: 'T3',
      dateStr: format(weekInfo.days[1].date, 'dd/M'),
      dateIso: weekInfo.days[1].dateStr,
      leader: 'Tuyên',
      doctor1: 'Hùng cc\nL.Đạt',
      doctor2: 'Nguyệt\nDũng đy (kèm)',
      doctor9Floor: 'Thùy',
      nurse1: 'Tuyết cc\nBình NB',
      nurse2: 'Hoàng\nHuy đy',
      nhi_lck1: 'Luận nội',
      nhi_lck2: 'Loan pk',
      noi_lao1: 'T.Hằng',
      noi_lao2: 'Hà ck',
      truyen_nhiem: 'Huyền nội\nN.Tâm',
      ngoai1: 'Lương\nDung cđha',
      ngoai2: '',
      dong_y1: 'Tuấn gm\nYên',
      dong_y2: 'Hương đy',
      ho_sinh1: 'Giang\nXuân',
      ho_sinh2: '',
      sa_xquang1: 'Lài',
      sa_xquang2: 'Trường',
      danh_may1: '',
      danh_may2: '',
      xet_nghiem: 'Trường',
      lai_xe: 'Bằng',
      phau_thuat: 'Tùng - L.Đạt\nHường',
      gay_me: '',
      phan_luong1: 'Tuyên',
      phan_luong2: 'Yên',
      pk_ca_ngay1: '',
      pk_ca_ngay2: '',
      pk_ca_ngay3: '',
      pk_ca_ngay4: '',
      pk_t7_cn: '',
      pk_san: ''
    },
    {
      dayLabel: 'T4',
      dateStr: format(weekInfo.days[2].date, 'dd/M'),
      dateIso: weekInfo.days[2].dateStr,
      leader: 'Thắm',
      doctor1: 'H.Liên\nThảo cc',
      doctor2: 'C.Đạt\nK.Chi đy (kèm)',
      doctor9Floor: 'Đáng',
      nurse1: 'Nhâm\nV.Tuyết',
      nurse2: 'Cường ck\nH.Ngọc hv',
      nhi_lck1: 'Dũng cc',
      nhi_lck2: 'P.Dung',
      noi_lao1: 'Vị',
      noi_lao2: 'Huyền ck',
      truyen_nhiem: 'D.Thuỷ\nV.Hằng',
      ngoai1: 'Trang A\nHuyền cđha',
      ngoai2: '',
      dong_y1: 'Huyền gm\nHạnh',
      dong_y2: 'Thành đy',
      ho_sinh1: 'Thu\nOanh',
      ho_sinh2: '',
      sa_xquang1: 'Viết\nTuấn - Nhuệ',
      sa_xquang2: '',
      danh_may1: '',
      danh_may2: '',
      xet_nghiem: 'L Tâm',
      lai_xe: 'Quang',
      phau_thuat: 'Tùng - C.Đạt\nQuyên',
      gay_me: '',
      phan_luong1: 'Quân',
      phan_luong2: 'Hương',
      pk_ca_ngay1: '',
      pk_ca_ngay2: '',
      pk_ca_ngay3: '',
      pk_ca_ngay4: '',
      pk_t7_cn: '',
      pk_san: ''
    },
    {
      dayLabel: 'T5',
      dateStr: format(weekInfo.days[3].date, 'dd/M'),
      dateIso: weekInfo.days[3].dateStr,
      leader: 'Tuyên',
      doctor1: 'Thanh\nMinh',
      doctor2: 'Vân\nHảo cc (kèm)',
      doctor9Floor: 'Dương',
      nurse1: 'Phượng cc\nHùng đy',
      nurse2: 'Tuân\nCúc pk',
      nhi_lck1: 'Phương cc',
      nhi_lck2: 'K.Lam',
      noi_lao1: 'Vinh nhi',
      noi_lao2: 'Nhung ck',
      truyen_nhiem: 'Ph.Hằng nội\nL.Thuỷ',
      ngoai1: 'Đ.Thuỷ\nM.Ngọc',
      ngoai2: '',
      dong_y1: 'Tâm ng\nHải',
      dong_y2: 'P.Trang đy',
      ho_sinh1: 'Giang\nHằng',
      ho_sinh2: '',
      sa_xquang1: 'Lài\nThọ - Thắng',
      sa_xquang2: '',
      danh_may1: '',
      danh_may2: '',
      xet_nghiem: 'Chung',
      lai_xe: 'Trọng',
      phau_thuat: 'Tùng - Vân\nTuấn',
      gay_me: '',
      phan_luong1: 'Tuyên',
      phan_luong2: 'Tâm',
      pk_ca_ngay1: '',
      pk_ca_ngay2: '',
      pk_ca_ngay3: '',
      pk_ca_ngay4: '',
      pk_t7_cn: '',
      pk_san: ''
    },
    {
      dayLabel: 'T6',
      dateStr: format(weekInfo.days[4].date, 'dd/M'),
      dateIso: weekInfo.days[4].dateStr,
      leader: 'Thắm',
      doctor1: 'Cương\nHùng ng',
      doctor2: 'Nga\nH.Nga nội (kèm)',
      doctor9Floor: 'Huyền nhi',
      nurse1: 'Dung cc\nHuyền XN',
      nurse2: 'T.Yên\nTr.Yên',
      nhi_lck1: 'T.Phượng',
      nhi_lck2: 'Giang nk',
      noi_lao1: 'Quyên nhi',
      noi_lao2: 'Hà ck',
      truyen_nhiem: 'Huyền nội\nN.Tâm',
      ngoai1: 'Lương\nDung cđha',
      ngoai2: '',
      dong_y1: 'Tuấn gm\nDương',
      dong_y2: 'Hằng đy',
      ho_sinh1: 'Hiền\nDung',
      ho_sinh2: '',
      sa_xquang1: 'Viết\nHải',
      sa_xquang2: '',
      danh_may1: '',
      danh_may2: '',
      xet_nghiem: 'H Tâm',
      lai_xe: 'Bằng',
      phau_thuat: 'Tùng - Hùng ng\nHuyền',
      gay_me: '',
      phan_luong1: 'Quân',
      phan_luong2: 'Yên',
      pk_ca_ngay1: '',
      pk_ca_ngay2: '',
      pk_ca_ngay3: '',
      pk_ca_ngay4: '',
      pk_t7_cn: '',
      pk_san: ''
    },
    {
      dayLabel: 'T7',
      dateStr: format(weekInfo.days[5].date, 'dd/M'),
      dateIso: weekInfo.days[5].dateStr,
      leader: 'Lâm',
      doctor1: 'Dung ck\nPhương s',
      doctor2: 'Thơm\nHuy ng (kèm)',
      doctor9Floor: 'V.Anh',
      nurse1: 'V.Anh\nThắng đy',
      nurse2: 'Tiến\nT.Thuỷ',
      nhi_lck1: 'Loan NB\nTrang cc',
      nhi_lck2: 'Hạnh nhi\nLinh nk',
      noi_lao1: 'Nhung nội\nTrang B',
      noi_lao2: 'Thảo ck',
      truyen_nhiem: 'Phúc\nĐào',
      ngoai1: 'Hường ng\nThơ',
      ngoai2: '',
      dong_y1: 'N.Hương',
      dong_y2: '',
      ho_sinh1: 'Linh\nTrang',
      ho_sinh2: '',
      sa_xquang1: 'Sơn\nTuấn',
      sa_xquang2: '',
      danh_may1: 'Dũng',
      danh_may2: '',
      xet_nghiem: 'Ng Hà',
      lai_xe: 'Quang',
      phau_thuat: 'Tùng - Phương sản\nQuyên',
      gay_me: '',
      phan_luong1: 'Quân\nHải',
      phan_luong2: 'Lý - Thanh\nNụ 1/2',
      pk_ca_ngay1: 'H Liên\nNhung ck',
      pk_ca_ngay2: 'Hương\nH.Trang',
      pk_ca_ngay3: 'Hồng\nPhượng pk',
      pk_ca_ngay4: 'Liên\nLoan pk',
      pk_t7_cn: 'Lượng 1/2\nCúc 1/2',
      pk_san: 'Lệ\nHằng'
    },
    {
      dayLabel: 'CN',
      dateStr: format(weekInfo.days[6].date, 'dd/M'),
      dateIso: weekInfo.days[6].dateStr,
      leader: 'Dũng',
      doctor1: 'Hà\nLinh đy',
      doctor2: 'Tiến\nDương NB',
      doctor9Floor: 'Lượng',
      nurse1: 'Lực\nN.Anh LK',
      nurse2: 'Dũng cc\nL.Tâm',
      nhi_lck1: 'Trung đy\nHồng nhi',
      nhi_lck2: 'Thảo nhi\nH.Trang',
      noi_lao1: 'Ngô Hằng nội\nL.Phương',
      noi_lao2: 'Hà đy',
      truyen_nhiem: 'P.Thuần\nDuyên LK',
      ngoai1: 'Minh\nTuyết cđha',
      ngoai2: '',
      dong_y1: 'Hà đy\nHương',
      dong_y2: '',
      ho_sinh1: 'Thu\nB.Hiền',
      ho_sinh2: '',
      sa_xquang1: 'Viết\nThọ',
      sa_xquang2: '',
      danh_may1: 'Bích',
      danh_may2: '',
      xet_nghiem: 'Thúy',
      lai_xe: 'Trọng',
      phau_thuat: 'Tùng - Tiến\nHương',
      gay_me: '',
      phan_luong1: 'Tuyên\nHương',
      phan_luong2: 'Kh.Phượng\nB.Hương',
      pk_ca_ngay1: 'Quân\nLệ',
      pk_ca_ngay2: 'Liên\nP.Dung',
      pk_ca_ngay3: 'Cương\nĐào',
      pk_ca_ngay4: 'Dương\nCúc pk',
      pk_t7_cn: 'Hương\nH.Ngọc',
      pk_san: 'Huyền\nTrang'
    }
  ];

  const sampleHoly: HospitalHolyRow[] = [
    {
      dayLabel: 'Thứ 7',
      tang1_2: 'Thắng',
      tang3_4: 'Dung',
      tang5_6: 'Hồng',
      tang7_8: 'Quyên',
      pk_hscc: 'Hằng'
    },
    {
      dayLabel: 'Chủ nhật',
      tang1_2: 'Thủy',
      tang3_4: 'Quý',
      tang5_6: 'Thơm',
      tang7_8: 'Bảo',
      pk_hscc: 'Hương'
    }
  ];

  const defaultNotes = [
    'Trực thường trú tiêu sợi huyết tuần 33 là Bs Huyền cc, Điều dưỡng Trang cc',
    'Các Đ/c phạm vi hoạt động CM là YHCT-PHCN, KTV khoa ĐY tham gia trực không đứng tên, được đứng tên ở khoa ĐY.',
    'Cột BS bôi vàng trực tại nhà 9 tầng, xử lý BN trong tòa nhà 9 tầng và phải BC trưởng trực.',
    'Trực cấp cứu, trực XN, trực CĐHA là trực 24/24, các vị trí khác 16/24.',
    'Trực cọc 2 Khoa Nhi về hỗ trợ với trực đơn nguyên cấp cứu từ 18h đến 23h về khoa Nhi chia tua. Trực LCK về hỗ trợ nhi từ 18h đến 23h.',
    'Trực thường trú kế toán liên hệ đ.c Thương Huyền 0982 199 685',
    'Trực lái xe ngày hôm trước thì trực thường trú ngày hôm sau.',
    'Ghi chú: Trực ngày nghỉ, ngày lễ trưởng trực căn cứ tình hình thực tế nếu cần huy động trong vị trí trực khác về hỗ trợ tại ĐNCC theo thời điểm.'
  ];

  return {
    weekNumber: weekInfo.weekNumber,
    year: weekInfo.year,
    startDate: weekInfo.weekStartDateStr,
    endDate: weekInfo.weekEndDateStr,
    title: `LỊCH TRỰC TUẦN ${weekInfo.weekNumber} TỪ NGÀY ${format(weekInfo.start, 'dd/MM')} ĐẾN ${format(weekInfo.end, 'dd/MM/yyyy')}`,
    leaderOnDuty: 'BS CKI Lê Xuân Dũng',
    organization: 'BỆNH VIỆN ĐA KHOA THIỆU HÓA',
    documentNo: '/LTr-BVĐKTH',
    notes: defaultNotes,
    scheduleData: sampleDays,
    holyData: sampleHoly
  };
}

/**
 * Generate official Hospital Weekly Duty Schedule Template Excel File (.xlsx)
 */
export function generateHospitalDutyScheduleTemplate(baseDate: Date = new Date()): void {
  const schedule = getDefaultHospitalSchedule(baseDate);
  exportHospitalDutyScheduleToExcel(schedule);
}

/**
 * Export structured Hospital Duty Schedule to Excel file
 */
export function exportHospitalDutyScheduleToExcel(schedule: HospitalDutySchedule): void {
  const wb = XLSX.utils.book_new();

  // Construct AoA (Array of Arrays)
  const aoa: any[][] = [];

  // Header lines
  aoa.push(['SỞ Y TẾ THANH HÓA', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM']);
  aoa.push(['BỆNH VIỆN ĐA KHOA THIỆU HÓA', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Độc lập - Tự do - Hạnh phúc']);
  aoa.push([`Số: ${schedule.documentNo || '/LTr-BVĐKTH'}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', `Thiệu Trung, ngày ${format(new Date(), 'dd')} tháng ${format(new Date(), 'MM')} năm ${format(new Date(), 'yyyy')}`]);
  aoa.push([]);
  aoa.push([schedule.title || `LỊCH TRỰC TUẦN ${schedule.weekNumber}`]);
  aoa.push([`Thường trực lãnh đạo: ${schedule.leaderOnDuty || ''}`]);
  aoa.push([]);

  // Main Table Headers Row 1 (Group categories)
  const headerGroup1 = [
    'NGÀY',
    'LÃNH ĐẠO',
    'TRỰC NỘI VIỆN', '', '', '', '', '', '', '', '', '', '', '', '',
    'TRỰC NGOẠI VIỆN', '',
    'PHÂN LUỒNG PK',
    'ĐI LÀM PHÒNG KHÁM', '', '', '', '', ''
  ];

  // Main Table Headers Row 2 (Columns)
  const headerGroup2 = [
    'NGÀY',
    'LÃNH ĐẠO',
    'BÁC SỸ',
    'BS Trực nhà 9 tầng',
    'ĐIỀU DƯỠNG TRỰC CHUNG CẤP CỨU',
    'NHI + LCK',
    'NỘI - LÃO',
    'TRUYỀN NHIỄM',
    'NGOẠI',
    'ĐÔNG Y',
    'HỘ SINH',
    'S.ÂM X. QUANG',
    'ĐÁNH MÁY SA',
    'XÉT NGHIỆM',
    'LÁI XE',
    'P. THUẬT (Kèm PT)',
    'G. MÊ',
    'PHÂN LUỒNG, HD-BN TẠI PK',
    'CẢ NGÀY 1',
    'CẢ NGÀY 2',
    'CẢ NGÀY 3',
    'CẢ NGÀY 4',
    'T7 1/2, CN CẢ NGÀY',
    'PK SẢN'
  ];

  aoa.push(headerGroup1);
  aoa.push(headerGroup2);

  // Main Table Data Rows
  schedule.scheduleData.forEach((row) => {
    aoa.push([
      `${row.dayLabel} ${row.dateStr}`,
      row.leader || '',
      row.doctor1 || '',
      row.doctor9Floor || '',
      row.nurse1 || '',
      row.nhi_lck1 || '',
      row.noi_lao1 || '',
      row.truyen_nhiem || '',
      row.ngoai1 || '',
      row.dong_y1 || '',
      row.ho_sinh1 || '',
      row.sa_xquang1 || '',
      row.danh_may1 || '',
      row.xet_nghiem || '',
      row.lai_xe || '',
      row.phau_thuat || '',
      row.gay_me || '',
      row.phan_luong1 || '',
      row.pk_ca_ngay1 || '',
      row.pk_ca_ngay2 || '',
      row.pk_ca_ngay3 || '',
      row.pk_ca_ngay4 || '',
      row.pk_t7_cn || '',
      row.pk_san || ''
    ]);
  });

  aoa.push([]);

  // Secondary Table: Đi làm hộ lý các khoa (Thứ 7 & Chủ nhật)
  aoa.push(['ĐI LÀM HỘ LÝ CÁC KHOA']);
  aoa.push(['Thứ', 'Tầng 1-2', 'Tầng 3-4', 'Tầng 5-6', 'Tầng 7-8', 'PK-HSCC']);
  
  (schedule.holyData || []).forEach(h => {
    aoa.push([h.dayLabel, h.tang1_2, h.tang3_4, h.tang5_6, h.tang7_8, h.pk_hscc]);
  });

  aoa.push([]);

  // Footer notes
  aoa.push(['GHI CHÚ / QUY ĐỊNH TRỰC:']);
  (schedule.notes || []).forEach((note, idx) => {
    aoa.push([`${idx + 1}. ${note}`]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column Widths
  ws['!cols'] = [
    { wch: 10 }, // Ngày
    { wch: 12 }, // Lãnh đạo
    { wch: 20 }, // Bác sỹ
    { wch: 16 }, // BS Trực nhà 9 tầng (Vàng)
    { wch: 20 }, // ĐD CC
    { wch: 18 }, // Nhi + LCK
    { wch: 18 }, // Nội - Lão
    { wch: 16 }, // Truyền nhiễm
    { wch: 16 }, // Ngoại
    { wch: 16 }, // Đông y
    { wch: 16 }, // Hộ sinh
    { wch: 16 }, // SA XQuang
    { wch: 16 }, // Đánh máy SA
    { wch: 14 }, // Xét nghiệm
    { wch: 14 }, // Lái xe
    { wch: 20 }, // Phẫu thuật
    { wch: 14 }, // Gây mê
    { wch: 18 }, // Phân luồng PK
    { wch: 14 }, // Cả ngày 1
    { wch: 14 }, // Cả ngày 2
    { wch: 14 }, // Cả ngày 3
    { wch: 14 }, // Cả ngày 4
    { wch: 16 }, // T7 1/2 CN
    { wch: 14 }  // PK Sản
  ];

  XLSX.utils.book_append_sheet(wb, ws, `Lich_Truc_Tuan_${schedule.weekNumber}`);
  const filename = `Lich_Truc_Tuan_${schedule.weekNumber}_${schedule.year}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Parses uploaded Hospital Weekly Duty Schedule Excel File
 */
export async function parseHospitalDutyScheduleExcel(
  file: File,
  targetDate: Date = new Date()
): Promise<{
  schedule: HospitalDutySchedule;
  errors: string[];
  warnings: string[];
}> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        const weekInfo = getWeekDates(targetDate);
        let detectedWeekNum = weekInfo.weekNumber;
        let detectedYear = weekInfo.year;
        let title = `LỊCH TRỰC TUẦN ${detectedWeekNum} TỪ NGÀY ${format(weekInfo.start, 'dd/MM')} ĐẾN ${format(weekInfo.end, 'dd/MM/yyyy')}`;
        let leaderOnDuty = 'BS CKI Lê Xuân Dũng';

        // Scan first 10 rows for title, week number, and leader
        for (let r = 0; r < Math.min(10, rows.length); r++) {
          const rowStr = (rows[r] || []).join(' ');
          const weekMatch = rowStr.match(/tuần\s*(\d{1,2})/i);
          if (weekMatch) {
            detectedWeekNum = parseInt(weekMatch[1]);
          }
          const yearMatch = rowStr.match(/20\d{2}/);
          if (yearMatch) {
            detectedYear = parseInt(yearMatch[0]);
          }
          if (rowStr.toLowerCase().includes('lịch trực tuần')) {
            title = rowStr.trim();
          }
          if (rowStr.toLowerCase().includes('thường trực lãnh đạo') || rowStr.toLowerCase().includes('lãnh đạo trực')) {
            const splitLeader = rowStr.split(/:\s*/);
            if (splitLeader[1]) leaderOnDuty = splitLeader[1].trim();
          }
        }

        // Find main table header row (contains "LÃNH ĐẠO" or "BÁC SỸ" or "TRỰC NỘI VIỆN")
        let headerRowIdx = -1;
        for (let r = 0; r < Math.min(15, rows.length); r++) {
          const rowStr = normalizeText((rows[r] || []).join(' '));
          if (rowStr.includes('lanh dao') || rowStr.includes('bac sy') || rowStr.includes('truc nha 9 tang') || rowStr.includes('dieu duong')) {
            headerRowIdx = r;
            break;
          }
        }

        const parsedDays: HospitalDutyDayRow[] = [];
        const dayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
        const currentWeekDates = getWeekDates(targetDate);

        // Find data rows matching T2, T3, T4, T5, T6, T7, CN
        const startScan = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;
        let dayCounter = 0;

        for (let r = startScan; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !Array.isArray(row)) continue;

          const firstCell = String(row[0] || '').trim();
          const firstCellNorm = normalizeText(firstCell);

          // Check if this row represents one of the 7 days
          let matchedDayIdx = -1;
          if (firstCellNorm.startsWith('t2') || firstCellNorm.includes('thu 2') || firstCellNorm.includes('thu hai')) matchedDayIdx = 0;
          else if (firstCellNorm.startsWith('t3') || firstCellNorm.includes('thu 3') || firstCellNorm.includes('thu ba')) matchedDayIdx = 1;
          else if (firstCellNorm.startsWith('t4') || firstCellNorm.includes('thu 4') || firstCellNorm.includes('thu tu')) matchedDayIdx = 2;
          else if (firstCellNorm.startsWith('t5') || firstCellNorm.includes('thu 5') || firstCellNorm.includes('thu nam')) matchedDayIdx = 3;
          else if (firstCellNorm.startsWith('t6') || firstCellNorm.includes('thu 6') || firstCellNorm.includes('thu sau')) matchedDayIdx = 4;
          else if (firstCellNorm.startsWith('t7') || firstCellNorm.includes('thu 7') || firstCellNorm.includes('thu bay')) matchedDayIdx = 5;
          else if (firstCellNorm.startsWith('cn') || firstCellNorm.includes('chu nhat')) matchedDayIdx = 6;
          else if (dayCounter < 7 && firstCell.length > 0 && !firstCellNorm.includes('ghi chu') && !firstCellNorm.includes('ho ly')) {
            // Sequential fallback
            matchedDayIdx = dayCounter;
          }

          if (matchedDayIdx !== -1) {
            const dateIso = currentWeekDates.days[matchedDayIdx]?.dateStr || format(new Date(), 'yyyy-MM-dd');
            const dayLabel = dayLabels[matchedDayIdx];
            const dateStr = firstCell.replace(/[^0-9\/]/g, '').trim() || format(parseISO(dateIso), 'dd/M');

            parsedDays.push({
              dayLabel,
              dateStr,
              dateIso,
              leader: String(row[1] || '').trim(),
              doctor1: String(row[2] || '').trim(),
              doctor2: '',
              doctor9Floor: String(row[3] || '').trim(),
              nurse1: String(row[4] || '').trim(),
              nurse2: '',
              nhi_lck1: String(row[5] || '').trim(),
              nhi_lck2: '',
              noi_lao1: String(row[6] || '').trim(),
              noi_lao2: '',
              truyen_nhiem: String(row[7] || '').trim(),
              ngoai1: String(row[8] || '').trim(),
              ngoai2: '',
              dong_y1: String(row[9] || '').trim(),
              dong_y2: '',
              ho_sinh1: String(row[10] || '').trim(),
              ho_sinh2: '',
              sa_xquang1: String(row[11] || '').trim(),
              sa_xquang2: '',
              danh_may1: String(row[12] || '').trim(),
              danh_may2: '',
              xet_nghiem: String(row[13] || '').trim(),
              lai_xe: String(row[14] || '').trim(),
              phau_thuat: String(row[15] || '').trim(),
              gay_me: String(row[16] || '').trim(),
              phan_luong1: String(row[17] || '').trim(),
              phan_luong2: '',
              pk_ca_ngay1: String(row[18] || '').trim(),
              pk_ca_ngay2: String(row[19] || '').trim(),
              pk_ca_ngay3: String(row[20] || '').trim(),
              pk_ca_ngay4: String(row[21] || '').trim(),
              pk_t7_cn: String(row[22] || '').trim(),
              pk_san: String(row[23] || '').trim()
            });

            dayCounter++;
            if (dayCounter >= 7) break;
          }
        }

        // Parse Holy table (Hộ lý các khoa)
        const holyRows: HospitalHolyRow[] = [];
        let holyHeaderIdx = -1;
        for (let r = 0; r < rows.length; r++) {
          const rowStr = normalizeText((rows[r] || []).join(' '));
          if (rowStr.includes('ho ly cac khoa') || rowStr.includes('tang 1-2') || rowStr.includes('tang 3-4')) {
            holyHeaderIdx = r;
            break;
          }
        }

        if (holyHeaderIdx !== -1) {
          for (let r = holyHeaderIdx; r < Math.min(holyHeaderIdx + 5, rows.length); r++) {
            const row = rows[r];
            if (!row || !Array.isArray(row)) continue;
            const fNorm = normalizeText(String(row[0] || ''));
            if (fNorm.includes('thu 7') || fNorm.includes('t7')) {
              holyRows.push({
                dayLabel: 'Thứ 7',
                tang1_2: String(row[1] || '').trim(),
                tang3_4: String(row[2] || '').trim(),
                tang5_6: String(row[3] || '').trim(),
                tang7_8: String(row[4] || '').trim(),
                pk_hscc: String(row[5] || '').trim()
              });
            } else if (fNorm.includes('chu nhat') || fNorm.includes('cn')) {
              holyRows.push({
                dayLabel: 'Chủ nhật',
                tang1_2: String(row[1] || '').trim(),
                tang3_4: String(row[2] || '').trim(),
                tang5_6: String(row[3] || '').trim(),
                tang7_8: String(row[4] || '').trim(),
                pk_hscc: String(row[5] || '').trim()
              });
            }
          }
        }

        // Fill default 7 days if file was partial
        if (parsedDays.length < 7) {
          const defaultSched = getDefaultHospitalSchedule(targetDate);
          while (parsedDays.length < 7) {
            parsedDays.push(defaultSched.scheduleData[parsedDays.length]);
          }
        }

        const finalSchedule: HospitalDutySchedule = {
          weekNumber: detectedWeekNum,
          year: detectedYear,
          startDate: currentWeekDates.weekStartDateStr,
          endDate: currentWeekDates.weekEndDateStr,
          title,
          leaderOnDuty,
          organization: 'BỆNH VIỆN ĐA KHOA THIỆU HÓA',
          documentNo: '/LTr-BVĐKTH',
          notes: getDefaultHospitalSchedule(targetDate).notes,
          scheduleData: parsedDays,
          holyData: holyRows.length > 0 ? holyRows : getDefaultHospitalSchedule(targetDate).holyData
        };

        resolve({
          schedule: finalSchedule,
          errors: [],
          warnings: []
        });
      } catch (err: any) {
        console.error('Error parsing Hospital Excel:', err);
        resolve({
          schedule: getDefaultHospitalSchedule(targetDate),
          errors: [`Lỗi khi đọc file Excel: ${err.message}`],
          warnings: []
        });
      }
    };

    reader.onerror = () => {
      resolve({
        schedule: getDefaultHospitalSchedule(targetDate),
        errors: ['Không thể đọc tập tin tải lên.'],
        warnings: []
      });
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Exports individual duty shifts table to Excel
 */
export function exportDutyScheduleToExcel(
  shifts: DutyShift[],
  arg2?: any,
  arg3?: any,
  arg4?: any,
  arg5?: any
): void {
  const wb = XLSX.utils.book_new();
  const baseDate = typeof arg2 === 'object' && arg2 instanceof Date ? arg2 : new Date();
  const weekInfo = getWeekDates(baseDate);

  const headerRow1 = [
    'STT',
    'Mã NV',
    'Họ và tên',
    'Khoa/Phòng',
    'Chức vụ',
    ...weekInfo.days.map(d => `${d.dayName} (${format(d.date, 'dd/MM')})`)
  ];

  // Group unique users in shifts
  const uniqueUsers = Array.from(new Set(shifts.map(s => s.userName || s.userId)));
  const rows: any[][] = [];

  uniqueUsers.forEach((uname, index) => {
    const userShifts = shifts.filter(s => (s.userName || s.userId) === uname);
    const userRow: any[] = [
      index + 1,
      userShifts[0]?.userId || '',
      uname,
      userShifts[0]?.department || '',
      ''
    ];

    weekInfo.days.forEach(day => {
      const dayShifts = userShifts.filter(s => s.dateStr === day.dateStr);
      if (dayShifts.length > 0) {
        userRow.push(dayShifts.map(s => `${s.shiftName} (${s.dutyRole || 'Trực'})`).join('\n'));
      } else {
        userRow.push('');
      }
    });

    rows.push(userRow);
  });

  const aoa = [
    [`BẢNG PHÂN CÔNG LỊCH TRỰC TUẦN ${weekInfo.weekNumber}/${weekInfo.year}`],
    [`Thời gian: Từ ${format(weekInfo.start, 'dd/MM/yyyy')} đến ${format(weekInfo.end, 'dd/MM/yyyy')}`],
    [],
    headerRow1,
    ...rows
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, `Lich_Truc_Tuan_${weekInfo.weekNumber}`);
  XLSX.writeFile(wb, `Lich_Truc_Tuan_${weekInfo.weekNumber}_${weekInfo.year}.xlsx`);
}

/**
 * Generate standard individual duty schedule template
 */
export function generateDutyScheduleExcelTemplate(
  users?: UserData[],
  departments?: Department[],
  baseDate: Date = new Date()
): void {
  exportDutyScheduleToExcel([], baseDate);
}

/**
 * Parses individual shift assignment Excel file
 */
export async function parseDutyScheduleExcel(
  file: File,
  baseDate: Date = new Date(),
  existingUsers: UserData[] = []
): Promise<{
  shifts: DutyShift[];
  errors: string[];
  warnings: string[];
  weekStartDate: string;
  weekEndDate: string;
  weekNumber: number;
  year: number;
  totalParsed: number;
}> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        const weekInfo = getWeekDates(baseDate);
        const extractedShifts: DutyShift[] = [];
        const warnings: string[] = [];
        const errors: string[] = [];

        // Scan rows
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(15, rawRows.length); i++) {
          const rowStr = rawRows[i].map(c => normalizeText(String(c))).join(' ');
          if (rowStr.includes('ho va ten') || rowStr.includes('nhan vien') || rowStr.includes('thu 2') || rowStr.includes('t2')) {
            headerRowIndex = i;
            break;
          }
        }

        const startIdx = headerRowIndex !== -1 ? headerRowIndex + 1 : 1;
        for (let i = startIdx; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || row.length === 0) continue;
          
          const fullName = String(row[2] || row[1] || '').trim();
          if (!fullName || fullName.toLowerCase().includes('ghi chú') || fullName.toLowerCase().includes('tổng cộng')) continue;

          const matchedUser = existingUsers.find(u => 
            normalizeText(u.name || '') === normalizeText(fullName)
          );

          // Check days columns (usually starting from index 5)
          for (let d = 0; d < 7; d++) {
            const cellVal = String(row[5 + d] || '').trim();
            if (!cellVal || cellVal === '-' || cellVal === 'x' || cellVal === '0') continue;

            const dayObj = weekInfo.days[d];
            if (dayObj) {
              extractedShifts.push({
                dateStr: dayObj.dateStr,
                userId: matchedUser?.uid || `emp_${normalizeText(fullName).replace(/\s+/g, '_')}`,
                userName: matchedUser?.name || fullName,
                department: matchedUser?.department || String(row[3] || 'Toàn viện'),
                shiftName: cellVal.includes('Đêm') ? 'Ca Đêm' : (cellVal.includes('24') ? 'Trực 24/24' : 'Trực BV'),
                startTime: cellVal.includes('Đêm') ? '17:00' : '07:30',
                endTime: cellVal.includes('Sáng') ? '11:30' : '07:30',
                dutyRole: cellVal
              });
            }
          }
        }

        resolve({
          shifts: extractedShifts,
          errors,
          warnings,
          weekStartDate: weekInfo.weekStartDateStr,
          weekEndDate: weekInfo.weekEndDateStr,
          weekNumber: weekInfo.weekNumber,
          year: weekInfo.year,
          totalParsed: extractedShifts.length
        });
      } catch (err: any) {
        const weekInfo = getWeekDates(baseDate);
        resolve({
          shifts: [],
          errors: [`Lỗi khi phân tích file Excel: ${err.message}`],
          warnings: [],
          weekStartDate: weekInfo.weekStartDateStr,
          weekEndDate: weekInfo.weekEndDateStr,
          weekNumber: weekInfo.weekNumber,
          year: weekInfo.year,
          totalParsed: 0
        });
      }
    };

    reader.onerror = () => {
      const weekInfo = getWeekDates(baseDate);
      resolve({
        shifts: [],
        errors: ['Không thể đọc file đã chọn.'],
        warnings: [],
        weekStartDate: weekInfo.weekStartDateStr,
        weekEndDate: weekInfo.weekEndDateStr,
        weekNumber: weekInfo.weekNumber,
        year: weekInfo.year,
        totalParsed: 0
      });
    };

    reader.readAsArrayBuffer(file);
  });
}

