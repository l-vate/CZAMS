# CZAMS live demo script (10 to 12 minutes)

Written for: the presenter and the two teammates who drive the demo, on the day of the final defense.

The demo runs against the TEST database `CZAMS_audit_test`, never the real one. Figure numbers are the paper's (4.1 to 4.9).

## Before you start (once, 15 minutes before)

1. Load the demo data (this wipes only `CZAMS_audit_test` and builds it again, so it is safe to repeat):
   ```
   cd server
   $env:DEMO_PASSWORD = "choose-a-password-you-will-remember"   # optional; without it every account gets a random password
   node scripts/seedDemoData.js --apply
   ```
   It prints the demo booking ids. Without `DEMO_PASSWORD`, the passwords are in `server/.demo-credentials.json` (git ignored). Never put a password on a slide.
2. Start the API against the test database: `node scripts/auditServer.js` (port 5055). Start the site with `VITE_API_URL=http://127.0.0.1:5055` and `npm run dev` (or use the deployed site if its API points at the test database).
3. Open four browser windows (use separate profiles or private windows so the logins do not mix): Landing, Customer, Admin, Technician. Log each one in before the demo starts.
4. Keep a small JPG or PNG ready for the payment proof (under 8 MB), and a 13 digit number for the GCash reference, for example `1234567890123`.
5. If anything goes wrong in the middle of the demo and the data gets messy, run the seed command again. It resets everything in under a minute.

## Accounts

All emails end in `@example.test`.

| Role | Login | Used for |
|---|---|---|
| Admin (owner) | `adm9001` | queue, payments, approvals, dashboard, reports, back jobs, refunds |
| Technician 1 | `stf9001` | calendar and jobs (lead on several jobs) |
| Technician 2 | `stf9002` | the service report with the e-signature (primary technician of the In Progress job) |
| Technicians 3 and 4 | `stf9003`, `stf9004` | helpers; show the workload table |
| Regular customer | `cus9001` | the live booking, status, notifications, warranty claim, cancellation and refund |
| Return customer | `cus9003` | return customer privileges, Senior/PWD request (read only) |
| Commercial client | `cus9004` | VAT, PO number, payment terms of 7 days (read only) |
| Sample Hospital (commercial) | `cus9101` | the commercial installations, VAT added on top, PO numbers, 7 day terms (Return customer: 4 completed jobs in 12 months) |
| Sample Inn (commercial) | `cus9102` | one commercial installation, fully paid (Regular customer) |

## The demo bookings (ids carry the current year; the seed prints the real ones)

| Id | What it is |
|---|---|
| `CZ-YYYY-9001` | Pending, technicians already proposed (Regular customer) |
| `CZ-YYYY-9002` | Pending, no payment: approval must be refused |
| `CZ-YYYY-9017` | Pending, GCash proof waiting to be verified |
| `CZ-YYYY-9011` | Pending, Senior/PWD request waiting for the admin |
| `CZ-YYYY-9004` | Approved (Regular customer): cancel and refund |
| `CZ-YYYY-9005` | In Progress today, primary technician Demo Technician 2: service report |
| `CZ-YYYY-9801` | Completed cleaning 3 days ago (Regular customer): warranty claim |
| `CZ-YYYY-9007` | Cancelled, refund waiting |
| `CZ-YYYY-9009` | Cancelled, refund already processed |
| `CZ-YYYY-9022` | Commercial client, Completed: price 2,400.00 + 12% VAT 288.00 = 2,688.00, inside its 7 day terms |
| `CZ-YYYY-9301` to `9308` | The 8 sample commercial installations (7 for Sample Hospital, 1 for Sample Inn). 9304 is Completed with its balance still due, 9305 Approved, 9306 Pending (in the queue), 9307 In Progress, the others Completed and paid |

## Run of show

### 1. Landing page (1 minute) - no login
Open `/`. Point out: announcement, services with starting prices, active promotions, the contact footer (phone, email, address, Sunday closed). Type "Demo Technician" in the search: it shows the company rating and recent reviews, not individual profiles (privacy by design).
*Fallback:* if the search box does not open, show the services and promotions and say the search is in the top bar.

### 2. Customer booking (3 minutes) - `cus9001`, Figures 4.1 to 4.1.7
Go to Book a Service.
1. Pick Cleaning. Answer "not cleaned for 6 months or more": it selects Deep Cleaning. Say the other two answers: leaking now means pull-down deep cleaning, otherwise regular cleaning. The price shows right away.
2. Add two unit lines (for example Split Type x2 and Window Type x1) with brand and horsepower. Mention the optional model number and photo or short video.
3. Address: fill the separate fields. Type a 3 digit ZIP to show the "exactly 4 digits" message, then fix it. Mention that a city outside Quezon City or Manila is flagged for the admin and the booking still goes through.
4. Date: show that today plus 2 days is refused (3 days notice), a Sunday is refused, and the closure date (shown in the landing announcement) is refused. Pick a date at least 3 days ahead and choose Morning (8:00 AM to 12:00 PM) or Afternoon (1:00 PM to 6:00 PM).
5. Payment: choose a down payment option (30, 50 or 100 percent). Only GCash and Bank Transfer are offered online. Upload the proof and type the 13 digit reference.
6. Confirm. The booking is Pending and holds its date and time block. Say: a customer can have at most 3 Pending bookings.
*Fallback:* if the form refuses the date, pick another weekday that is not the closure date. If the upload fails, use a smaller image. If the whole page fails, show booking `9001` in My Bookings and explain the steps from the paper figures.

### 3. Admin: Pending queue, payment and auto-assign (2 minutes) - `adm9001`, Figures 4.2 and 4.3
1. Bookings, tab Pending queue. Each row shows how many technicians are free for that date and block. Use Up, Down and Top on a row.
2. Open the new booking. Show the technicians the system proposed (requested technician first if free, otherwise the lightest workload). Mention that nothing is moved when no one is free: it suggests up to 3 later dates.
3. Try to approve `9002` (no payment): it is refused until the down payment is verified.
4. Payments: verify the proof of `9017` (or of the new booking), then approve it. Say there is no manual In Progress or Completed button: the system starts a job on its service day and completes it when the primary technician submits the report.
5. Senior/PWD: open `9011`, view the ID, approve the 20 percent discount. Say it applies to the unit price and the down payment, not to the distance charge, and the ID photo is deleted 30 days after the booking ends.
*Fallback:* if Approve is refused for a technician conflict, assign a different technician from the list, or pick `9001`, which already has proposed technicians.

### 4. Technician: jobs and service report (2 minutes) - `stf9002`, Figures 4.4 and 4.5
1. My Jobs and Calendar: show the schedule and the admin notes for the technician. Mention disruption and extension requests (the admin is notified, an extension needs approval).
2. Open job `9005` (In Progress today) and Submit Service Report: work summary, parts used, labor hours, issue resolution, follow-up, recommendations, pre-existing issue flag. Have the client sign on the screen with the finger or mouse and type the name. Submit.
3. Show that the booking is now Completed and the report can be printed as a PDF with the company header and logo. Warranty starts now.
*Fallback:* if the signature pad does not respond, use the option to upload a photo of the signed paper form. If the report page errors, show an existing report in Reports (`stf9001`) and the PDF from there.

### 5. Customer: status and notifications (1 minute) - `cus9001`, Figures 4.6 and 4.7
Show My Bookings (statuses), the notification bell (approved, payment verified, report ready), and the booking details. Say there are reminders 1 day before service and 3 months after a cleaning, in the app and by email for selected ones.
*Fallback:* if email is not set up on this machine, say so: emails need the mail settings of the deployed server, the in-app bell works anyway.

### 6. Admin: dashboard and reports (1.5 minutes) - `adm9001`, Figures 4.8 and 4.9
1. Dashboard: summary cards, technician workload table, the three charts (requests per month, bookings by status, completed jobs per technician). Switch the client type filter to Commercial: the cards and charts change, the workload table does not.
2. Reports: pick one of the six (service requests, technician performance, customers, payments, back jobs and warranty claims, cancelled bookings), set a date range, then Print (PDF with company header) and CSV export. Mention the audit log shows who did what.
*Fallback:* if a chart is empty, widen the date range to the last 6 months. If printing fails, show the CSV.

### 6b. Commercial client: 12% VAT added on top (1 minute) - `cus9101`, then `adm9001`
This is the paper rule: standard prices do not include VAT, and the system adds 12% on top for a commercial client. Every one of the sample bookings works this way; none uses the "prices include VAT" option.
1. As Sample Hospital, open Billings, then booking `9304` (nurse station, Completed). Read the payment box out loud: **Total Price 65,000.00 + VAT (12%) 7,800.00 = Total incl. VAT 72,800.00**, with the PO number and "Payment Terms: 7 days after completion". Open the invoice: it carries the PO number, the VAT line and the terms.
2. Say the same holds for the other sample jobs, each shown as price + VAT = total billed:
   | Booking | Price | VAT 12% | Total billed |
   |---|---|---|---|
   | 9301 | 54,500.00 | 6,540.00 | 61,040.00 |
   | 9302 | 76,500.00 | 9,180.00 | 85,680.00 |
   | 9303 | 102,800.00 | 12,336.00 | 115,136.00 |
   | 9304 | 65,000.00 | 7,800.00 | 72,800.00 |
   | 9305 | 55,250.00 | 6,630.00 | 61,880.00 |
   | 9306 | 63,350.00 | 7,602.00 | 70,952.00 |
   | 9307 | 96,500.00 | 11,580.00 | 108,080.00 |
   | 9308 (Sample Inn) | 185,500.00 | 22,260.00 | 207,760.00 |
3. As the admin, open `9304`: the VAT (12%) row, the PO number, the payment terms and the Remaining Balance of 72,800.00. Point at "Record the balance": the admin can record cash or cheque received in person (only the admin can; a technician never sees payments). Payment terms of 7 to 10 days are set by the admin only.
4. Say there is no down payment because the client is on terms; the 72,800.00 falls due within 7 days of the service, and it is still inside its terms today.
*Fallback:* if the sample jobs are missing, use `9022` with `cus9004`: 2,400.00 + 288.00 VAT = 2,688.00 due within 7 days.

### 7. Warranty claim to back job (1 minute) - `cus9001`, then `adm9001`
1. As the customer, open booking `9801` (cleaning finished 3 days ago, inside the 1 week leak warranty) and file a back job with a short description.
2. The system checks the warranty and creates a free visit in Pending with its own back job category. As the admin, open Back Jobs: the claim is Covered and the visit is in the queue.
3. Mention the windows: cleaning 1 week (leaks), leak repair 1 month, installation 6 months (CZAMS unit) or 3 months (client unit, with a signed waiver). Outside the window the claim is Not Covered.
*Fallback:* if the claim button is missing, the 7 day window may have passed on a seed made days ago: run the seed again.

### 8. Cancellation and refund (1 minute) - `cus9001`, then `adm9001`
1. As the customer, open Approved booking `9004` and cancel it. In Progress bookings cannot be cancelled by the customer.
2. As the admin, Payments, Refunds: the full down payment is the refund. Upload a proof of refund and mark it processed. Mention a deduction only when the customer was not available or the crew was already on the way, never more than the down payment, and an owner cancellation is always a full refund.
*Fallback:* if the cancel button is missing, use `9007`, which already has a refund waiting, and start from the admin side.

## Closing line
"Every rule in the paper is enforced by the server, not just the screen: dates, payments, staffing, warranty and refunds."

## If everything fails
Play the screen recording described in `DEFENSE_CHECKLIST.md` and walk through the paper figures.
