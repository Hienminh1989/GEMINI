import re

with open('src/pages/Admin.tsx', 'r') as f:
    content = f.read()

# Find the exportToExcel function
export_excel_func = """  const exportToExcel = () => {
    const wsData = records.map(r => ({"""

replacement = """  const exportToExcel = () => {
    let filteredRecords = records;
    if (todayDepartmentFilter || todayLateFilter) {
        let grouped = groupRecordsByUser(records);
        if (todayDepartmentFilter) {
          grouped = grouped.filter(u => u.department === todayDepartmentFilter);
        }
        if (todayLateFilter === 'late_morning') {
          grouped = grouped.filter(u => u.morningIn && u.morningIn.lateMinutes && u.morningIn.lateMinutes > 0);
        } else if (todayLateFilter === 'late_afternoon') {
          grouped = grouped.filter(u => u.afternoonIn && u.afternoonIn.lateMinutes && u.afternoonIn.lateMinutes > 0);
        }
        const validUserIds = new Set(grouped.map(u => u.userId));
        filteredRecords = records.filter(r => validUserIds.has(r.userId));
    }

    const wsData = filteredRecords.map(r => ({"""

content = content.replace(export_excel_func, replacement)

# Do the same for handleExportToGoogleSheets
export_sheets_func = """  const handleExportToGoogleSheets = async () => {
    if (records.length === 0) return;"""

sheets_replacement = """  const handleExportToGoogleSheets = async () => {
    if (records.length === 0) return;
    
    let filteredRecords = records;
    if (todayDepartmentFilter || todayLateFilter) {
        let grouped = groupRecordsByUser(records);
        if (todayDepartmentFilter) {
          grouped = grouped.filter(u => u.department === todayDepartmentFilter);
        }
        if (todayLateFilter === 'late_morning') {
          grouped = grouped.filter(u => u.morningIn && u.morningIn.lateMinutes && u.morningIn.lateMinutes > 0);
        } else if (todayLateFilter === 'late_afternoon') {
          grouped = grouped.filter(u => u.afternoonIn && u.afternoonIn.lateMinutes && u.afternoonIn.lateMinutes > 0);
        }
        const validUserIds = new Set(grouped.map(u => u.userId));
        filteredRecords = records.filter(r => validUserIds.has(r.userId));
    }"""

content = content.replace(export_sheets_func, sheets_replacement)

# Also update the exportToGoogleSheets(token, records, dateStr); to use filteredRecords
sheets_call = """const url = await exportToGoogleSheets(token, records, dateStr);"""
new_sheets_call = """const url = await exportToGoogleSheets(token, filteredRecords, dateStr);"""
content = content.replace(sheets_call, new_sheets_call)

with open('src/pages/Admin.tsx', 'w') as f:
    f.write(content)
print("Updated!")
