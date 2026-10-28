import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
} from 'docx';
import {
  BriefingRosterItem,
  DEFAULT_BRIEFING_ROSTER,
  BRIEFING_DEPARTMENTS_ORDER,
} from './briefingRoster';

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  stroke?: string,
  lineWidth = 2
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawMiniQrPattern(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  drawRoundedRect(ctx, x, y, size, size, 8, '#ffffff', '#1e293b', 3);
  const pad = 10;
  const inner = size - pad * 2;
  const cell = inner / 7;

  const drawFinder = (fx: number, fy: number) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(fx, fy, cell * 2.4, cell * 2.4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(fx + cell * 0.4, fy + cell * 0.4, cell * 1.6, cell * 1.6);
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(fx + cell * 0.8, fy + cell * 0.8, cell * 0.8, cell * 0.8);
  };

  drawFinder(x + pad, y + pad);
  drawFinder(x + pad + inner - cell * 2.4, y + pad);
  drawFinder(x + pad, y + pad + inner - cell * 2.4);

  ctx.fillStyle = '#0f172a';
  const dots = [
    [3, 1], [3, 2], [4, 3], [2, 3], [3, 4], [5, 4], [4, 5], [5, 5], [3, 6], [6, 3],
  ];
  dots.forEach(([gx, gy]) => {
    ctx.fillRect(x + pad + gx * cell * 0.85, y + pad + gy * cell * 0.85, cell * 0.7, cell * 0.7);
  });
}

/**
 * Hình 1: Minh họa Cách 1 - Quét QR bằng Camera / Zalo & Chọn tên khóa máy lần đầu
 */
function renderIllustrationMethod1(): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 460;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawRoundedRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 16, '#f8fafc', '#cbd5e1', 2);

  // Title banner
  drawRoundedRect(ctx, 24, 20, 912, 46, 10, '#1e40af');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MINH HỌA CÁCH 1: QUÉT MÃ QR BẰNG CAMERA ĐIỆN THOẠI HOẶC ZALO', 480, 49);

  // Step 1 Card: Poster QR
  drawRoundedRect(ctx, 30, 84, 270, 346, 14, '#ffffff', '#93c5fd', 2);
  drawRoundedRect(ctx, 46, 100, 238, 34, 8, '#dbeafe');
  ctx.fillStyle = '#1e3a8a';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText('BƯỚC 1: Mở Camera / Zalo', 165, 122);

  ctx.fillStyle = '#475569';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillText('Hướng camera vào mã QR dán', 165, 152);
  ctx.fillText('trên Bảng Hội Nghị Giao Ban', 165, 170);

  drawMiniQrPattern(ctx, 95, 188, 140);

  // Scan brackets
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 4;
  ctx.strokeRect(85, 178, 160, 160);

  drawRoundedRect(ctx, 52, 360, 226, 48, 8, '#ecfdf5', '#10b981', 1.5);
  ctx.fillStyle = '#065f46';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText('Nhấn vào thông báo đường link', 165, 381);
  ctx.fillText('hiển thị trên màn hình', 165, 400);

  // Arrow 1 -> 2
  ctx.fillStyle = '#2563eb';
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.fillText('➔', 318, 255);

  // Step 2 Card: First time select name & lock
  drawRoundedRect(ctx, 345, 84, 270, 346, 14, '#ffffff', '#93c5fd', 2);
  drawRoundedRect(ctx, 361, 100, 238, 34, 8, '#dbeafe');
  ctx.fillStyle = '#1e3a8a';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText('BƯỚC 2: Chọn Tên (Lần đầu)', 480, 122);

  // Phone screen mockup inside Step 2
  drawRoundedRect(ctx, 370, 148, 220, 262, 16, '#f1f5f9', '#64748b', 2);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText('XÁC THỰC CÁN BỘ GIAO BAN', 480, 174);

  // Dropdown 1: Khoa/Phòng
  ctx.textAlign = 'left';
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.fillText('1. Chọn Khoa / Phòng:', 384, 198);
  drawRoundedRect(ctx, 384, 204, 192, 30, 6, '#ffffff', '#94a3b8', 1.5);
  ctx.fillStyle = '#0f172a';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('Khoa Nội Tổng Hợp          ▼', 392, 224);

  // Dropdown 2: Họ tên
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.fillText('2. Chọn Họ và Tên cán bộ:', 384, 254);
  drawRoundedRect(ctx, 384, 260, 192, 30, 6, '#ffffff', '#2563eb', 1.5);
  ctx.fillStyle = '#1d4ed8';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.fillText('Nguyễn Văn A                ▼', 392, 280);

  // Confirm Lock Button
  drawRoundedRect(ctx, 384, 306, 192, 38, 8, '#2563eb');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.fillText('XÁC NHẬN & KHÓA VÀO MÁY', 480, 329);

  ctx.fillStyle = '#64748b';
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText('* Chỉ cần chọn 1 lần duy nhất', 480, 368);
  ctx.fillText('cho các buổi giao ban sau', 480, 384);

  // Arrow 2 -> 3
  ctx.fillStyle = '#2563eb';
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.fillText('➔', 633, 255);

  // Step 3 Card: Auto Check-in Success
  drawRoundedRect(ctx, 660, 84, 270, 346, 14, '#ffffff', '#86efac', 2);
  drawRoundedRect(ctx, 676, 100, 238, 34, 8, '#dcfce7');
  ctx.fillStyle = '#065f46';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText('BƯỚC 3: Ghi nhận Có mặt', 795, 122);

  drawRoundedRect(ctx, 685, 148, 220, 262, 16, '#f0fdf4', '#16a34a', 2);

  // Green check circle
  ctx.beginPath();
  ctx.arc(795, 200, 28, 0, Math.PI * 2);
  ctx.fillStyle = '#16a34a';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.fillText('✓', 795, 210);

  ctx.fillStyle = '#065f46';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText('ĐIỂM DANH THÀNH CÔNG!', 795, 250);

  drawRoundedRect(ctx, 700, 264, 190, 74, 8, '#ffffff', '#bbf7d0', 1.5);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText('Cán bộ: Nguyễn Văn A', 795, 286);
  ctx.fillStyle = '#475569';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('Khoa Nội Tổng Hợp', 795, 306);
  ctx.fillStyle = '#16a34a';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.fillText('Giờ quét: 07:12 - Có mặt', 795, 326);

  ctx.fillStyle = '#334155';
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText('Từ lần sau: Quét QR sẽ tự động', 795, 366);
  ctx.fillText('điểm danh ngay lập tức!', 795, 384);

  return dataUrlToUint8Array(canvas.toDataURL('image/png'));
}

/**
 * Hình 2: Minh họa Cách 2 - Điểm danh trực tiếp trong ứng dụng (Tab Giao ban)
 */
function renderIllustrationMethod2(): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 450;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawRoundedRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 16, '#f8fafc', '#cbd5e1', 2);

  // Header
  drawRoundedRect(ctx, 24, 20, 912, 46, 10, '#4f46e5');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MINH HỌA CÁCH 2: QUÉT QR TRỰC TIẾP TẠI TAB "GIAO BAN" TRONG ỨNG DỤNG', 480, 49);

  // Left Phone: Bottom nav selecting Giao ban
  drawRoundedRect(ctx, 40, 82, 260, 340, 18, '#ffffff', '#94a3b8', 2);
  ctx.fillStyle = '#1e1b4b';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText('1. Chọn mục "Giao ban"', 170, 110);

  drawRoundedRect(ctx, 60, 124, 220, 210, 10, '#f1f5f9', '#cbd5e1', 1.5);
  ctx.fillStyle = '#64748b';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('Màn hình chính của ứng dụng', 170, 155);
  ctx.fillText('Chấm công Bệnh viện Đa khoa', 170, 175);
  ctx.fillText('Thiệu Hóa', 170, 195);

  // Bottom bar inside Left Phone
  drawRoundedRect(ctx, 60, 344, 220, 56, 10, '#ffffff', '#cbd5e1', 1.5);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText('Chấm công', 95, 382);
  ctx.fillText('Lịch sử', 155, 382);

  // Highlighted Giao ban tab
  drawRoundedRect(ctx, 192, 348, 82, 48, 8, '#eef2ff', '#4f46e5', 2);
  ctx.fillStyle = '#4f46e5';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.fillText('QR Giao ban', 233, 378);

  // Arrow
  ctx.fillStyle = '#4f46e5';
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.fillText('➔', 322, 250);

  // Middle Phone: Locked staff profile + Open Camera button
  drawRoundedRect(ctx, 350, 82, 260, 340, 18, '#ffffff', '#818cf8', 2);
  ctx.fillStyle = '#1e1b4b';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText('2. Bấm nút Bật Camera', 480, 110);

  // Locked badge card
  drawRoundedRect(ctx, 368, 126, 224, 70, 10, '#eef2ff', '#a5b4fc', 1.5);
  ctx.fillStyle = '#312e81';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText('🔒 Đã khóa: Nguyễn Văn A', 480, 150);
  ctx.fillStyle = '#4338ca';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('Khoa Nội Tổng Hợp (STT #12)', 480, 172);

  // Big Camera Button
  drawRoundedRect(ctx, 368, 212, 224, 56, 12, '#4f46e5');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText('📷 BẬT CAMERA QUÉT QR', 480, 245);

  // History list below
  drawRoundedRect(ctx, 368, 284, 224, 120, 10, '#f8fafc', '#e2e8f0', 1.5);
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.fillText('Lịch sử điểm danh theo tháng:', 480, 306);
  ctx.fillStyle = '#16a34a';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('• 26/10: 07:12 - Có mặt ✓', 480, 332);
  ctx.fillText('• 25/10: 07:10 - Có mặt ✓', 480, 354);
  ctx.fillText('• 24/10: 07:14 - Có mặt ✓', 480, 376);

  // Arrow
  ctx.fillStyle = '#4f46e5';
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.fillText('➔', 632, 250);

  // Right Phone: Camera scanning QR
  drawRoundedRect(ctx, 660, 82, 260, 340, 18, '#ffffff', '#10b981', 2);
  ctx.fillStyle = '#065f46';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText('3. Hướng vào Mã QR Giao ban', 790, 110);

  drawRoundedRect(ctx, 680, 128, 220, 200, 12, '#0f172a');
  drawMiniQrPattern(ctx, 730, 168, 120);
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 3;
  ctx.strokeRect(720, 158, 140, 140);

  drawRoundedRect(ctx, 680, 342, 220, 62, 10, '#ecfdf5', '#10b981', 1.5);
  ctx.fillStyle = '#065f46';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.fillText('Hệ thống tự động nhận diện mã', 790, 366);
  ctx.fillText('và báo Điểm danh thành công!', 790, 386);

  return dataUrlToUint8Array(canvas.toDataURL('image/png'));
}

/**
 * Hình 3: Minh họa Quy định khóa 1 Thiết bị - 1 Cán bộ, Cảnh báo Không phận sự & Mở khóa Admin
 */
function renderIllustrationSecurityAndUnlock(): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 420;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawRoundedRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 16, '#f8fafc', '#cbd5e1', 2);

  // Header
  drawRoundedRect(ctx, 24, 20, 912, 46, 10, '#0f172a');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 19px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CƠ CHẾ KHÓA "1 THIẾT BỊ - 1 CÁN BỘ" & QUYỀN MỞ KHÓA CỦA ADMIN', 480, 49);

  // Box 1: 1 Device - 1 Staff Lock
  drawRoundedRect(ctx, 30, 84, 285, 310, 14, '#ffffff', '#93c5fd', 2);
  drawRoundedRect(ctx, 46, 100, 253, 36, 8, '#eff6ff');
  ctx.fillStyle = '#1d4ed8';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText('🔒 KHÓA CỐ ĐỊNH VÀO ĐIỆN THOẠI', 172, 123);

  ctx.fillStyle = '#334155';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillText('• Sau khi chọn tên và xác nhận,', 172, 162);
  ctx.fillText('hệ thống khóa chặt tên cán bộ', 172, 182);
  ctx.fillText('vào trình duyệt trên điện thoại.', 172, 202);
  ctx.fillText('• Cán bộ KHÔNG THỂ tự đổi sang', 172, 232);
  ctx.fillText('tên người khác để điểm danh hộ.', 172, 252);

  drawRoundedRect(ctx, 48, 280, 249, 92, 10, '#f0fdf4', '#86efac', 1.5);
  ctx.fillStyle = '#15803d';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText('Lợi ích cho Cán bộ:', 172, 305);
  ctx.fillStyle = '#166534';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('Các buổi sáng tiếp theo chỉ cần', 172, 328);
  ctx.fillText('quét QR 1 chạm là xong (2 giây).', 172, 348);

  // Box 2: Unauthorized Warning
  drawRoundedRect(ctx, 338, 84, 285, 310, 14, '#ffffff', '#fca5a5', 2);
  drawRoundedRect(ctx, 354, 100, 253, 36, 8, '#fef2f2');
  ctx.fillStyle = '#b91c1c';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText('⛔ CẢNH BÁO "KHÔNG PHẬN SỰ"', 480, 123);

  drawRoundedRect(ctx, 366, 152, 228, 135, 10, '#fff1f2', '#f87171', 1.5);
  ctx.fillStyle = '#dc2626';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillText('⚠️', 480, 185);
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText('KHÔNG PHẬN SỰ MIỄN VÀO!', 480, 212);
  ctx.fillStyle = '#7f1d1d';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('Chỉ 99 cán bộ trong danh sách', 480, 236);
  ctx.fillText('Giao ban mới được phép truy cập', 480, 254);
  ctx.fillText('và xem lịch sử điểm danh.', 480, 272);

  ctx.fillStyle = '#475569';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('Người ngoài danh sách bấm nút', 480, 318);
  ctx.fillText('"Tôi không có trong danh sách"', 480, 338);
  ctx.fillText('sẽ bị chặn xem dữ liệu ngay lập tức.', 480, 358);

  // Box 3: Admin Unlock Device
  drawRoundedRect(ctx, 645, 84, 285, 310, 14, '#ffffff', '#fcd34d', 2);
  drawRoundedRect(ctx, 661, 100, 253, 36, 8, '#fffbeb');
  ctx.fillStyle = '#b45309';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText('🔓 ADMIN MỞ KHÓA THIẾT BỊ', 787, 123);

  ctx.fillStyle = '#334155';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillText('Khi cán bộ đổi điện thoại mới', 787, 162);
  ctx.fillText('hoặc lỡ chọn nhầm tên lần đầu:', 787, 182);

  drawRoundedRect(ctx, 665, 202, 244, 96, 10, '#fffbeb', '#f59e0b', 1.5);
  ctx.fillStyle = '#92400e';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.fillText('Tại trang Quản lý Giao ban (Admin):', 787, 226);
  drawRoundedRect(ctx, 685, 240, 204, 38, 8, '#f59e0b');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.fillText('🔓 Mở khóa thiết bị (Chọn lại tên)', 787, 264);

  ctx.fillStyle = '#475569';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('Sau khi Admin bấm mở khóa,', 787, 326);
  ctx.fillText('điện thoại của cán bộ sẽ cho phép', 787, 346);
  ctx.fillText('chọn lại Họ tên ngay lập tức.', 787, 366);

  return dataUrlToUint8Array(canvas.toDataURL('image/png'));
}

function createSectionTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 320, after: 160 },
    shading: {
      type: ShadingType.CLEAR,
      fill: '1E3A8A',
    },
    children: [
      new TextRun({
        text: `  ${text}`,
        bold: true,
        size: 26,
        color: 'FFFFFF',
        font: 'Arial',
      }),
    ],
  });
}

function createBullet(boldPrefix: string, content: string): Paragraph {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    indent: { left: 360 },
    children: [
      new TextRun({
        text: '• ',
        bold: true,
        size: 22,
        color: '1E40AF',
        font: 'Arial',
      }),
      new TextRun({
        text: boldPrefix,
        bold: true,
        size: 22,
        color: '0F172A',
        font: 'Arial',
      }),
      new TextRun({
        text: content,
        size: 22,
        color: '334155',
        font: 'Arial',
      }),
    ],
  });
}

export async function downloadBriefingWordGuide(
  customRoster?: BriefingRosterItem[]
): Promise<void> {
  const roster = customRoster && customRoster.length > 0 ? customRoster : DEFAULT_BRIEFING_ROSTER;

  const imgMethod1 = renderIllustrationMethod1();
  const imgMethod2 = renderIllustrationMethod2();
  const imgSecurity = renderIllustrationSecurityAndUnlock();

  // Summarize departments for appendix table
  const deptSummaryRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: 10, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: '1E40AF' },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'STT', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 45, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: '1E40AF' },
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Khoa / Phòng / Bộ phận', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: '1E40AF' },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'Số lượng', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: '1E40AF' },
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Ghi chú đối tượng', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })],
            }),
          ],
        }),
      ],
    }),
  ];

  BRIEFING_DEPARTMENTS_ORDER.forEach((dept, idx) => {
    const members = roster.filter((r) => r.department === dept);
    const fill = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    deptSummaryRows.push(
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: String(idx + 1), size: 20, font: 'Arial' })],
              }),
            ],
          }),
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill },
            children: [
              new Paragraph({
                children: [new TextRun({ text: dept, bold: true, size: 20, font: 'Arial', color: '0F172A' })],
              }),
            ],
          }),
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `${members.length} cán bộ`, bold: true, size: 20, font: 'Arial', color: '1D4ED8' })],
              }),
            ],
          }),
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: idx === 0 ? 'Ban Giám Đốc Bệnh viện' : 'Lãnh đạo Khoa/Phòng, Điều dưỡng trưởng, Bác sĩ',
                    size: 19,
                    font: 'Arial',
                    color: '475569',
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Hospital Header Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              bottom: { style: BorderStyle.SINGLE, size: 8, color: '1E40AF' },
              left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 48, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({
                            text: 'BỆNH VIỆN ĐA KHOA THIỆU HÓA',
                            bold: true,
                            size: 22,
                            color: '1E3A8A',
                            font: 'Arial',
                          }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 120 },
                        children: [
                          new TextRun({
                            text: 'HỆ THỐNG ĐIỂM DANH GIAO BAN ĐIỆN TỬ',
                            bold: true,
                            size: 18,
                            color: '475569',
                            font: 'Arial',
                          }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 52, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({
                            text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
                            bold: true,
                            size: 20,
                            color: '0F172A',
                            font: 'Arial',
                          }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 120 },
                        children: [
                          new TextRun({
                            text: 'Độc lập - Tự do - Hạnh phúc',
                            bold: true,
                            size: 20,
                            color: '0F172A',
                            font: 'Arial',
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          // Main Document Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 300, after: 100 },
            children: [
              new TextRun({
                text: 'TÀI LIỆU HƯỚNG DẪN SỬ DỤNG',
                bold: true,
                size: 32,
                color: '1E3A8A',
                font: 'Arial',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: 'QUÉT MÃ QR ĐIỂM DANH GIAO BAN HÀNG NGÀY TRÊN ĐIỆN THOẠI',
                bold: true,
                size: 26,
                color: '2563EB',
                font: 'Arial',
              }),
            ],
          }),

          // Section 1: Overview
          createSectionTitle('I. GIỚI THIỆU CHUNG & ĐỐI TƯỢNG ÁP DỤNG'),
          createBullet(
            '1. Mục đích: ',
            'Chuẩn hóa và tự động hóa công tác điểm danh hội nghị giao ban hàng ngày tại Bệnh viện Đa khoa Thiệu Hóa bằng mã QR, thay thế hình thức ký sổ thủ công.'
          ),
          createBullet(
            '2. Đối tượng áp dụng: ',
            `Áp dụng riêng cho danh sách ${roster.length} cán bộ chủ chốt thuộc ${BRIEFING_DEPARTMENTS_ORDER.length} Khoa/Phòng/Ban Giám Đốc tham dự giao ban.`
          ),
          createBullet(
            '3. Độc lập hoàn toàn với chấm công GPS hàng ngày: ',
            'Hệ thống điểm danh Giao ban hoạt động độc lập, KHÔNG làm ảnh hưởng đến dữ liệu chấm công vào/ra ca hàng ngày của cán bộ nhân viên.'
          ),
          createBullet(
            '4. Giao diện tối giản trên điện thoại: ',
            'Khi cán bộ quét mã QR Giao ban trên điện thoại, màn hình chỉ hiển thị thông tin cá nhân của người điểm danh và lịch sử điểm danh theo ngày/tháng. Người ngoài danh sách sẽ nhận cảnh báo "Không phận sự" và không được phép xem.'
          ),

          // Section 2: Method 1 (Camera / Zalo)
          createSectionTitle('II. CÁCH 1: QUÉT MÃ QR TRỰC TIẾP BẰNG CAMERA ĐIỆN THOẠI HOẶC ZALO'),
          new Paragraph({
            spacing: { before: 80, after: 120 },
            children: [
              new TextRun({
                text: 'Đây là cách nhanh nhất khi cán bộ bước vào phòng họp giao ban và nhìn thấy Mã QR Điểm Danh Giao Ban dán trên Bảng Hội Nghị:',
                size: 22,
                color: '1E293B',
                font: 'Arial',
              }),
            ],
          }),
          createBullet(
            'Bước 1 - Mở Camera hoặc Zalo: ',
            'Mở ứng dụng Camera mặc định trên điện thoại (iPhone / Android) hoặc tính năng Quét mã QR trên ứng dụng Zalo, hướng camera vào mã QR dán trên Bảng Hội Nghị Giao Ban và nhấn vào thông báo đường link hiện ra.'
          ),
          createBullet(
            'Bước 2 - Chọn Họ tên và Khóa vào máy (Chỉ thực hiện 1 lần duy nhất ở lần đầu tiên): ',
            'Trong lần đầu tiên quét mã, màn hình điện thoại hiển thị danh sách xổ xuống. Cán bộ chọn đúng Họ và Tên của mình trong danh sách rồi bấm nút "Xác nhận & Khóa vào thiết bị".'
          ),
          createBullet(
            'Bước 3 - Tự động ghi nhận điểm danh: ',
            'Ngay sau khi xác nhận (và trong tất cả các buổi giao ban những ngày tiếp theo), hệ thống tự động ghi nhận "CÓ MẶT" kèm giờ quét chính xác và hiển thị lịch sử điểm danh theo ngày, tháng ngay bên dưới.'
          ),

          // Illustration 1
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 180, after: 80 },
            children: [
              new ImageRun({
                data: imgMethod1,
                transformation: { width: 580, height: 278 },
                type: 'png',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 220 },
            children: [
              new TextRun({
                text: 'Hình 1: Quy trình 3 bước quét mã QR Giao ban bằng Camera điện thoại hoặc Zalo',
                italics: true,
                size: 19,
                color: '475569',
                font: 'Arial',
              }),
            ],
          }),

          // Section 3: Method 2 (Inside App)
          createSectionTitle('III. CÁCH 2: ĐIỂM DANH TRỰC TIẾP TẠI TAB "GIAO BAN" TRONG ỨNG DỤNG'),
          new Paragraph({
            spacing: { before: 80, after: 120 },
            children: [
              new TextRun({
                text: 'Trường hợp cán bộ đang mở sẵn ứng dụng Chấm công Bệnh viện trên điện thoại, có thể quét mã ngay trong ứng dụng mà không cần thoát ra ngoài:',
                size: 22,
                color: '1E293B',
                font: 'Arial',
              }),
            ],
          }),
          createBullet(
            'Bước 1 - Mở tab "Giao ban": ',
            'Trên thanh menu dưới cùng của màn hình điện thoại, bấm vào mục "Giao ban" (biểu tượng mã QR).'
          ),
          createBullet(
            'Bước 2 - Xác thực tên hoặc Bật Camera: ',
            'Nếu là lần đầu tiên, chọn Họ và Tên từ danh sách xổ xuống để khóa vào máy. Nếu máy đã khóa tên từ trước, màn hình sẽ hiện sẵn tên cán bộ và nút "Bật Camera điểm danh Giao ban".'
          ),
          createBullet(
            'Bước 3 - Hướng khung Camera vào mã QR: ',
            'Bấm nút "Bật Camera điểm danh Giao ban", cho phép quyền máy ảnh (nếu được hỏi) và hướng khung quét vào mã QR trên Bảng Hội Nghị. Hệ thống lập tức báo điểm danh thành công và cập nhật vào bảng lịch sử cá nhân bên dưới.'
          ),

          // Illustration 2
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 180, after: 80 },
            children: [
              new ImageRun({
                data: imgMethod2,
                transformation: { width: 580, height: 272 },
                type: 'png',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 220 },
            children: [
              new TextRun({
                text: 'Hình 2: Thao tác vào tab "Giao ban" trong ứng dụng và bật Camera quét mã trực tiếp',
                italics: true,
                size: 19,
                color: '475569',
                font: 'Arial',
              }),
            ],
          }),

          // Section 4: Security Lock & Admin Unlock
          createSectionTitle('IV. QUY ĐỊNH KHÓA "1 THIẾT BỊ - 1 CÁN BỘ" & CÁCH MỞ KHÓA KHI ĐỔI MÁY'),
          createBullet(
            '1. Quy định khóa 1 Thiết bị - 1 Cán bộ: ',
            'Sau khi cán bộ chọn tên và bấm xác nhận lần đầu, thiết bị điện thoại sẽ được khóa cố định với tên cán bộ đó. Các buổi giao ban tiếp theo không cần chọn lại tên và cũng không thể đổi sang tên người khác để điểm danh hộ.'
          ),
          createBullet(
            '2. Chặn người ngoài danh sách ("Không phận sự"): ',
            'Nếu người quét không thuộc danh sách 99 cán bộ giao ban, hệ thống hiển thị màn hình cảnh báo "Không phận sự miễn vào" và ẩn toàn bộ thông tin hội nghị.'
          ),
          createBullet(
            '3. Cách yêu cầu Admin mở khóa thiết bị (Khi đổi điện thoại hoặc chọn nhầm tên): ',
            'Cán bộ liên hệ Quản trị viên (Admin). Tại trang Quản lý Giao ban trên máy tính, Admin tìm tên cán bộ và bấm biểu tượng chiếc khóa màu vàng ("Mở khóa thiết bị") hoặc nút "Mở khóa tất cả TB". Ngay lập tức, điện thoại của cán bộ sẽ được phép chọn lại Họ tên mới.'
          ),

          // Illustration 3
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 180, after: 80 },
            children: [
              new ImageRun({
                data: imgSecurity,
                transformation: { width: 580, height: 254 },
                type: 'png',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 220 },
            children: [
              new TextRun({
                text: 'Hình 3: Cơ chế khóa cố định thiết bị, màn hình chặn "Không phận sự" và quyền mở khóa của Admin',
                italics: true,
                size: 19,
                color: '475569',
                font: 'Arial',
              }),
            ],
          }),

          // Section 5: Troubleshooting
          createSectionTitle('V. XỬ LÝ CÁC TÌNH HUỐNG THƯỜNG GẶP'),
          createBullet(
            'Tình huống 1 - Điện thoại hỏi quyền truy cập Camera: ',
            'Khi bấm nút "Bật Camera điểm danh Giao ban", nếu trình duyệt Safari (iPhone) hoặc Chrome (Android) hiện hộp thoại hỏi quyền sử dụng máy ảnh, hãy bấm "Cho phép" (Allow).'
          ),
          createBullet(
            'Tình huống 2 - Lỡ chọn nhầm tên đồng nghiệp ở lần đầu tiên: ',
            'Tuyệt đối không dùng tên đồng nghiệp để quét tiếp. Hãy báo ngay cho Admin phụ trách Giao ban bấm nút "Mở khóa thiết bị" cạnh tên vừa chọn nhầm để chọn lại tên chính xác của mình.'
          ),
          createBullet(
            'Tình huống 3 - Kiểm tra đã điểm danh thành công hay chưa: ',
            'Ngay bên dưới nút bật Camera trên điện thoại là mục "Lịch sử điểm danh theo ngày, tháng". Nếu ngày hôm nay hiển thị trạng thái "Đã điểm danh" màu xanh lá kèm giờ quét nghĩa là dữ liệu đã được lưu lên hệ thống.'
          ),

          // Section 6: Appendix Roster Summary
          createSectionTitle(`VI. PHỤ LỤC: TỔNG HỢP ${BRIEFING_DEPARTMENTS_ORDER.length} KHOA/PHÒNG THAM DỰ GIAO BAN (${roster.length} CÁN BỘ)`),
          new Paragraph({
            spacing: { before: 80, after: 120 },
            children: [
              new TextRun({
                text: 'Bảng tổng hợp số lượng cán bộ thuộc danh sách điểm danh Giao ban theo từng Khoa/Phòng:',
                size: 21,
                color: '334155',
                font: 'Arial',
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: deptSummaryRows,
          }),

          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 360, after: 120 },
            children: [
              new TextRun({
                text: 'Bệnh viện Đa khoa Thiệu Hóa — Tài liệu Hướng dẫn Điểm danh Giao ban Điện tử',
                italics: true,
                size: 18,
                color: '64748B',
                font: 'Arial',
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Huong_Dan_Diem_Danh_Giao_Ban_Benh_Vien.docx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
