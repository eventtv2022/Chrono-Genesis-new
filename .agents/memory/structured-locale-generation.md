---
name: Structured locale generation
description: Preserve translation-to-message alignment when generating localization dictionaries with an LLM.
---

When generating localized UI copy with an LLM, require translations as objects keyed by stable message IDs. Do not rely on arrays staying in source order, even when the prompt explicitly requires that order.

**Why:** A translation attempt returned a valid array with phrases reordered, which would silently assign incorrect text to UI labels.

**How to apply:** Use stable keys in the structured response schema, verify every locale contains every key, and keep the English source as an explicit fallback.
