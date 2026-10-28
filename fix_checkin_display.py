import re

with open('src/pages/CheckIn.tsx', 'r') as f:
    content = f.read()

# Update shift checks to use both english and vietnamese just in case
old_mIn = "r.shift === 'morning'"
new_mIn = "(r.shiftId === 'morning' || r.shift === 'Sáng' || r.shift === 'morning')"
content = content.replace(old_mIn, new_mIn)

old_aIn = "r.shift === 'afternoon'"
new_aIn = "(r.shiftId === 'afternoon' || r.shift === 'Chiều' || r.shift === 'afternoon')"
content = content.replace(old_aIn, new_aIn)

old_eIn = "r.shift === 'evening'"
new_eIn = "(r.shiftId === 'evening' || r.shift === 'Tối' || r.shift === 'evening')"
content = content.replace(old_eIn, new_eIn)

with open('src/pages/CheckIn.tsx', 'w') as f:
    f.write(content)
print("Updated CheckIn.tsx records check")
