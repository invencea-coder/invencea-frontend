# InvenCEA Frontend

React + Vite frontend for the InvenCEA Inventory Management System, built with a **Neumorphism UI** using the deep burgundy/crimson color scheme.

## Stack
- **Framework**: React 18 + Vite 5
- **Styling**: TailwindCSS 3 + custom Neumorphism CSS
- **Routing**: React Router v6
- **HTTP**: Axios (with JWT interceptor)
- **Realtime**: Socket.IO client
- **QR**: @zxing/library (camera + file upload + BLE/kiosk)
- **Notifications**: react-hot-toast
- **Date handling**: date-fns
- **Icons**: lucide-react

---

## Quick Start

### 1. Install
```bash
cd frontend
npm install
```

### 2. Configure
```bash
cp .env.example .env
```

### 3. Start dev server
```bash
npm run dev
```
Runs at http://localhost:5173 (proxies to backend on port 4000).

---

## Design System

### Neumorphism Color Scheme
| Token        | Light         | Dark          |
|--------------|---------------|---------------|
| `surface`    | `#FDF5F5`     | `#3D0B0B`     |
| `highlight`  | `#FFFFFF`     | `#521212`     |
| `shadow`     | `#E8D5D5`     | `#2A0707`     |
| `textPrimary`| `#4A0000`     | `#FADADA`     |
| `accent`     | `#8B1A1A`     | —             |
| `muted`      | `#C4A0A0`     | `#A06060`     |

### CSS Classes
- `.neu-card` — Neumorphic card (extruded)
- `.neu-inset` — Neumorphic inset (recessed)
- `.neu-btn` — Neumorphic button
- `.neu-btn-primary` — Primary CTA button (dark burgundy)
- `.neu-input` — Neumorphic text input
- `.otp-input` — OTP digit input
- `.sidebar-link` — Sidebar nav link
- `.neu-table` — Table with neumorphic rows
- `.badge-*` — Status badges (pending, approved, issued, returned, rejected)

### Typography
- **Display/headings**: Playfair Display (serif)
- **Body/UI**: DM Sans (sans-serif)
- **Monospace/codes**: DM Mono

---

## User Journeys

### Admin
1. Navigate to `/` → select Admin → lands on `/login/faculty` (OTP login)
2. Dashboard → Inventory, Requests, Reports, Rooms

### Faculty
1. `/login/faculty` → enter Gmail → `/login/faculty/otp` → 6-digit OTP with 2-min countdown
2. Dashboard → New Request (with same-day schedule picker) → My Requests (with QR scanner)

### Student
1. `/login/student` → Full Name + Student ID
2. Dashboard → New Request (no schedule) → My Requests (with QR scanner)

---

## QR Scanner Integration
- **Camera mode**: Uses `@zxing/library` `BrowserQRCodeReader` to scan live
- **File upload**: Decodes QR from uploaded image
- **BLE/Kiosk**: Listens for keyboard input (scanner sends as keystrokes, Enter terminates)

---

## Folder Structure
```
src/
├── api/           axios API modules per domain
├── components/
│   ├── ui/        NeumorphCard, NeumorphButton, NeumorphInput, NeumorphModal
│   ├── layout/    Sidebar, Navbar, DashboardLayout
│   └── qrcode/    QRScanner, QRUploader
├── context/       AuthContext (JWT + session restore)
├── hooks/         useAuth, useSocket
├── pages/
│   ├── auth/      LoginSelect, FacultyLogin, OTPVerification, StudentLogin
│   ├── admin/     AdminDashboard, Inventory, Requests, Reports, RoomSettings
│   ├── faculty/   FacultyDashboard, NewRequest, MyRequest
│   └── student/   StudentDashboard, NewRequest, MyRequest
├── styles/        neumorphism.css
└── utils/         date.js, export.js, format.js
```
