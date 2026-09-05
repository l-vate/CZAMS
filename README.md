# CZAMS — Cooling Zone Aircon Management System

A web-based service and technician management system developed for **Cooling Zone Aircon Services**.

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
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
```

> Do not commit `.env` to GitHub.

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