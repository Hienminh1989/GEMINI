import re

with open('server.ts', 'r') as f:
    content = f.read()

# Add shiftId mapping
old_mapping = """      reason: row.reason,
      shift: row.shift,
      lateMinutes: row.late_minutes,
      earlyLeaveMinutes: row.early_leave_minutes
    }));"""
new_mapping = """      reason: row.reason,
      shift: row.shift,
      shiftId: row.shift_id,
      lateMinutes: row.late_minutes,
      earlyLeaveMinutes: row.early_leave_minutes
    }));"""
content = content.replace(old_mapping, new_mapping)

with open('server.ts', 'w') as f:
    f.write(content)
print("Updated server.ts")
