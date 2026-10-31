// Run with: npm test (inside server/). E26B, the admin booking details on a phone (up to 768 px): the Assigned Technicians panel, the buttons and
// the Cancel Booking placement. Read from the source files; nothing here needs a database or the real clock.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', 'src', ...parts), 'utf8');
// the CSS inside the first "@media (max-width: <px>px) {" block that follows `after`
const phoneBlock = (css, after, px = 768) => {
  const from = css.indexOf(after);
  assert.ok(from >= 0, `${after} is in the file`);
  const open = css.indexOf(`@media (max-width: ${px}px) {`, from);
  assert.ok(open >= 0, `a ${px}px block follows`);
  let depth = 0;
  for (let i = css.indexOf('{', open); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') { depth -= 1; if (depth === 0) return css.slice(open, i + 1); }
  }
  return css.slice(open);
};

const panel = src('components', 'assignment_panel.jsx');
const panelCss = src('css', 'components', 'assignment_panel.css');

test('B1: each technician row keeps its remove button inside the row, 44 px, at the right end, with its accessible name', () => {
  const row = panel.slice(panel.indexOf('<li key={index} className="assignment-row">'), panel.indexOf('</li>', panel.indexOf('assignment-icon-btn--remove')));
  assert.match(row, /assignment-icon-btn--remove[\s\S]*?aria-label=\{`Remove technician \$\{index \+ 1\}`\}/, 'the remove button is in the row and named');
  const phone = phoneBlock(panelCss, 'ADMIN BOOKING ACTIONS ON A PHONE');
  assert.match(phone, /\.assignment-row \{ display: grid; grid-template-columns: auto minmax\(0, 1fr\) 44px; align-items: center;/);
  assert.match(phone, /\.assignment-row \.assignment-icon-btn--remove \{ grid-column: 3; grid-row: 1; width: 44px; height: 44px; \}/);
  assert.match(phone, /\.assignment-row \.assignment-row-select \{ grid-column: 2; grid-row: 1; min-height: 44px/);
  assert.match(phone, /\.assignment-row-actions \{ display: contents; \}/, 'the remove button is a grid item of the row, never wrapped below it');
});

test('B1: the badge is a number for the other technicians on a phone, and above the dropdown on a very narrow screen with the x still at the right', () => {
  assert.match(panel, /<span className="assignment-badge-long">Technician<\/span><span className="assignment-badge-num" aria-hidden="true">\{index \+ 1\}<\/span>/);
  assert.match(panelCss, /\.assignment-badge-num \{ display: none; \}/, 'wide screens keep the word');
  const narrow = phoneBlock(panelCss, 'a very narrow phone', 360);
  assert.match(narrow, /\.assignment-row \.assignment-badge \{ grid-column: 1 \/ -1; grid-row: 1;/);
  assert.match(narrow, /\.assignment-row \.assignment-row-select \{ grid-column: 1 \/ 3; grid-row: 2; \}/);
  assert.match(narrow, /\.assignment-icon-btn--remove \{ grid-column: 3; grid-row: 2; \}/);
});

test('B1: the order is the rows, Add another technician, the reason, then Save assignment last', () => {
  const controls = panel.slice(panel.indexOf('className="assignment-actions"'));
  const order = ['Add another technician', 'Reason for the change', 'Save assignment'].map((t) => controls.indexOf(t));
  assert.ok(order.every((n) => n > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'the reason comes before the Save button');
  assert.ok(panel.indexOf('assignment-rows') < panel.indexOf('assignment-actions'));
  assert.match(panel, /disabled=\{saving \|\| !dirty \|\| incomplete\}/, 'Save stays disabled until something changed');
  assert.match(panel, /disabled=\{saving \|\| !picked\[picked\.length - 1\]\}/, 'Add keeps its condition');
});

test('B1: on a phone the three controls are right aligned with equal width buttons, 44 px tall, 12 px apart; wide screens look as before', () => {
  const phone = phoneBlock(panelCss, 'ADMIN BOOKING ACTIONS ON A PHONE');
  assert.match(phone, /\.assignment-actions \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, max-content\); gap: 12px;/);
  assert.match(phone, /\.assignment-add, \.assignment-actions \.assignment-save \{ grid-column: 2; width: 100%; min-height: 44px/);
  assert.match(phone, /\.assignment-reason \{ grid-column: 1 \/ -1; min-height: 44px; font-size: 16px; \}/);
  assert.match(phone, /\.assignment-reason, \.assignment-actions \.assignment-save \{ order: 0; \}/);
  const outside = panelCss.replace(phone, '');
  assert.match(outside, /\.assignment-actions \{ display: flex; flex-wrap: wrap; gap: 8px; \}/);
  assert.match(outside, /\.assignment-actions \.assignment-save \{ order: 1; \}/);
  assert.match(outside, /\.assignment-actions \.assignment-reason \{ order: 2; flex: 1 1 100%; \}/, 'the reason stays below Add and Save on a wide screen');
  assert.match(outside, /\.assignment-row-move \{ display: contents; \}/, 'the move buttons stay in the flat row on a wide screen');
});

test('B1: + Add line and Edit quotation details share one right aligned, equal width, 44 px class on phones', () => {
  assert.match(src('components', 'scope_of_works_editor.jsx'), /className="sdm-btn sdm-btn-outline sdm-section-action"[^>]*onClick=\{\(\) => \{ setAdding\(true\)/);
  assert.match(src('components', 'quotation_editor.jsx'), /className="sdm-btn sdm-btn-outline sdm-section-action" onClick/);
  const css = src('css', 'modals', 'service_request_modal.css');
  const phone = phoneBlock(css, 'ADMIN BOOKING DETAILS: footer and section buttons');
  assert.match(phone, /\.sdm-section-action \{[^}]*width: min\(100%, 220px\); min-height: 44px; margin-left: auto/);
});

test('B1: Cancel Booking is the last action, right aligned and red; the start note moved to the header, with the same text and condition', () => {
  const modal = src('components', 'admin_service_details_modal.jsx');
  const footer = modal.slice(modal.indexOf('<div className="sdm-footer">'));
  assert.ok(footer.indexOf('sdm-footer-actions') < footer.indexOf('Cancel Booking'), 'Cancel Booking is last in the page order');
  assert.match(footer, /\{canCancel && \(\s*<button className="sdm-btn sdm-btn-danger" onClick=\{handleCancel\} disabled=\{saving\}>/, 'same condition and handler');
  const note = 'Starts automatically at the start of its service day.';
  assert.equal(modal.split(note).length - 1, 2, 'the sentence is unchanged, in the header and in the footer');
  assert.match(modal, /booking\.status === BOOKING_STATUS\.APPROVED && \(\s*<p className="sdm-subtitle sdm-header-note">Starts automatically/);
  assert.match(modal, /booking\.status === BOOKING_STATUS\.APPROVED && \(\s*<span className="sdm-muted sdm-footer-start-note">Starts automatically/);
  const css = src('css', 'modals', 'service_request_modal.css');
  const phone = phoneBlock(css, 'ADMIN BOOKING DETAILS: footer and section buttons');
  assert.match(phone, /\.sdm-header-note \{ display: block;/);
  assert.match(phone, /\.sdm-footer-start-note \{ display: none; \}/, 'under the Cancel button it is gone on a phone');
  assert.match(phone, /\.sdm-footer > \.sdm-btn-danger \{ order: 2; align-self: flex-end; margin-top: 12px; min-height: 44px/);
  assert.match(css, /\.sdm-header-note \{ display: none; \}/, 'wide screens do not show the header copy');
  assert.match(css, /\.sdm-footer > \.sdm-btn-danger \{ order: -1; \}/, 'wide screens keep Cancel Booking first, as before');
});
