import re

with open('src/components/AdminDashboard.tsx', 'r') as f:
    content = f.read()

# Add states
state_addition = """  const [showViewAllModal, setShowViewAllModal] = useState(false);
  const [viewAllPage, setViewAllPage] = useState(1);
  const viewAllPerPage = 15;
"""
if 'const [showViewAllModal' not in content:
    content = content.replace('const [tablePage, setTablePage] = useState(1);', state_addition + '  const [tablePage, setTablePage] = useState(1);')

# Add export function and viewAllDataList
logic_addition = """  const viewAllDataList = useMemo(() => {
    return tableDataFull.slice((viewAllPage - 1) * viewAllPerPage, viewAllPage * viewAllPerPage);
  }, [tableDataFull, viewAllPage, viewAllPerPage]);

  const exportViewAllToExcel = () => {
    const dataToExport = tableDataFull.map((item, i) => ({
      "STT": i + 1,
      "Mã NV": item.user?.uid || "",
      "Họ và tên": item.user?.name || "",
      "Khoa / Phòng": item.user?.department || "Chưa cập nhật",
      "Trạng thái": item.status,
      "Ca trực": item.shift || "-",
      "Số phút đi muộn": item.lateTime > 0 ? `${item.lateTime} phút` : "-"
    }));
    
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh_sach");
    XLSX.writeFile(wb, `Danh_sach_${tableFilter}_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
  };
"""
if 'const exportViewAllToExcel' not in content:
    content = content.replace('const tableDataCount = tableDataFull.length;', logic_addition + '\  const tableDataCount = tableDataFull.length;')

# Change "Xem tất cả" button
old_btn = '<button className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">Xem tất cả</button>'
new_btn = '<button onClick={() => { setShowViewAllModal(true); setViewAllPage(1); }} className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">Xem tất cả</button>'
content = content.replace(old_btn, new_btn)

# Add Modal at the end, right before the last closing div
modal_html = """
      {showViewAllModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[120] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">
                Danh sách {tableFilter === 'not_checked_in' ? 'Chưa điểm danh' : 'Đi muộn'} ({tableDataFull.length})
              </h3>
              <div className="flex items-center gap-3">
                <button 
                  onClick={exportViewAllToExcel}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" /> Xuất Excel
                </button>
                <button onClick={() => setShowViewAllModal(false)} className="w-8 h-8 flex items-center justify-center bg-slate-200 text-slate-600 rounded-full hover:bg-slate-300">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-0">
               <table className="w-full text-left whitespace-nowrap">
                  <thead className="bg-slate-50 text-xs text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                        <th className="px-5 py-4">STT</th>
                        <th className="px-5 py-4">Họ và tên</th>
                        <th className="px-5 py-4">Khoa / Phòng</th>
                        <th className="px-5 py-4">Trạng thái</th>
                        <th className="px-5 py-4">Ca trực</th>
                        <th className="px-5 py-4">Số phút đi muộn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                    {viewAllDataList.map((item, i) => (
                    <tr key={item.user?.uid || i} className="hover:bg-slate-50">
                       <td className="px-5 py-3">{(viewAllPage - 1) * viewAllPerPage + i + 1}</td>
                       <td className="px-5 py-3">{item.user?.name}</td>
                       <td className="px-5 py-3">{item.user?.department || 'Chưa cập nhật'}</td>
                       <td className="px-5 py-3">
                         {item.status === 'Chưa điểm danh' ? (
                           <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded font-bold border border-slate-200">Chưa điểm danh</span>
                         ) : (
                           <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded font-bold border border-orange-100">Đi muộn</span>
                         )}
                       </td>
                       <td className="px-5 py-3">{item.shift || '-'}</td>
                       <td className="px-5 py-3">
                         {item.lateTime > 0 ? (
                           <span className="font-bold text-orange-600">{item.lateTime} phút</span>
                         ) : '-'}
                       </td>
                    </tr>
                    ))}
                    {viewAllDataList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-slate-500">Không có dữ liệu</td>
                      </tr>
                    )}
                  </tbody>
               </table>
            </div>
            
            {/* Phân trang */}
            {tableDataFull.length > viewAllPerPage && (
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <span className="text-sm text-slate-500 font-medium">Hiển thị {(viewAllPage - 1) * viewAllPerPage + 1} - {Math.min(viewAllPage * viewAllPerPage, tableDataFull.length)} trong tổng số {tableDataFull.length}</span>
                <div className="flex gap-1">
                   <button 
                     disabled={viewAllPage === 1}
                     onClick={() => setViewAllPage(p => Math.max(1, p - 1))}
                     className="px-3 py-1.5 border border-slate-300 rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed bg-white shadow-sm"
                   >
                     Trước
                   </button>
                   <button 
                     disabled={viewAllPage >= Math.ceil(tableDataFull.length / viewAllPerPage)}
                     onClick={() => setViewAllPage(p => p + 1)}
                     className="px-3 py-1.5 border border-slate-300 rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed bg-white shadow-sm"
                   >
                     Sau
                   </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
"""

# Insert modal at the end before last div
# Find the last closing tag
last_div_idx = content.rfind('</div>')
if last_div_idx != -1 and '{showViewAllModal && (' not in content:
    content = content[:last_div_idx] + modal_html + content[last_div_idx:]

with open('src/components/AdminDashboard.tsx', 'w') as f:
    f.write(content)
print("AdminDashboard updated")
