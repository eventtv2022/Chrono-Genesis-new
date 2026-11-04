---
name: Time Matrix browser auth
description: Reliable bearer-header handling for Matrix API calls in the Expo web client
---

When the Matrix screen displays authenticated controls but the API reports a missing bearer token, pass the current citizen context's auth headers through the generated API hook's `request.headers` option for Matrix reads and mutations. Do not rely only on the storage-backed global token getter in this browser flow.

**Why:** a user reauthenticated in mobile Chrome, yet Matrix requests still reached the API without an Authorization header.

**How to apply:** Keep the authenticated state and request header sourced from the same citizen context; cover list, create, start, complete, update, and delete calls.
