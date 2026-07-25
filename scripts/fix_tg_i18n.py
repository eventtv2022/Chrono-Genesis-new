#!/usr/bin/env python3
"""
Fix the i18n.ts file after the bad insertion:
- mod_delete_warning line is missing its trailing comma
- new tg_ keys line has a double comma at the end ,,

Pattern in each language block:
    mod_delete_warning: "..."
    tg_section_title: "...", ..., tg_notify_all_groups: "...",,[newline]  },

Should be:
    mod_delete_warning: "...",
    tg_section_title: "...", ..., tg_notify_all_groups: "...",
  },
"""
import re

path = 'artifacts/mobile/lib/i18n.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: "mod_delete_warning: "..."" followed immediately (no comma) by newline + tg_ keys
# The pattern is: mod_delete_warning: "..."[NEWLINE][spaces]tg_section_title
# We need to add comma after the closing quote before the newline
content = re.sub(
    r'(    mod_delete_warning: "[^"]*")(\n    tg_section_title)',
    r'\1,\2',
    content
)

# Fix 2: tg_notify_all_groups: "...",,  → tg_notify_all_groups: "...",
content = re.sub(
    r'(tg_notify_all_groups: "[^"]*"),,',
    r'\1,',
    content
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

# Count fixes
fixes1 = len(re.findall(r'    mod_delete_warning: "[^"]*",\n    tg_section_title', content))
fixes2 = len(re.findall(r'tg_notify_all_groups: "[^"]*",\n', content))
print(f'mod_delete_warning commas fixed: {fixes1} blocks')
print(f'double-comma tg_notify_all_groups: {fixes2} blocks')
print('Done!')
