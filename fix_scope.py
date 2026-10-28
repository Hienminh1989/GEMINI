import re

with open('src/pages/Admin.tsx', 'r') as f:
    content = f.read()

# 1. Remove it from line 39 (inside LiveCountdown)
bad_code = "  const filteredSpecialEmployees = specialEmployees.filter(emp => removeVietnameseTones(emp.user_name || '').includes(removeVietnameseTones(specialEmployeeSearch)));\n"
content = content.replace(bad_code, "")

# 2. Add it inside Admin component, right after specialEmployeeSearch state declaration
target_hook = "  const [specialEmployeeSearch, setSpecialEmployeeSearch] = useState('');"
if target_hook in content:
    content = content.replace(target_hook, target_hook + "\n" + bad_code)

with open('src/pages/Admin.tsx', 'w') as f:
    f.write(content)
print("Scope fixed!")
