import re

with open('src/pages/Admin.tsx', 'r') as f:
    content = f.read()

# 1. Add state variable
if "specialEmployeeSearch" not in content:
    content = content.replace("  const SPECIAL_EMPLOYEES_PER_PAGE = 10;", "  const SPECIAL_EMPLOYEES_PER_PAGE = 10;\n  const [specialEmployeeSearch, setSpecialEmployeeSearch] = useState('');")

# 2. Add filtered variable before the return statement
if "const filteredSpecialEmployees =" not in content:
    return_idx = content.find("  return (")
    filtered_code = """
  const filteredSpecialEmployees = specialEmployees.filter(emp => removeVietnameseTones(emp.user_name || '').includes(removeVietnameseTones(specialEmployeeSearch)));
"""
    content = content[:return_idx] + filtered_code + content[return_idx:]

# 3. Add search input in the header
old_header = """                <div className="p-4 border-b border-slate-100 bg-slate-50">
                  <h3 className="font-bold text-slate-700">Danh sách nhân viên được ưu tiên</h3>
                </div>"""

new_header = """                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700">Danh sách nhân viên được ưu tiên</h3>
                  <div className="relative w-64">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Tìm kiếm nhân viên..." 
                      value={specialEmployeeSearch}
                      onChange={(e) => {
                          setSpecialEmployeeSearch(e.target.value);
                          setSpecialEmployeesPage(1); // Reset page on search
                      }}
                      className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                    />
                  </div>
                </div>"""

if old_header in content:
    content = content.replace(old_header, new_header)

# 4. Update the IIFE and pagination controls to use filteredSpecialEmployees
content = content.replace("specialEmployees.slice(startIndex", "filteredSpecialEmployees.slice(startIndex")

old_empty_check = """                      {specialEmployees.length === 0 && ("""
new_empty_check = """                      {filteredSpecialEmployees.length === 0 && ("""
content = content.replace(old_empty_check, new_empty_check)

# Update Pagination controls
old_pagination = """{specialEmployees.length > SPECIAL_EMPLOYEES_PER_PAGE && (
                  <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-white shrink-0 mt-auto">
                    <span className="text-sm text-slate-500 font-medium">
                      Hiển thị {((specialEmployeesPage - 1) * SPECIAL_EMPLOYEES_PER_PAGE) + 1} - {Math.min(specialEmployeesPage * SPECIAL_EMPLOYEES_PER_PAGE, specialEmployees.length)} trong tổng số {specialEmployees.length} nhân viên
                    </span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSpecialEmployeesPage(p => Math.max(1, p - 1))}
                        disabled={specialEmployeesPage === 1}
                        className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Trước
                      </button>
                      <button 
                        onClick={() => setSpecialEmployeesPage(p => Math.min(Math.ceil(specialEmployees.length / SPECIAL_EMPLOYEES_PER_PAGE), p + 1))}
                        disabled={specialEmployeesPage >= Math.ceil(specialEmployees.length / SPECIAL_EMPLOYEES_PER_PAGE)}
                        className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Sau
                      </button>
                    </div>
                  </div>
                )}"""

new_pagination = """{filteredSpecialEmployees.length > SPECIAL_EMPLOYEES_PER_PAGE && (
                  <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-white shrink-0 mt-auto">
                    <span className="text-sm text-slate-500 font-medium">
                      Hiển thị {((specialEmployeesPage - 1) * SPECIAL_EMPLOYEES_PER_PAGE) + 1} - {Math.min(specialEmployeesPage * SPECIAL_EMPLOYEES_PER_PAGE, filteredSpecialEmployees.length)} trong tổng số {filteredSpecialEmployees.length} nhân viên
                    </span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSpecialEmployeesPage(p => Math.max(1, p - 1))}
                        disabled={specialEmployeesPage === 1}
                        className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Trước
                      </button>
                      <button 
                        onClick={() => setSpecialEmployeesPage(p => Math.min(Math.ceil(filteredSpecialEmployees.length / SPECIAL_EMPLOYEES_PER_PAGE), p + 1))}
                        disabled={specialEmployeesPage >= Math.ceil(filteredSpecialEmployees.length / SPECIAL_EMPLOYEES_PER_PAGE)}
                        className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Sau
                      </button>
                    </div>
                  </div>
                )}"""

content = content.replace(old_pagination, new_pagination)

with open('src/pages/Admin.tsx', 'w') as f:
    f.write(content)
print("Updated Admin.tsx with search functionality!")

