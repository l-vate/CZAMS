# CZAMS

Aircon Service Booking and Technician Management System

Designed for **Cooling Zone Aircon Maintenance Services**.

## 1. System Overview

CZAMS is a full-stack web platform for booking and managing aircon maintenance work. Customers book services online, admins review and schedule requests, and technicians receive and complete jobs, all in one system.

### About the Project

CZAMS covers the whole service cycle: booking, scheduling, quotation, payment, job completion, service reports, back jobs, and service reminders. Three roles use the system, each with its own dashboard:

* **Customer:** books services, tracks bookings, pays and views billings, chats with the shop.
* **Staff (technician):** views assigned jobs and the calendar, submits service reports.
* **Admin:** manages requests, walk-in bookings, services, promotions, announcements, accounts, payments, back jobs, analytics, and the audit log.

Chat and the "needs attention" counters refresh by periodic polling from the React client to the Express API. No WebSocket or SSE layer is used.

> **Note: Two Independent Apps**
> The frontend (repo root) and the backend (`server/`) live in one Git repository but are installed, run, and deployed separately. Each has its own `package.json` and `node_modules`. There is no shared workspace or unified build.

### Deployment Targets

* **Frontend:** Vercel, a React + Vite single page application (`vercel.json` rewrites all routes to `index.html`). Live site: https://czams.vercel.app
* **Backend:** Render, an Express 5 REST API.
* **Database:** MongoDB Atlas.
* **Source Control & CI:** GitHub, with a dependency audit workflow (`.github/workflows/audit.yml`).

### Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, React Router 7, React Icons, plain CSS |
| Frontend tooling | Vite (build), ESLint (lint) |
| Backend | Node.js (>= 20.9), Express 5 |
| Authentication | JWT (jsonwebtoken), bcryptjs |
| Security | Helmet, CORS |
| File uploads | Multer, Sharp |
| Scheduled jobs | node-cron |
| Email | Nodemailer with Brevo SMTP |
| Backend tooling | node:test (tests), nodemon (dev) |
| Database | MongoDB (Atlas) with Mongoose |
| File storage | GridFS in production, local disk in development |
| Hosting | Vercel (frontend), Render (backend) |
| Source control & CI | GitHub, dependency audit workflow |

## 2. File Structure

```text
CZAMS/
├── src/                    # React frontend (SPA)
│   ├── pages/              # admin/, staff/, customer/, public/ screens
│   ├── components/         # Shared UI components
│   ├── hooks/              # Shared React hooks
│   ├── services/           # API calls
│   ├── config/             # API base URL and app config
│   └── utils/              # Helpers
├── public/                 # Public assets
├── server/                 # Express API
│   ├── routes/             # REST route modules
│   ├── models/             # Mongoose models
│   ├── middleware/         # Auth, validation, error handling
│   ├── jobs/               # Scheduled jobs (booking status, reminders, ID photo retention)
│   ├── scripts/            # Maintenance, seed, and audit scripts
│   ├── test/               # Backend tests (node:test)
│   └── server.js           # API entry point
├── docs/                   # Audit and review documentation
├── .github/workflows/      # CI (dependency audit)
├── .env.example            # Frontend environment template
├── server/.env.example     # Backend environment template
├── vercel.json             # Vercel routing configuration
├── package.json            # Frontend scripts and dependencies
└── README.md               # This document
```

## 3. Prerequisites

* **Node.js:** v20.9 or higher (LTS)
* **npm:** v10.x or higher
* **MongoDB:** MongoDB Atlas cluster (or a local MongoDB instance)

## 4. Quick Start & Local Development

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/l-vate/CZAMS.git
cd CZAMS
npm install
cd server
npm install
cd ..
```

### 2. Configure Environment Variables

Copy both templates to create your local `.env` files:

```bash
cp .env.example .env
cp server/.env.example server/.env
```

Update `MONGO_URI` and `JWT_SECRET` in `server/.env` with your own values. `JWT_SECRET` should be at least 32 random characters.

> Do not commit `.env` files to GitHub.

### 3. Run Development Servers

In separate terminals:

```bash
# Start the Express backend (runs on http://localhost:5000)
cd server
npm run dev

# Start the React frontend (runs on http://localhost:5173)
npm run dev
```

### Optional Email Notifications (Brevo)

The backend sends selected booking, payment, reschedule, job, back-job, and service-reminder emails when SMTP is configured. To enable Brevo:

1. In Brevo, verify a sender email address (or authenticate your sending domain).
2. Open **Settings → SMTP & API → SMTP** and obtain the SMTP login and SMTP key. Use the SMTP key here, not your API key or account password.
3. In `server/.env`, set `SMTP_USER` to the Brevo SMTP login, `SMTP_PASS` to the SMTP key, and `SMTP_FROM` to the verified sender address (for example, `CZAMS <notifications@yourdomain.com>`).
4. Keep `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, and `SMTP_SECURE=false`, then restart the backend.

For deployment, set the same values in the backend host's environment-variable settings. Email delivery uses a persistent queue and retries temporary failures; in-app notifications work independently of email. Never commit `server/.env` or share the SMTP key.

## 5. Root Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server (frontend) |
| `npm run build` | Build the frontend for production (`dist/`) |
| `npm run preview` | Preview the production frontend build |
| `npm run lint` | Run ESLint on the frontend |
| `cd server && npm run dev` | Start the Express API in watch mode (nodemon) |
| `cd server && npm test` | Run backend tests |

## 6. Key Endpoints

**Frontend App:** `http://localhost:5173`

* `/login`, `/register`, `/forgot-password`, `/reset-password`: public pages
* `/customer/*`: customer dashboard, booking, bookings list, billings, profile, chat, notifications
* `/staff/*`: technician dashboard, jobs, calendar, reports, profile, chat, notifications
* `/admin/*`: admin dashboard, requests, services, payments, back jobs, analytics, reports, audit log, promotions, announcements, accounts, chat

**Backend API:** `http://localhost:5000/api`

* **Health Check:** `GET /api/health`

### API Routes

The backend routes below use the `/api` prefix:

| Route | Description |
| --- | --- |
| `/auth` | Register, login, and password reset |
| `/users` | User profiles and account management |
| `/services` | Service catalog |
| `/bookings` | Bookings, plus email status, scope lines, unit requests, and quotations |
| `/supplied-units` | Customer supplied units |
| `/reports` | Technician service reports |
| `/backjobs` | Back job requests |
| `/service-reminders` | Service reminders |
| `/notifications` | In-app notifications |
| `/announcements` | Announcements |
| `/payment-settings` | Payment settings |
| `/chat` | Customer, staff, and admin chat |
| `/teams` | Technician teams |
| `/promos` | Promotions |
| `/availability`, `/closures`, `/technician-off` | Scheduling availability, shop closures, technician days off |
| `/audit-log` | Admin audit log |
| `/admin` | Admin "needs attention" summary |
| `/files` | Uploaded files |

Access is role based (`admin`, `staff`, `customer`) and enforced by the backend on every protected route. Passwords are stored as bcrypt hashes, and authentication uses JWT. Set `JWT_SECRET` in the environment; there is no built-in fallback secret.

### Scheduled Jobs

The backend runs these jobs with node-cron:

| Job | Purpose |
| --- | --- |
| `bookingStatusJob` | Updates booking statuses automatically |
| `serviceReminderJob` | Sends service reminders |
| `serviceTomorrowReminderJob` | Sends next-day service reminders |
| `idPhotoRetentionJob` | Removes ID photos after the retention period |

## 7. Deployment

Configure environment variables on each hosting platform:

* **Render (backend):** set `MONGO_URI`, `JWT_SECRET`, `NODE_ENV=production`, `CORS_ORIGINS` (exact https frontend origins, required in production), `TRUST_PROXY`, `APP_URL`, and the SMTP values. Uploaded files are kept in the database (`FILE_STORE=gridfs`) so they survive a host restart.
* **Vercel (frontend):** set `VITE_API_URL` to the deployed backend URL.

See `server/.env.example` for the full list of backend variables.

## 8. Git Workflow

Create a branch before making changes:

```bash
git checkout -b feature/your-feature
```

Commit and push:

```bash
git add .
git commit -m "Describe your changes"
git push -u origin feature/your-feature
```

Submit changes through a **Pull Request**.
