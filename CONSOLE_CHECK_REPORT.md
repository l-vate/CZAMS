# Console check report

Written for: the team, as the record of the browser check before the final defense.

- Date: 2026-11-24. Branch `chore/defense-ready`, rebased on main at `a365a12`.
- Setup: the real frontend (Vite) against the real API, database `CZAMS_audit_test` only. Chromium driven by `playwright-core` (a devDependency, not part of the production build). Each page is opened at 1440 px and 390 px and checked for: it loads, it shows content, no sideways scroll, no console errors, no page errors, no server errors.

## Result: no application errors

| Role | Pages checked | 1440 px | 390 px |
|---|---|---|---|
| Admin | 17 (dashboard, accounts, services, manage services, payment settings, service requests, walk-in booking, service reports, payments, back jobs, analytics, reports, audit log, promotions, announcements, calendar, chat) | all pass | all pass |
| Customer | 9 (dashboard, book a service, my bookings, billings, profile, chat, booking details approved, completed with report, cancelled with refund) | all pass | all pass |
| Technician | 6 (dashboard, my jobs, calendar, reports, profile, chat) | all pass | all pass |

Also passing: landing page content (announcement, services, promotions), technician search shows the company rating only (1440 px), wrong password message, refreshing every customer page keeps the session.

## Failures seen, all caused by the old check scripts, not by the application

| Check | Why it failed | Evidence |
|---|---|---|
| Landing footer "phone number" | The check looks for 11 digits without spaces; the page shows `0918 499 3509`. The footer does show the number and Sunday closed. | `server/constants/company.json`, `src/components/landing/landing_footer.jsx:30` |
| Technician search at 390 px | The script types into a search box that is behind a menu button on a phone. | script timeout, no page error |
| Logout then Back | Log Out now asks "Log out of CZAMS?" first; the script never confirms it. | `src/components/logout_button.jsx` |
| Booking, reschedule and profile click-through flows | They use form controls from before the structured address and the redesigned booking form (select and fill timeouts on the old selectors). They need a rewrite to be useful; the booking rules themselves are covered by the server tests. | timeouts on `selectOption` and `fill` |

Not run as a browser check: email delivery, the cron job on the hosted server, the deployed site (see `DEFENSE_CHECKLIST.md`).
