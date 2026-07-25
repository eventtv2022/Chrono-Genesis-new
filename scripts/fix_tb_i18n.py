#!/usr/bin/env python3
"""
Fix two issues introduced by add_tb_i18n.py:
1. tg_notify_all_groups line is now missing its trailing comma (comma ended up on TimeBank comment line)
2. tb_hours_worked_req line ends with ,, (double comma)
"""
import re

path = "artifacts/mobile/lib/i18n.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Fix 1: tg_notify_all_groups: "..." NOT followed by comma, then newline + // TimeBank
# Add the missing comma
content = re.sub(
    r'(tg_notify_all_groups: "[^"]*")(\n    // TimeBank)',
    r'\1,\2',
    content
)

# Fix 2: tb_hours_worked_req: "...",,  → single comma
content = re.sub(
    r'(tb_hours_worked_req: "[^"]*"),,',
    r'\1,',
    content
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

c1 = len(re.findall(r'tg_notify_all_groups: "[^"]*",\n    // TimeBank', content))
c2 = len(re.findall(r'tb_hours_worked_req: "[^"]*",\n', content))
print(f"tg_notify_all_groups comma fix: {c1} blocks")
print(f"double-comma fix: {c2} blocks")
print("Done!")
