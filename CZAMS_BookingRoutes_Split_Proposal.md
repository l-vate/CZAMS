# Proposal: splitting `server/routes/bookingRoutes.js`

Status: **proposal only. Nothing has been split.** The file is 1,976 lines, 34 routes and 9 helpers, mounted once at
`app.use('/api/bookings', require('./routes/bookingRoutes'))` ([server.js:17](server/server.js#L17)).

## Why split

- One file owns the booking lifecycle, payments, refunds, scheduling changes, assignment, discounts, queue and
  technician views. Reviewing or testing one area means loading all of it.
- `PATCH /:bookingId/admin-update` alone is about 210 lines and mixes status rules, payment verification, charges and
  notifications.
- Five routes share one multer upload and four helpers are used across unrelated areas, so the shared pieces are easy to
  see and can move out first.

## The one thing that must not change: route order

Express matches routes in the order they are registered. `GET /:bookingId` ([bookingRoutes.js:628](server/routes/bookingRoutes.js#L628))
would swallow `GET /mine`, `/queue`, `/busy-technicians`, `/technician-workload` and `/public/feedback-summary` if it were
registered first. Today the static GET paths come first. After a split, an index router must mount the modules in a fixed
order: every module that owns a **static** path first, the module that owns `GET /:bookingId` last. A smoke test that hits each
static GET path (the API smoke script already does) catches a mistake here immediately.

## Proposed modules

All new files live in `server/routes/bookings/`. `bookingRoutes.js` becomes a small index that creates the router, mounts the
modules below in the order given, and is still the only thing `server.js` requires (so `server.js` does not change).

| # | Module | Routes (current line) | Helpers it owns |
|---|---|---|---|
| 1 | `shared/upload.js` (not a router) | none | the multer `storage` / `upload` setup (lines 50 to 80), used by routes in modules 3, 5 and 6 |
| 2 | `shared/serializers.js` (not a router) | none | `withWarranty` (46), re-exports `ASSIGNMENT_POPULATE`; `withWarranty` is called by 20+ routes |
| 3 | `create.routes.js` | `POST /` (262) | `isDateAllowed` (85), `normalizeContactNumber` (101); the booking-ID retry already lives in `utils/bookingId.js` |
| 4 | `lists.routes.js` (static GETs) | `GET /` (1180), `/mine` (535), `/queue` (579), `/busy-technicians` (558), `/technician-workload` (596), `/technician/mine` (1020), `/technician/mine/stats` (1037), `/public/feedback-summary` (175), `/technicians/:id/feedback` (223), `POST /status-check/run` (207) | `todayDateString` (128) |
| 5 | `payments.routes.js` | `PATCH /:bookingId/pay` (692), `/pay-balance` (714), `/unit-purchase-proof` (872) | none |
| 6 | `refunds.routes.js` | `PATCH /:bookingId/refund` (1675), `/refund/flag` (1732), `/refund/flag/resolve` (1777) | `openRefundIfEligible` (141), shared with cancel and admin-update, so it moves to `shared/refunds.js` |
| 7 | `discounts.routes.js` | `PATCH /:bookingId/discount/approve` (739), `/discount/reject` (804) | none |
| 8 | `scheduling.routes.js` | `PATCH /:bookingId/reschedule` (896), `/reschedule/approve` (1205), `/reschedule/deny` (1264), `/disruption/report` (1079), `/disruption/reschedule` (1813), `/extension/request` (1128), `/extension/approve` (1872), `/extension/deny` (1914) | `notifyMembers` (123, used only by the extension and disruption routes) |
| 9 | `assignment.routes.js` | `PATCH /:bookingId/assign` (1396), `POST /:bookingId/auto-assign` (1425), `PATCH /:bookingId/queue` (852) | `performAssignment` (1310), `ASSIGN_RESPONSE_POPULATE` (1388) |
| 10 | `feedback.routes.js` | `PATCH /:bookingId/feedback` (971) | `FEEDBACK_EDIT_WINDOW_MS` (969) |
| 11 | `admin.routes.js` | `PATCH /:bookingId/admin-update` (1461), `PATCH /:bookingId/cancel` (650) | `validateAdminStatusChange` (110) |
| 12 | `detail.routes.js` (**mounted last**) | `GET /:bookingId` (628) | none |

Only modules 4 and 12 are order-sensitive: module 4 (the static GETs) must mount before module 12 (`GET /:bookingId`). Every
other route is a `PATCH` or `POST` under `/:bookingId/...`, which no GET route can shadow.

Suggested mount order in the index: 4, 3, 5, 6, 7, 8, 9, 10, 11, 12.

## Suggested sequence (smallest and safest first)

1. Extract `shared/upload.js` and `shared/serializers.js` and import them back into the existing file. No route moves.
2. Move module 12 (one route), then module 10 and module 7 (small, self-contained).
3. Move modules 5 and 6 (they share the upload middleware and `openRefundIfEligible`).
4. Move modules 8 and 9.
5. Last: modules 3, 4 and 11, which are the largest and carry the most logic. `admin-update` should be split into its own
   internal functions (status, payment verification, charges) in a separate step after the move, not during it.

Each step is a pure move, ends with the API smoke test plus the browser smoke tests, and is its own commit so it can be
reverted alone.

## Risks

- **Route order** (above). The highest risk, and the cheapest to test.
- **Circular requires.** `openRefundIfEligible` is needed by cancel, admin-update and refunds; `withWarranty` by almost every
  route. Both must live in `shared/` and never import from a router module.
- **Middleware that runs before multer.** `POST /` assigns a booking ID in a middleware that runs before `upload.fields(...)`
  ([bookingRoutes.js:262](server/routes/bookingRoutes.js#L262)). The order "ID middleware, then multer, then handler" has to be kept as is.
- **Shared mutable state.** None found at module level (no caches or counters in this file), which is what makes the split feasible.
- **Auth.** Every route passes `auth` and several check `req.userRole` by hand. Moving routes must not drop either; a
  per-module role check test (admin, staff, customer against each route) would catch a lost check.
- **Tests.** There are no route-level tests today. Before step 4 and 5, add a small set that call each route with each role and
  assert the status code, so a moved route cannot silently become open to everyone.
- **Diff noise and merge conflicts** if other branches touch this file while it is being split. Do it in one short window.

## Not part of this proposal

- Changing any route path, status code, response shape or validation rule.
- Rewriting `admin-update`. It only gets moved.
- A controller / service layer on the server. That is a separate decision.
