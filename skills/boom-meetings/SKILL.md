---
name: boom-meetings
description: Schedule, list, and manage Boom Video meetings. Use when the user wants to set up a video call, schedule a meeting with someone, or check upcoming meetings.
metadata: { "openclaw": { "emoji": "📹", "requires": { "bins": ["curl"] } } }
---

# Boom Video Meeting Scheduler

Schedule video meetings on Boom Video (meet.nevins.cloud) via the API. Meetings include automatic invite emails with calendar attachments, confirmation emails to the host, and reminder emails 15 minutes before the meeting.

## API Details

- **Base URL**: `https://meet-api.nevins.cloud`
- **Auth**: `X-API-Key` header
- **API Key**: Read from environment variable `BOOM_API_KEY`

## Schedule a Meeting

Create a scheduled meeting. The system automatically sends an invite email with an ICS calendar attachment to the client and a confirmation email to the host.

```bash
curl -s -X POST https://meet-api.nevins.cloud/api/scheduled-meetings \
  -H "X-API-Key: $BOOM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "attendees": [
      {"name": "ATTENDEE_NAME", "email": "ATTENDEE_EMAIL"}
    ],
    "scheduledAt": "ISO_8601_DATETIME",
    "hostEmail": "HOST_EMAIL"
  }'
```

**Parameters**:
- `attendees` (required): Array of attendee objects, each with:
  - `name` (required): The attendee's name
  - `email` (optional): Their email address (receives invite + ICS calendar file)
- `scheduledAt` (required): ISO 8601 datetime with timezone, e.g. `2026-03-05T14:00:00Z`
- `hostEmail` (required): The host's email. Must be a registered Boom user. Available hosts:
  - `justin@nevinstech.com` (Justin)
  - `burt@nevinstech.com` (Burt)
  - `justinnevins@protonmail.com` (Justin N)

**Legacy single-client format** (still supported):
- `clientName` + `clientEmail` instead of `attendees` array

**Response**:
```json
{
  "id": 1,
  "roomName": "jumping-compass",
  "scheduledAt": "2026-03-05T14:00:00Z",
  "inviteLink": "https://meet.nevins.cloud/join/jumping-compass",
  "attendees": [
    {"name": "John Doe", "email": "john@example.com"}
  ],
  "clientName": "John Doe",
  "clientEmail": "john@example.com"
}
```

**What happens automatically**:
- Client receives an HTML invite email with an `.ics` calendar attachment
- Host receives a confirmation email with meeting details
- 15 minutes before the meeting, both get a reminder email

Always share the `inviteLink` back to the user after scheduling.

## List Scheduled Meetings

Requires JWT auth (not API key). Use this to check existing meetings:

```bash
# First login to get a token
TOKEN=$(curl -s -X POST https://meet-api.nevins.cloud/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "HOST_EMAIL", "password": "'"$BOOM_ADMIN_PASSWORD"'"}' | jq -r '.token')

# Then list meetings
curl -s https://meet-api.nevins.cloud/api/scheduled-meetings \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## Cancel a Meeting

Requires JWT auth:

```bash
curl -s -X DELETE https://meet-api.nevins.cloud/api/scheduled-meetings/MEETING_ID \
  -H "Authorization: Bearer $TOKEN"
```

The client automatically receives a cancellation email.

## Guidelines

- When the user says "schedule a meeting", ask for: attendee names and emails, preferred date/time, and which host to use (default to `justin@nevinstech.com` if not specified).
- Convert natural language times to ISO 8601. If the user says "tomorrow at 2pm", calculate the correct datetime. Assume US Eastern time unless told otherwise.
- After scheduling, always report back: the meeting time, invite link, and confirm that the invite email was sent.
- If the user asks to cancel, you need to list meetings first to find the ID, then cancel.
- The meeting link format is: `https://meet.nevins.cloud/join/ROOM_NAME`
- Meetings default to 1 hour duration in the calendar invite.
