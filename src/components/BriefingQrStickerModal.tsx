import React, { useState, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  QrCode,
  Download,
  Printer,
  Copy,
  CheckCircle,
  Sparkles,
  Scissors,
  Building2,
  ExternalLink,
  Maximize2,
  FileImage,
} from 'lucide-react';
import { buildOfficialBriefingQrUrl, OFFICIAL_BRIEFING_QR_TOKEN } from '../lib/briefingRoster';

interface BriefingQrStickerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BriefingQrStickerModal: React.FC<BriefingQrStickerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [mode, setMode] = useState<'sticker' | 'full_poster'>('sticker');
  const [printSizeCm, setPrintSizeCm] = useState<number>(14);
  const [showCenterIcon, setShowCenterIcon] = useState<boolean>(true);
  const [showSubLabel, setShowSubLabel] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);

  const qrWrapperRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen) return null;

  const qrUrl = buildOfficialBriefingQrUrl();

  const handleCopyUrl = () => {
    try {
      navigator.clipboard.writeText(qrUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {}
  };

  // High-resolution 1200x1200 PNG generator for pasting over the old QR code
  const handleDownloadStandaloneQrPng = async () => {
    setDownloading(true);
    try {
      const sourceCanvas = qrWrapperRef.current?.querySelector('canvas');
      if (!sourceCanvas) return;

      const exportSize = 1200;
      const extraBottom = showSubLabel ? 110 : 0;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = exportSize;
      outCanvas.height = exportSize + extraBottom;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return;

      // Pure white background to completely cover the old QR code underneath
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);

      // Subtle cut border on outer edge
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 4;
      ctx.setLineDash([16, 12]);
      ctx.strokeRect(6, 6, outCanvas.width - 12, outCanvas.height - 12);
      ctx.setLineDash([]);

      // Draw crisp QR code
      const pad = 70;
      const qrDrawSize = exportSize - pad * 2;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sourceCanvas, pad, pad, qrDrawSize, qrDrawSize);

      // Draw center hospital icon if enabled (matching the hospital poster style)
      if (showCenterIcon) {
        const boxSize = 210;
        const cx = exportSize / 2 - boxSize / 2;
        const cy = exportSize / 2 - boxSize / 2;

        // White rounded square container
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.roundRect(cx - 10, cy - 10, boxSize + 20, boxSize + 20, 24);
        ctx.fill();

        // Building blocks matching poster's 3-tower hospital icon
        // Center tall orange building
        ctx.fillStyle = '#EA580C';
        ctx.fillRect(cx + 68, cy + 16, 74, 174);
        // Left blue building
        ctx.fillStyle = '#0284C7';
        ctx.fillRect(cx + 12, cy + 84, 62, 106);
        // Right red building
        ctx.fillStyle = '#DC2626';
        ctx.fillRect(cx + 136, cy + 56, 62, 134);

        // Windows on buildings
        ctx.fillStyle = '#FFFFFF';
        for (let r = 0; r < 5; r++) {
          ctx.fillRect(cx + 82, cy + 34 + r * 28, 18, 14);
          ctx.fillRect(cx + 110, cy + 34 + r * 28, 18, 14);
        }
        for (let r = 0; r < 3; r++) {
          ctx.fillRect(cx + 24, cy + 102 + r * 26, 14, 12);
          ctx.fillRect(cx + 46, cy + 102 + r * 26, 14, 12);
        }
        for (let r = 0; r < 4; r++) {
          ctx.fillRect(cx + 148, cy + 74 + r * 26, 14, 12);
          ctx.fillRect(cx + 170, cy + 74 + r * 26, 14, 12);
        }

        // Base line
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(cx + 6, cy + 190, boxSize - 12, 8);
      }

      if (showSubLabel) {
        ctx.fillStyle = '#0F172A';
        ctx.font = 'bold 38px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ĐIỂM DANH GIAO BAN • 17 KHOA/PHÒNG', exportSize / 2, exportSize + 58);
      }

      const dataUrl = outCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `Ma_QR_Dan_De_Giao_Ban_${OFFICIAL_BRIEFING_QR_TOKEN}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 z-[200] flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      {/* Dedicated Print Stylesheet so printing outputs the exact physical sticker/poster */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #briefing-qr-print-area,
          #briefing-qr-print-area * {
            visibility: visible !important;
          }
          #briefing-qr-print-area {
            position: fixed !important;
            left: 50% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            background: #ffffff !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>

      <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-5 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base uppercase tracking-tight">
                Mã QR Riêng Điểm Danh Giao Ban (Dán Đè Lên Mã Cũ)
              </h3>
              <p className="text-[11px] text-blue-100">
                Quét bằng Camera điện thoại, Zalo hoặc trong App đều tự động ghi nhận vào danh sách 99 cán bộ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-5 pt-3.5 pb-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="inline-flex rounded-xl bg-slate-200/80 p-1">
            <button
              type="button"
              onClick={() => setMode('sticker')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                mode === 'sticker'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>1. Tem QR Vuông (Cắt Dán Đè Lên Ô QR Cũ)</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('full_poster')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                mode === 'full_poster'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>2. Nguyên Bảng Hội Nghị A4 Mới</span>
            </button>
          </div>

          {mode === 'sticker' && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-bold text-slate-600">Kích thước in dán:</span>
              <select
                value={printSizeCm}
                onChange={e => setPrintSizeCm(Number(e.target.value))}
                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-bold text-slate-800 text-xs"
              >
                <option value={10}>10 x 10 cm (Nhỏ)</option>
                <option value={12}>12 x 12 cm (Vừa)</option>
                <option value={14}>14 x 14 cm (Chuẩn khung bảng cũ)</option>
                <option value={16}>16 x 16 cm (Lớn)</option>
                <option value={18}>18 x 18 cm (Rất lớn)</option>
              </select>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Instructions Banner */}
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <p className="font-black text-emerald-900">
                Hướng dẫn dán đè lên bảng "VUI LÒNG QUÉT MÃ QR ĐỂ XÁC NHẬN THAM GIA HỘI NGHỊ":
              </p>
              <p>
                • Bạn chỉ cần bấm <b>"Tải Ảnh Mã QR Riêng (PNG)"</b> hoặc <b>"In Tem QR Dán Đè"</b> bên dưới, cắt theo đường viền vuông và <b>dán đè trực tiếp lên ô mã QR cũ</b> nằm giữa 4 góc vuông màu xanh trên bảng.
              </p>
              <p>
                • Khi 99 cán bộ trong danh sách dùng <b>Camera điện thoại / Zalo</b> hoặc <b>mục Giao ban trong App</b> quét mã này, hệ thống sẽ mở thẳng bảng điểm danh Giao ban và ghi nhận ngay vào chương trình!
              </p>
            </div>
          </div>

          {/* QR Preview Area (Also used for Print) */}
          <div className="flex flex-col items-center justify-center bg-slate-100/80 rounded-2xl p-6 border border-slate-200">
            {mode === 'sticker' ? (
              <div
                id="briefing-qr-print-area"
                ref={qrWrapperRef}
                style={{
                  width: `${printSizeCm}cm`,
                  maxWidth: '310px',
                }}
                className="bg-white p-4 rounded-xl border-2 border-dashed border-slate-400 shadow-lg flex flex-col items-center justify-center relative"
              >
                <div className="relative flex items-center justify-center">
                  <QRCodeCanvas
                    value={qrUrl}
                    size={260}
                    level="H"
                    marginSize={2}
                    bgColor="#FFFFFF"
                    fgColor="#0F172A"
                  />

                  {/* Center Hospital Icon matching the physical poster */}
                  {showCenterIcon && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-14 h-14 bg-white rounded-xl p-1.5 shadow-md border border-slate-200 flex items-end justify-center gap-0.5">
                        <div className="w-3 h-7 bg-sky-600 rounded-t-xs flex flex-col justify-evenly items-center py-0.5">
                          <div className="w-1.5 h-1 bg-white/90" />
                          <div className="w-1.5 h-1 bg-white/90" />
                          <div className="w-1.5 h-1 bg-white/90" />
                        </div>
                        <div className="w-4 h-10 bg-orange-500 rounded-t-xs flex flex-col justify-evenly items-center py-0.5">
                          <div className="w-2 h-1 bg-white/90" />
                          <div className="w-2 h-1 bg-white/90" />
                          <div className="w-2 h-1 bg-white/90" />
                          <div className="w-2 h-1 bg-white/90" />
                        </div>
                        <div className="w-3 h-8 bg-red-600 rounded-t-xs flex flex-col justify-evenly items-center py-0.5">
                          <div className="w-1.5 h-1 bg-white/90" />
                          <div className="w-1.5 h-1 bg-white/90" />
                          <div className="w-1.5 h-1 bg-white/90" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {showSubLabel && (
                  <p className="mt-2 text-[11px] font-black text-slate-900 uppercase tracking-wider text-center">
                    ĐIỂM DANH GIAO BAN • 17 KHOA/PHÒNG
                  </p>
                )}
              </div>
            ) : (
              /* Full Recreated Hospital Poster A4 */
              <div
                id="briefing-qr-print-area"
                ref={qrWrapperRef}
                className="bg-[#0284C7] p-4 sm:p-6 rounded-2xl shadow-xl max-w-md w-full"
              >
                <div className="bg-white rounded-2xl p-6 flex flex-col items-center text-center border-2 border-sky-900/20">
                  <div className="w-16 h-16 rounded-full border-4 border-sky-700 flex items-center justify-center mb-3 bg-sky-50">
                    <Building2 className="w-8 h-8 text-red-600" />
                  </div>
                  <p className="text-[10px] font-black text-sky-800 uppercase tracking-widest mb-2">
                    BỆNH VIỆN ĐA KHOA THIỆU HÓA
                  </p>
                  <h2 className="text-lg sm:text-xl font-black text-[#1E3A8A] uppercase leading-snug mb-6">
                    VUI LÒNG QUÉT MÃ
                    <br />
                    QR ĐỂ XÁC NHẬN
                    <br />
                    THAM GIA HỘI NGHỊ
                  </h2>

                  {/* 4 Blue Corner Brackets + QR Code */}
                  <div className="relative p-6 flex items-center justify-center">
                    {/* Top-Left Corner */}
                    <div className="absolute top-0 left-0 w-14 h-14 border-t-[6px] border-l-[6px] border-[#1E3A8A] rounded-tl-3xl" />
                    {/* Top-Right Corner */}
                    <div className="absolute top-0 right-0 w-14 h-14 border-t-[6px] border-r-[6px] border-[#1E3A8A] rounded-tr-3xl" />
                    {/* Bottom-Left Corner */}
                    <div className="absolute bottom-0 left-0 w-14 h-14 border-b-[6px] border-l-[6px] border-[#1E3A8A] rounded-bl-3xl" />
                    {/* Bottom-Right Corner */}
                    <div className="absolute bottom-0 right-0 w-14 h-14 border-b-[6px] border-r-[6px] border-[#1E3A8A] rounded-br-3xl" />

                    <div className="relative flex items-center justify-center bg-white p-2">
                      <QRCodeCanvas
                        value={qrUrl}
                        size={220}
                        level="H"
                        marginSize={1}
                        bgColor="#FFFFFF"
                        fgColor="#0F172A"
                      />
                      {showCenterIcon && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-12 h-12 bg-white rounded-lg p-1 shadow-sm border border-slate-200 flex items-end justify-center gap-0.5">
                            <div className="w-2.5 h-6 bg-sky-600 rounded-t-xs" />
                            <div className="w-3.5 h-8 bg-orange-500 rounded-t-xs" />
                            <div className="w-2.5 h-7 bg-red-600 rounded-t-xs" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="mt-4 text-[11px] font-bold text-slate-500">
                    Hệ thống Điểm danh Giao ban Điện tử • 17 Khoa/Phòng
                  </p>
                </div>
              </div>
            )}

            {/* Options checkboxes */}
            <div className="flex flex-wrap items-center justify-center gap-4 mt-4 text-xs">
              <label className="inline-flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCenterIcon}
                  onChange={e => setShowCenterIcon(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Có biểu tượng Tòa nhà Bệnh viện ở tâm QR (giống mẫu cũ)</span>
              </label>

              {mode === 'sticker' && (
                <label className="inline-flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showSubLabel}
                    onChange={e => setShowSubLabel(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Kèm dòng chữ nhỏ dưới đáy tem QR</span>
                </label>
              )}
            </div>
          </div>

          {/* Encoded Link Info */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-700">Đường dẫn tích hợp trong Mã QR mới:</p>
              <p className="font-mono text-[11px] text-blue-700 truncate">{qrUrl}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {copied ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Đã sao chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Sao chép Link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleDownloadStandaloneQrPng}
            disabled={downloading}
            className="flex-1 min-w-[200px] py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>
              {downloading
                ? 'Đang tạo ảnh nét cao...'
                : 'Tải Ảnh Mã QR Riêng (PNG Nét Cao Để Dán Đè)'}
            </span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 min-w-[180px] py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>
              {mode === 'sticker'
                ? `In Ngay Tem QR (${printSizeCm}x${printSizeCm}cm)`
                : 'In Bảng Poster A4'}
            </span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="py-3 px-5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs sm:text-sm cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
