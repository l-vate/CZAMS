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
The backend sends selected booking, payment, reschedule, job, back-job, and service-reminder notifications by email when Brevo or SMTP is configured. On Render, use the Brevo HTTPS API so delivery does not depend on outbound SMTP ports:

1. In Brevo, verify a sender email address (or authenticate your sending domain).
2. In Brevo, open **Settings → SMTP & API → API keys** and create an API key.
3. In Render's backend service environment settings, set `BREVO_API_KEY` to that API key and `SMTP_FROM` to the verified sender address (for example, `CZAMS <notifications@yourdomain.com>`). Do not use the SMTP key or your account password for `BREVO_API_KEY`.
4. Redeploy or restart the backend. When `BREVO_API_KEY` is configured, the backend sends through `https://api.brevo.com/v3/smtp/email` over HTTPS; it takes precedence over SMTP.

For local development or hosts that allow outbound SMTP, the SMTP settings in `server/.env.example` remain available as a fallback when `BREVO_API_KEY` is unset. Email delivery uses a persistent queue and retries temporary failures; in-app notifications continue to work independently of email delivery. Never commit `server/.env` or share either key.

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
