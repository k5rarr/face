# FaceTrack Attendance Demo

A browser-based attendance website prototype for facial recognition check-in/check-out.

## Features

- Register employees (ID + name + face template).
- Record attendance events (**Check In** / **Check Out**) with timestamp and match distance.
- View registered employees and attendance logs.
- Persist data in browser `localStorage`.
- Supports two input modes:
  - **Webcam mode** (like a scanner kiosk)
  - **Photo Upload mode** (works in environments where webcam is unavailable)

## Run locally

Because this app accesses browser features, run it behind a local web server:

```bash
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

## How to use

1. Choose **Recognition Source**:
   - Keep **Webcam** if camera access works.
   - Use **Photo Upload** if camera access is blocked (for example in remote/headless environments).
2. Enroll employees with an ID and name.
3. Use **Check In** or **Check Out** while the same face is visible (camera) or uploaded (photo mode).

## Important production notes

This project is a demo/prototype.

For real company deployment, you should add:

- secure backend database (not `localStorage`)
- user/admin authentication and role-based access
- liveness checks / anti-spoofing
- audit logs and monitoring
- biometric consent and privacy-law compliance in your jurisdiction
