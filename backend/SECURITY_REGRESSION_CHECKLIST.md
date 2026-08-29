# Security regression checklist

Run these checks with two authenticated test accounts (A and B), plus an unauthenticated client.

| Check | Request/action | Expected result |
| --- | --- | --- |
| Protected API | `GET /api/messages/conversations` without cookie | `401` |
| Directory | `GET /api/messages/users` | `[]` |
| Directory bounds | username prefix and exact email searches | Max 20, no email/phone/push fields, current user omitted |
| Direct history | A requests `/api/messages/:bId` | Only A↔B messages |
| Message IDOR | A edits/deletes B's sent message | `403` |
| Group IDOR | A requests a group A is not in | `404`/`403` |
| Removed member | Remove A from group, then request its messages/media | `404`/`403` |
| Invalid token | Protected API with expired/malformed JWT | `401` |
| CSRF | Cross-origin `POST` with a valid cookie but unapproved `Origin` | `403` |
| Limits | Exceed login, OTP, search, message, or upload limits | `429` |
| Upload size | Upload >25 MiB | `413` |
| Upload type | Upload non-image bytes declared as PNG/JPEG/GIF/WebP, or non-PDF bytes declared PDF | `400` |
| Socket auth | Connect Socket.IO with no JWT | Rejected as unauthorized |
| Socket spoofing | Connect with A's JWT and `query.userId=B` | Socket belongs to A |
| Socket calls | A sends signal/end/accept for a call not involving A | No relay/state change |

Also perform a manual media authorization review before release: chat media URLs are currently returned as direct ImageKit URLs, so private ImageKit delivery must be configured before private-media confidentiality can be claimed.
