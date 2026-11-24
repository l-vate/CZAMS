# CZAMS defense checklist

Written for: the three team members preparing the deployed site and the backup plan for the final defense.

Rule for everything below: never paste a password, the Atlas connection string or the JWT secret into chat, slides or screenshots.

## Already done on the code side (branch `chore/defense-ready`)

- Server tests pass, the frontend builds, lint has 6 known older errors that do not affect the system.
- The page console check found no console, page or server errors on 17 admin, 9 customer and 6 technician pages, at 1440 and 390 pixels.
- Demo data and `DEMO_SCRIPT.md` are ready (test database only).

## You do these yourselves (we cannot do them from the code)

- [ ] Rotate the Atlas database password and `JWT_SECRET` from the Atlas and Render dashboards. The old values are still in the git history. After rotating, update `MONGO_URI` and `JWT_SECRET` on Render and redeploy, then log in again.
- [ ] Confirm the deployed site is the build you want to show (the merged main, or this branch if the team merges it).

## The day before

Deployed site (Vercel frontend, Render API, Atlas database):

- [ ] **Render wake-up (cold start).** Open `https://<your-api>.onrender.com/api/health`. It should answer `{"status":"ok", ...}`. A sleeping free service can take 30 to 60 seconds the first time. Write down how long it took.
- [ ] **Atlas network access.** Atlas, Network Access: the Render service must be allowed (a free Render service has no fixed address, so the usual setting is "Allow access from anywhere", `0.0.0.0/0`). Check that the Render logs show `MongoDB connected` and no connection errors.
- [ ] **Environment on Render.** `NODE_ENV=production`, `CORS_ORIGINS` is exactly the Vercel address (https, no trailing slash), `APP_URL` is the Vercel address, `TRUST_PROXY=1`, `FILE_STORE=gridfs`. The server refuses to start without `CORS_ORIGINS`: check the logs.
- [ ] **Vercel.** `VITE_API_URL` points to the Render address. Open the site in a private window: landing page loads, services and prices show, no red errors in the browser console (F12).
- [ ] **Email.** Set the Brevo mail settings on Render (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`; the sender must be verified in Brevo). Make a test booking with a real inbox you can open and check that the "booking received" email arrives. If the log says "Email delivery is disabled", the settings are missing.
- [ ] **Cron jobs.** The Render log, a few seconds after a start, shows a line `Day start job: N expired, N started`. That proves the job runs. Jobs run at 00:05 and at minute 20 of every hour (Asia/Manila). A free service that sleeps misses runs and catches up at the next wake-up, so on the day, wake it early. To test by hand, an admin can run the status check (the admin route `POST /api/bookings/status-check/run`).
- [ ] **Uploads.** As a customer, upload a payment proof (JPG or PNG) and a photo to a booking; as the admin, open the proof. Upload a service report signature as a technician. Files live in MongoDB (GridFS), so they survive a Render restart. Check that the Atlas storage is not full (the free tier is small).
- [ ] **Mobile view.** Open the site on a real phone: landing, login, booking form, customer bookings, technician jobs. Check there is no sideways scrolling and buttons are easy to tap.
- [ ] **Accounts.** One admin, technician and customer account for the demo exist on the deployed site, with passwords you know. Do not use the real owner account for a demo with panelists.
- [ ] **Data.** Decide which data the panel will see. The deployed database must not hold real customers' private data on a screen shared with the panel. If you want the demo data online, point a separate Render service at `CZAMS_audit_test` and rehearse on that one.
- [ ] Print or save a PDF copy of the paper and `DEMO_SCRIPT.md`. Charge the laptop and bring the charger.

## Ten minutes before

- [ ] **Open the deployed site 10 minutes early and click through it once**: landing page, then log in as the admin, a technician and a customer and open one page each. This wakes the Render server (a free service sleeps) and warms every account's first request.
- [ ] **If the "Connection problem" banner appears** (for example at the top of a chat), the server is still waking up or the last refresh failed. Wait **30 seconds, then refresh the page**. It clears by itself on the next successful refresh.

## One hour before

- [ ] Wake the API: open `/api/health` and wait for `ok`. Then log in once as each role (admin, technician, customer) so the first request is already warm.
- [ ] Open the four windows listed in `DEMO_SCRIPT.md` and log each one in.
- [ ] Check the clock and the time zone of the laptop (the demo uses Manila dates).
- [ ] Re-seed if you demo on the test database: `node scripts/seedDemoData.js --apply` (from the `server` folder). Check the printed booking ids.
- [ ] Do a full dry run of the demo once, then re-seed again so the data is fresh.
- [ ] Check internet speed and have a phone hotspot ready.
- [ ] Close other programs, silence notifications, set browser zoom so the text is readable from the back of the room.
- [ ] Have a small JPG, a PNG, and a 13 digit reference number ready in a text file.

## Backup plan

1. **Local run against the test database** (no internet needed for the app itself, only for the database):
   ```
   cd server
   node scripts/seedDemoData.js --apply
   node scripts/auditServer.js          # API on port 5055, test database only
   ```
   In another terminal, from the project root: `$env:VITE_API_URL = "http://127.0.0.1:5055"; npm run dev`, then open `http://localhost:5173`. Your logins are the ones in `server/.demo-accounts.json`; the commercial clients are in `server/.demo-credentials.json`.
   `auditServer.js` refuses any database other than `CZAMS_audit_test` and never reads `server/.env`.
2. **Screen recording.** Before the defense, record the whole demo once (Windows: Win + G, or OBS) at 1080p with the microphone off, and save it on the laptop and on a USB drive. Name it `czams-demo-backup.mp4`. If the live demo fails, say "we have a recording of the same flow" and play it.
3. **Paper figures.** The screenshots in the paper are the last fallback.
4. **If a step fails in the middle:** say what it should do, switch to the fallback written under that step in `DEMO_SCRIPT.md`, and move on. Do not debug in front of the panel.

## Likely panel questions (short answers)

- *Why no payment gateway?* The client pays outside the system by GCash or bank transfer; the admin verifies the proof and reference number, and a booking cannot be approved until then.
- *What stops double booking?* A Pending booking holds its date and time block, and a technician cannot be on two bookings in the same block.
- *What happens to a Pending booking nobody approves?* It is cancelled automatically at the start of its booked day.
- *Who can change a status?* Only the system (start of the service day, report submission) and the admin for approval or cancellation. There are no manual In Progress or Completed buttons.
- *Is the data safe?* Passwords are hashed with bcrypt, logins are rate limited and say the same thing for an unknown email or a wrong password, each role is checked on the server before any upload is read, and ID photos are deleted 30 days after the booking ends.
