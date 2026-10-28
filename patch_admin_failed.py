import re

with open('src/pages/Admin.tsx', 'r') as f:
    content = f.read()

# Add activeTab option
if " | 'failed_logs'>" not in content:
    content = content.replace("'dashboard' | 'qr' | 'today' | 'month' | 'statistics' | 'settings' | 'employees' | 'departments' | 'special_employees' | 'notifications'", 
                              "'dashboard' | 'qr' | 'today' | 'month' | 'statistics' | 'settings' | 'employees' | 'departments' | 'special_employees' | 'notifications' | 'failed_logs'")

# Add state for failedRecords
if 'const [failedRecords' not in content:
    content = content.replace('const [records, setRecords] = useState<AttendanceRecord[]>([]);', 
                              'const [records, setRecords] = useState<AttendanceRecord[]>([]);\n  const [failedRecords, setFailedRecords] = useState<any[]>([]);')

# Add fetchFailedRecords function
fetch_func = """  const fetchFailedRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance_failed?_t=${Date.now()}&dateStr=${dateStr}&orderByStr=desc`);
      if (res.ok) {
        const data = await res.json();
        setFailedRecords(data);
      }
    } catch (e) {
      console.warn('Lỗi fetchFailedRecords:', e);
    }
    setLoading(false);
  };
"""
if 'const fetchFailedRecords' not in content:
    content = content.replace('  const fetchTodayRecords = async () => {', fetch_func + '\n  const fetchTodayRecords = async () => {')

# Hook activeTab change
if "else if (activeTab === 'failed_logs') {" not in content:
    old_hook = """    } else if (activeTab === 'statistics') {
      fetchStatisticsRecords();
    }
  }, [activeTab]);"""
    new_hook = """    } else if (activeTab === 'statistics') {
      fetchStatisticsRecords();
    } else if (activeTab === 'failed_logs') {
      fetchFailedRecords();
    }
  }, [activeTab]);"""
    content = content.replace(old_hook, new_hook)

# Add button to sidebar
btn_html = """           <button onClick={() => setActiveTab('failed_logs')} className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'failed_logs' ? 'bg-red-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
              <AlertTriangle className={`w-5 h-5 ${isSidebarCollapsed ? 'mx-auto' : 'mr-3'}`} />
              {!isSidebarCollapsed && <span>Lỗi điểm danh</span>}
           </button>
           <button onClick={() => setActiveTab('settings')}"""
if "setActiveTab('failed_logs')" not in content:
    content = content.replace("           <button onClick={() => setActiveTab('settings')}", btn_html)

# Add tab content
tab_html = """
                {activeTab === 'failed_logs' && (
                  <div className="flex flex-col h-full overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex flex-wrap gap-4 justify-between items-center bg-slate-50 shrink-0">
                      <div className="flex items-center gap-3">
                        <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide text-red-600">
                          Nhật ký điểm danh Lỗi / Thất bại
                        </h2>
                        <input 
                          type="date" 
                          value={dateStr}
                          onChange={(e) => {
                            setDateStr(e.target.value);
                            setTimeout(() => fetchFailedRecords(), 100);
                          }}
                          className="px-2 py-1 border border-slate-200 rounded text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-red-100 bg-white"
                        />
                      </div>
                      <button onClick={fetchFailedRecords} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50">
                        <RefreshCw className="w-4 h-4" /> Làm mới
                      </button>
                    </div>
                    
                    <div className="flex-1 overflow-auto bg-white p-4">
                      {loading ? (
                        <div className="flex justify-center p-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-slate-50 text-xs text-slate-500 font-bold border-b border-slate-200">
                              <tr>
                                <th className="px-4 py-3">STT</th>
                                <th className="px-4 py-3">Thời gian</th>
                                <th className="px-4 py-3">Họ tên</th>
                                <th className="px-4 py-3">Khoa / Phòng</th>
                                <th className="px-4 py-3">Loại</th>
                                <th className="px-4 py-3">Lý do thất bại</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                              {failedRecords.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Không có dữ liệu lỗi trong ngày này.</td>
                                </tr>
                              ) : (
                                failedRecords.map((r, idx) => (
                                  <tr key={r.id || idx} className="hover:bg-slate-50">
                                    <td className="px-4 py-3">{idx + 1}</td>
                                    <td className="px-4 py-3">
                                      {format(new Date(r.timestamp), 'HH:mm:ss')}
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="font-bold text-slate-800">{r.user_name}</div>
                                      <div className="text-xs text-slate-400">ID: {r.user_id}</div>
                                    </td>
                                    <td className="px-4 py-3">{r.department}</td>
                                    <td className="px-4 py-3">
                                      {r.type === 'in' ? (
                                        <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded-md">Vào ca</span>
                                      ) : (
                                        <span className="text-orange-600 bg-orange-50 px-2 py-1 rounded-md">Ra ca</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className="text-red-600 font-semibold">{r.reason || (r.status === 'out_of_range' ? 'Vượt quá khoảng cách điểm danh' : r.status)}</span>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
"""

if "activeTab === 'failed_logs' && (" not in content:
    content = content.replace("{activeTab === 'settings' && (", tab_html + "\n                {activeTab === 'settings' && (")

if 'AlertTriangle' not in content:
    content = content.replace("import { MapPin,", "import { AlertTriangle, MapPin,")

with open('src/pages/Admin.tsx', 'w') as f:
    f.write(content)
print("Admin.tsx updated")
