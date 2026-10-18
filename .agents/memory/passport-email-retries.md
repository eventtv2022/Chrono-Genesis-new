---
name: Passport email retry idempotency
description: Keep passport email retries from resending a message Gmail already accepted.
---

Passport email delivery is durable through an outbox. Each notification needs one stable RFC Message-ID, and retries must query Gmail Sent mail for that ID before calling the send endpoint. Gmail has no send idempotency key, so a retry must not generate a new Message-ID.

**Why:** A successful Gmail send can be followed by a lost response or a database write failure; blindly retrying can deliver duplicate passport emails.

**How to apply:** Preserve the outbox row and its stable ID through retries. If the Gmail lookup fails, classify and retry that lookup rather than sending without the duplicate check.
