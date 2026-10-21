# CZAMS - Cooling Zone Aircon Maintenance Services

A web-based service and technician management system developed for **Cooling Zone Aircon Maintenance Services**.

## Tech Stack

* **Frontend:** React + Vite
* **Backend:** Node.js + Express
* **Database:** MongoDB
* **Styling:** CSS + Bootstrap
* **Version Control:** Git + GitHub

## Project Structure

```text
CZAMS/
├── src/              # React frontend
├── public/            # Public assets
├── server/            # Node.js/Express backend
├── package.json
└── README.md
```

## Setup

### 1. Clone the repository

```bash
git clone <REPOSITORY-URL>
cd CZAMS
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Install backend dependencies

```bash
cd server
npm install
cd ..
```

### 4. Configure environment variables

Create a `.env` file inside the `server/` directory.

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
```

> Do not commit `.env` to GitHub.

### Optional email notifications (Brevo)

The backend sends selected booking, payment, reschedule, job, back-job, and service-reminder notifications by email when SMTP is configured. To enable Brevo:

1. In Brevo, verify a sender email address (or authenticate your sending domain).
2. Open **Settings → SMTP & API → SMTP** and obtain the SMTP login and SMTP key. Use the SMTP key here, not your API key or account password.
3. Copy `server/.env.example` to `server/.env` and fill `SMTP_USER` with the Brevo SMTP login, `SMTP_PASS` with the SMTP key, and `SMTP_FROM` with the verified sender address (for example, `CZAMS <notifications@yourdomain.com>`).
4. Keep `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, and `SMTP_SECURE=false`, then restart the backend.

For deployment, configure the same values in the backend host's environment-variable settings. Email delivery uses a persistent queue and retries temporary failures; in-app notifications continue to work independently of email delivery. Never commit `server/.env` or share the SMTP key.

## Running the Project

The frontend and backend run separately.

### Frontend

From the project root:

```bash
npm run dev
```

Usually available at:

```text
http://localhost:5173
```

### Backend

Open a second terminal:

```bash
cd server
npm start
```

Usually available at:

```text
http://localhost:5000
```

## Deployment

The recommended deployment setup is:

* **Frontend:** Vercel
* **Backend:** Render
* **Database:** MongoDB Atlas

For production, configure the appropriate environment variables on the hosting platforms and update the frontend API URL to point to the deployed backend.

## Git Workflow

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
