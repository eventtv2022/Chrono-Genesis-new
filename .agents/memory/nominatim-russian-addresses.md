---
name: Nominatim Russian addresses
description: Nominatim geocoding behavior for common abbreviated Russian street and house addresses.
---

For Russian address searches, retry Nominatim with common abbreviations expanded or removed (for example, `ул.` → `улица`, `д.` → no token) when the original query returns no results. Do not use JavaScript `\b` around Cyrillic abbreviations; its word-boundary rules are ASCII-oriented and can fail to match or corrupt the address.

**Why:** Nominatim returned no result for a real address written with Russian `ул.` and `д.` abbreviations, but found it after normalization.

**How to apply:** When changing Chronopedia place search or adding Russian geocoding inputs, test the exact user-entered form and its normalized form against the geocoding endpoint.
