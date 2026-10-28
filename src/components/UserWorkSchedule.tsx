import React, { useState, useEffect } from 'react';
import { 
  Calendar, Clock, User, Building, ChevronLeft, ChevronRight, 
  CheckCircle, AlertCircle, CalendarDays, ShieldCheck, Sun, Moon, 
  Activity, Users, Search, RefreshCw, Sparkles, FileSpreadsheet, ArrowRight
} from 'lucide-react';
import { format, addWeeks, subWeeks, parseISO, isSameDay, isToday } from 'date-fns';
import { DutyShift } from '../types';
import { getWeekDates, DAY_NAMES_VI, normalizeText, isUserNameMatch } from '../lib/dutyExcel';
import { HospitalDutyScheduleView } from './HospitalDutyScheduleView';
import { apiFetch } from '../lib/api';

interface UserWorkScheduleProps {
  currentUserName: string;
  currentDepartment: string;
  currentUserId?: string;
  departmentsList: { id: string; name: string }[];
}

export function UserWorkSchedule({
  currentUserName,
  currentDepartment,
  currentUserId,
  departmentsList
}: UserWorkScheduleProps) {
  const [currentBaseDate, setCurrentBaseDate] = useState<Date>(new Date());
  const [shifts, setShifts] = useState<DutyShift[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [viewTab, setViewTab] = useState<'my_schedule' | 'all_schedule' | 'hospital_table'>('my_schedule');
  const [selectedDept, setSelectedDept] = useState<string>(currentDepartment || 'ALL');
  const [searchCoworker, setSearchCoworker] = useState<string>('');

  const weekInfo = getWeekDates(currentBaseDate);

  const fetchSchedule = async () => {
    setLoading(true);
    try {
      const url = `/api/duty_shifts?weekNumber=${weekInfo.weekNumber}&year=${weekInfo.year}&startDate=${weekInfo.weekStartDateStr}&endDate=${weekInfo.weekEndDateStr}`;
      const res = await apiFetch<DutyShift[]>(url);
      if (res.ok && Array.isArray(res.data)) {
        setShifts(res.data);
      }
    } catch (err) {
      console.error('Error fetching employee schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedule();
  }, [weekInfo.weekNumber, weekInfo.year, weekInfo.weekStartDateStr, weekInfo.weekEndDateStr]);

  // Keep selectedDept in sync when user logs in
  useEffect(() => {
    if (currentDepartment && selectedDept === 'ALL') {
      setSelectedDept(currentDepartment);
    }
  }, [currentDepartment]);

  // Filter user's personal shifts
  const myShifts = shifts.filter(s => {
    const isIdMatch = currentUserId && s.userId && s.userId.toLowerCase() === currentUserId.toLowerCase();
    const isNameMatch = currentUserName && isUserNameMatch(s.userName, currentUserName);
    return isIdMatch || isNameMatch;
  });

  // Shifts for today
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const myShiftToday = myShifts.find(s => s.dateStr === todayStr);

  // Filter department shifts for team view
  const teamShifts = shifts.filter(s => {
    const matchDept = selectedDept === 'ALL' || s.department === selectedDept;
    const matchSearch = !searchCoworker || 
      normalizeText(s.userName).includes(normalizeText(searchCoworker)) ||
      normalizeText(s.dutyRole).includes(normalizeText(searchCoworker));
    return matchDept && matchSearch;
  });

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-100 flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
        <div>
          <h2 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-blue-600" /> Lịch làm việc & Lịch trực
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Lịch phân công trực bệnh viện theo tuần
          </p>
        </div>

        <button
          onClick={fetchSchedule}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors"
          title="Tải lại"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {/* Week Navigator */}
      <div className="my-3 flex items-center justify-between bg-slate-50 p-1.5 rounded-2xl border border-slate-100 shrink-0">
        <button
          onClick={() => setCurrentBaseDate(subWeeks(currentBaseDate, 1))}
          className="p-1.5 hover:bg-white text-slate-600 rounded-xl transition-all shadow-xs"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-center">
          <button
            onClick={() => setCurrentBaseDate(new Date())}
            className="px-2.5 py-1 bg-white text-blue-600 text-xs font-bold rounded-lg shadow-xs hover:bg-blue-50 border border-slate-200"
          >
            Tuần này
          </button>
          <span className="text-xs font-black text-slate-800">
            Tuần {weekInfo.weekNumber} ({format(weekInfo.start, 'dd/MM')} - {format(weekInfo.end, 'dd/MM/yyyy')})
          </span>
        </div>

        <button
          onClick={() => setCurrentBaseDate(addWeeks(currentBaseDate, 1))}
          className="p-1.5 hover:bg-white text-slate-600 rounded-xl transition-all shadow-xs"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold mb-3 shrink-0 gap-1">
        <button
          onClick={() => setViewTab('my_schedule')}
          className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            viewTab === 'my_schedule' 
              ? 'bg-white text-blue-700 shadow-sm' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Lịch của tôi</span>
          {myShifts.length > 0 && (
            <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black">
              {myShifts.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setViewTab('all_schedule')}
          className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            viewTab === 'all_schedule' 
              ? 'bg-white text-blue-700 shadow-sm' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Theo khoa</span>
        </button>

        <button
          onClick={() => setViewTab('hospital_table')}
          className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            viewTab === 'hospital_table' 
              ? 'bg-white text-blue-700 shadow-sm' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
          <span>Bảng Lịch trực BV</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pr-0.5 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
            <p className="text-xs font-medium">Đang tải dữ liệu lịch trực...</p>
          </div>
        ) : viewTab === 'my_schedule' ? (
          /* MY SCHEDULE VIEW */
          <div className="space-y-3">
            {/* Active Shift Today Highlight Banner */}
            {myShiftToday ? (
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-4 shadow-md relative overflow-hidden">
                <div className="absolute right-0 top-0 translate-x-3 -translate-y-3 opacity-10">
                  <Sparkles className="w-24 h-24 text-white" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-amber-400 text-slate-900 text-[10px] font-black rounded-full uppercase tracking-wider animate-pulse">
                      HÔM NAY BẠN CÓ CA TRỰC
                    </span>
                  </div>
                  <h3 className="text-lg font-black">{myShiftToday.shiftName}</h3>
                  <p className="text-xs text-blue-100 font-medium mt-0.5">
                    {myShiftToday.dutyRole} • {myShiftToday.department}
                  </p>
                  <div className="mt-2.5 flex items-center gap-3 text-xs bg-white/10 backdrop-blur-xs px-3 py-1.5 rounded-xl w-fit">
                    <Clock className="w-3.5 h-3.5 text-amber-300" />
                    <span className="font-bold">
                      {myShiftToday.startTime} - {myShiftToday.endTime}
                    </span>
                    {myShiftToday.note && (
                      <span className="text-blue-100">• {myShiftToday.note}</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-100/60 text-blue-600 flex items-center justify-center font-bold">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-700">Hôm nay ({format(new Date(), 'dd/MM')})</p>
                    <p className="text-[11px] text-slate-400">Không có ca trực phân công</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                  Hành chính
                </span>
              </div>
            )}

            {/* Daily Schedule List for 7 days */}
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 px-1 pt-1">
                Lịch chi tiết 7 ngày trong tuần
              </h4>

              {weekInfo.days.map((day) => {
                const shiftOnDay = myShifts.find(s => s.dateStr === day.dateStr);
                const isDayToday = isSameDay(day.date, new Date());

                return (
                  <div
                    key={day.dateStr}
                    className={`p-3 rounded-2xl border transition-all ${
                      isDayToday
                        ? 'bg-blue-50/70 border-blue-200 shadow-xs'
                        : shiftOnDay
                        ? 'bg-white border-slate-200 shadow-xs'
                        : 'bg-slate-50/50 border-slate-100 opacity-80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 font-bold ${
                          isDayToday
                            ? 'bg-blue-600 text-white shadow-xs'
                            : shiftOnDay
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-400'
                        }`}>
                          <span className="text-[10px] leading-tight uppercase font-medium">{day.dayName.replace('Thứ ', 'T')}</span>
                          <span className="text-xs leading-none font-black">{format(day.date, 'dd')}</span>
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-slate-800">
                              {day.dayName} ({format(day.date, 'dd/MM')})
                            </span>
                            {isDayToday && (
                              <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[9px] font-black rounded">
                                Hôm nay
                              </span>
                            )}
                          </div>

                          {shiftOnDay ? (
                            <div className="mt-0.5">
                              <p className="text-xs font-bold text-blue-700">
                                {shiftOnDay.shiftName} • {shiftOnDay.dutyRole}
                              </p>
                              <p className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                {shiftOnDay.startTime} - {shiftOnDay.endTime}
                                {shiftOnDay.note && ` • ${shiftOnDay.note}`}
                              </p>
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400 mt-0.5">Không phân công trực</p>
                          )}
                        </div>
                      </div>

                      <div>
                        {shiftOnDay ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 font-bold text-[10px] rounded-lg border border-green-200">
                            CÓ TRỰC
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-slate-100 text-slate-400 font-medium text-[10px] rounded-lg">
                            Nghỉ trực
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {myShifts.length === 0 && (
              <div className="text-center py-6 px-4 bg-slate-50 rounded-2xl border border-slate-200/60">
                <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">Bạn không có ca trực nào trong Tuần {weekInfo.weekNumber}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
                  Tên tài khoản của bạn: <span className="font-bold text-slate-600">{currentUserName || 'Chưa cập nhật'}</span>
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => setViewTab('hospital_table')}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-blue-700 transition-colors shadow-xs"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Xem Bảng Lịch trực BV (Mẫu đầy đủ)
                  </button>
                  <button
                    onClick={() => setViewTab('all_schedule')}
                    className="px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-slate-50 transition-colors"
                  >
                    <Building className="w-3.5 h-3.5 text-slate-500" />
                    Xem Lịch trực theo khoa
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : viewTab === 'all_schedule' ? (
          /* DEPARTMENT / ALL HOSPITAL SCHEDULE VIEW */
          <div className="space-y-3">
            {/* Filter controls */}
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
              >
                <option value="ALL">Tất cả khoa phòng</option>
                {departmentsList.map(d => (
                  <option key={d.id || d.name} value={d.name}>{d.name}</option>
                ))}
              </select>

              <div className="relative flex-1 min-w-[130px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm đồng nghiệp..."
                  value={searchCoworker}
                  onChange={(e) => setSearchCoworker(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none"
                />
              </div>
            </div>

            {/* Daily breakdown of coworkers */}
            <div className="space-y-3">
              {weekInfo.days.map((day) => {
                const dayShifts = teamShifts.filter(s => s.dateStr === day.dateStr);
                const isDayToday = isSameDay(day.date, new Date());

                return (
                  <div
                    key={day.dateStr}
                    className={`rounded-2xl border overflow-hidden ${
                      isDayToday ? 'border-blue-300 bg-blue-50/30 shadow-xs' : 'border-slate-200 bg-white shadow-xs'
                    }`}
                  >
                    <div className="p-3 bg-slate-100/60 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs text-slate-800">{day.dayName} ({format(day.date, 'dd/MM')})</span>
                        {isDayToday && (
                          <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[9px] font-black rounded">
                            Hôm nay
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        {dayShifts.length} người trực
                      </span>
                    </div>

                    <div className="p-2 divide-y divide-slate-100">
                      {dayShifts.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic text-center py-2">Không có ca trực</p>
                      ) : (
                        dayShifts.map((s, idx) => (
                          <div key={s.id || idx} className="py-2 px-1 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-bold text-slate-800">{s.userName}</p>
                              <p className="text-[10px] text-slate-500">{s.department} • {s.dutyRole}</p>
                            </div>
                            <div className="text-right">
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[10px]">
                                {s.shiftName}
                              </span>
                              <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                                {s.startTime} - {s.endTime}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* HOSPITAL OFFICIAL DUTY SCHEDULE VIEW */
          <div className="h-full min-h-[500px]">
            <HospitalDutyScheduleView
              readOnly={true}
              canEdit={false}
              canDelete={false}
              highlightUserName={currentUserName}
            />
          </div>
        )}
      </div>
    </div>
  );
}
