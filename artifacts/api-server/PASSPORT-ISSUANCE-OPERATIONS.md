# Passport issuance backlog

The API server checks the eligible pending-passport queue on each 15-second
issuance scheduler tick. A warning is emitted when the oldest eligible pending
passport has been waiting for more than five minutes past `availableAt`.

To find the signal, search the API Server runtime logs for:

`Eligible passport issuance backlog exceeded age threshold`

The structured warning fields are `pendingEligibleCount`,
`oldestPendingAgeMs`, and `warningAgeThresholdMs`. The warning repeats no more
than once every five minutes while the condition persists, and includes no
applicant identifiers or personal data. A database failure during the check is
logged separately as `Passport issuance backlog check failed`.
