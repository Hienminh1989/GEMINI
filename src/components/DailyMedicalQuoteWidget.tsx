import React, { useState, useEffect } from 'react';
import { 
  HeartHandshake, Sparkles, CheckSquare, Square, ShieldCheck, 
  Smile, Award, ChevronDown, ChevronUp, Stethoscope 
} from 'lucide-react';
import { format } from 'date-fns';

const MEDICAL_QUOTES = [
  {
    quote: "Lương y phải như từ mẫu — Thầy thuốc giỏi cốt ở tấm lòng nhân ái, coi nỗi đau của người bệnh như nỗi đau của chính mình.",
    author: "Lời dạy của Chủ tịch Hồ Chí Minh (1955)",
    tag: "Y đức nghề nghiệp"
  },
  {
    quote: "Đạo làm thuốc là một nhân thuật chuyên lo tính mạng con người, phải lo cái lo của người, vui cái vui của người.",
    author: "Đại danh y Hải Thượng Lãn Ông - Lê Hữu Trác",
    tag: "Tôn chỉ ngành Y"
  },
  {
    quote: "An toàn người bệnh là ưu tiên số một. Mỗi quy trình, thao tác chuẩn mực đều là lá chắn bảo vệ sự sống.",
    author: "Bộ Tiêu chí Chất lượng Bệnh viện",
    tag: "An toàn người bệnh"
  },
  {
    quote: "Nụ cười và sự lắng nghe của nhân viên y tế chính là liều thuốc xoa dịu tinh thần quý giá nhất cho người bệnh.",
    author: "Quy tắc Giao tiếp & Ứng xử Y tế",
    tag: "Giao tiếp y tế"
  },
  {
    quote: "Thực hiện tốt 5S (Sàng lọc - Sắp xếp - Sạch sẽ - Săn sóc - Sẵn sàng) vì một môi trường bệnh viện xanh, sạch, an toàn.",
    author: "Phong trào 5S Y tế",
    tag: "Văn hóa 5S"
  },
  {
    quote: "Rửa tay sạch khuẩn đúng 6 bước trước và sau mỗi ca thăm khám là hành động nhỏ mang lại an toàn lớn.",
    author: "Quy trình Kiểm soát Nhiễm khuẩn",
    tag: "Vệ sinh dịch tễ"
  },
  {
    quote: "Y học là nghệ thuật, đòi hỏi sự kiên nhẫn, lòng trắc ẩn và tinh thần học hỏi không ngừng nghỉ.",
    author: "Thông điệp Ngày Thầy thuốc Việt Nam",
    tag: "Tinh thần cống hiến"
  }
];

const DEFAULT_SAFETY_ITEMS = [
  { id: 'apparel', label: 'Trang phục y tế, thẻ nhân viên & bảng tên chỉnh tề' },
  { id: 'hygiene', label: 'Vệ sinh tay sát khuẩn đúng quy trình 6 bước' },
  { id: 'handover', label: 'Kiểm tra trang thiết bị, vật tư & bàn giao hồ sơ ca' },
  { id: 'mindset', label: 'Tác phong chu đáo, sẵn sàng phục vụ người bệnh' }
];

export const DailyMedicalQuoteWidget: React.FC = () => {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [showChecklist, setShowChecklist] = useState(false);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  
  // Pick quote deterministically based on day of month/year
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const currentQuote = MEDICAL_QUOTES[dayOfYear % MEDICAL_QUOTES.length];

  // Load daily checklist from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`safety_checklist_${todayKey}`);
      if (saved) {
        setChecklist(JSON.parse(saved));
      } else {
        setChecklist({});
      }
    } catch (e) {
      console.warn("Error reading safety checklist:", e);
    }
  }, [todayKey]);

  const toggleItem = (id: string) => {
    const next = {
      ...checklist,
      [id]: !checklist[id]
    };
    setChecklist(next);
    try {
      localStorage.setItem(`safety_checklist_${todayKey}`, JSON.stringify(next));
    } catch (e) {
      console.warn("Error saving safety checklist:", e);
    }
  };

  const completedCount = DEFAULT_SAFETY_ITEMS.filter(item => checklist[item.id]).length;
  const isAllCompleted = completedCount === DEFAULT_SAFETY_ITEMS.length;

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-xs border border-slate-100 space-y-3.5">
      {/* Quote Banner */}
      <div className="bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-slate-50 p-4 rounded-2xl border border-blue-100/80 space-y-2.5 relative overflow-hidden">
        <div className="flex items-center justify-between gap-2 relative z-10">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Stethoscope className="w-3.5 h-3.5" />
            </div>
            <span className="text-[11px] font-black uppercase text-blue-900 tracking-wider">
              THÔNG ĐIỆP Y ĐỨC HÔM NAY
            </span>
          </div>

          <span className="px-2 py-0.5 bg-blue-100/90 text-blue-800 text-[10px] font-bold rounded-md">
            {currentQuote.tag}
          </span>
        </div>

        <p className="text-xs sm:text-sm text-slate-700 font-medium italic leading-relaxed relative z-10 pl-2 border-l-2 border-blue-400">
          &ldquo;{currentQuote.quote}&rdquo;
        </p>

        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 relative z-10">
          <span className="font-semibold text-blue-800">— {currentQuote.author}</span>
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" /> Ngày mới an lành
          </span>
        </div>
      </div>

      {/* Safety & Shift Preparation Checklist Toggle */}
      <div className="bg-slate-50/80 rounded-2xl border border-slate-200/70 p-3">
        <div 
          onClick={() => setShowChecklist(!showChecklist)}
          className="flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
              isAllCompleted 
                ? 'bg-emerald-100 text-emerald-700' 
                : 'bg-blue-100 text-blue-700'
            }`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-slate-800 block">
                Chuẩn bị an toàn đầu ca ({completedCount}/{DEFAULT_SAFETY_ITEMS.length})
              </span>
              <span className="text-[10px] text-slate-500">
                {isAllCompleted ? 'Đã hoàn thành chuẩn bị ca làm việc!' : 'Nhấn để kiểm tra các bước an toàn'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAllCompleted && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-md flex items-center gap-1">
                <Award className="w-3 h-3" /> Sẵn sàng
              </span>
            )}
            <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500">
              {showChecklist ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </div>
        </div>

        {/* Expandable Checklist Content */}
        {showChecklist && (
          <div className="pt-3 mt-2 border-t border-slate-200/60 space-y-2 animate-in fade-in duration-150">
            {DEFAULT_SAFETY_ITEMS.map((item) => {
              const checked = !!checklist[item.id];
              return (
                <div
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                    checked 
                      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900' 
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
                  }`}
                >
                  {checked ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className={`text-xs font-medium ${checked ? 'line-through opacity-80' : ''}`}>
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
