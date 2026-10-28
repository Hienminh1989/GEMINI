import re

with open('src/pages/Admin.tsx', 'r') as f:
    content = f.read()

# 1. Add state variable
state_str = "  const [specialEmployeesPage, setSpecialEmployeesPage] = useState(1);\n  const SPECIAL_EMPLOYEES_PER_PAGE = 10;"
if "specialEmployeesPage" not in content:
    content = content.replace("  const ITEMS_PER_PAGE = 20;", f"  const ITEMS_PER_PAGE = 20;\n{state_str}")

# 2. Add pagination logic before rendering
render_block_start = """                      {specialEmployees.map((emp) => ("""

if render_block_start in content:
    paginated_render = """                      {(() => {
                        const startIndex = (specialEmployeesPage - 1) * SPECIAL_EMPLOYEES_PER_PAGE;
                        const paginated = specialEmployees.slice(startIndex, startIndex + SPECIAL_EMPLOYEES_PER_PAGE);
                        return paginated.map((emp) => ("""
    
    content = content.replace(render_block_start, paginated_render)
    
    # We also need to close the IIFE logic that wraps the map. Let's find where the map ends.
    # The map ends with:
    #                           </td>
    #                         </tr>
    #                       ))}
    
    map_end_str = """                          </td>
                        </tr>
                      ))}"""
    
    paginated_end_str = """                          </td>
                        </tr>
                      ));
                      })()}"""
    
    content = content.replace(map_end_str, paginated_end_str)
    
    # 3. Add pagination controls below the table
    table_end_str = "                  </table>\n                </div>"
    
    pagination_controls = """                  </table>
                </div>
                
                {/* Pagination Controls */}
                {specialEmployees.length > SPECIAL_EMPLOYEES_PER_PAGE && (
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
                
    content = content.replace(table_end_str, pagination_controls)

with open('src/pages/Admin.tsx', 'w') as f:
    f.write(content)
print("Updated Admin.tsx for special employees pagination!")
