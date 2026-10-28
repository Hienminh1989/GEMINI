import re

with open('src/pages/Admin.tsx', 'r') as f:
    content = f.read()

bad_code = "  const filteredSpecialEmployees = specialEmployees.filter(emp => removeVietnameseTones(emp.user_name || '').includes(removeVietnameseTones(specialEmployeeSearch)));\n"
content = content.replace(bad_code, "")

target = "  if (!canView) return ("
if target in content:
    content = content.replace(target, bad_code + target)

with open('src/pages/Admin.tsx', 'w') as f:
    f.write(content)
print("Initialization fixed!")
