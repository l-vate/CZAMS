import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './css/public.css'

import './css/admin.css'
import './css/customer.css'
import './css/staff.css'

import './css/components/calendar.css'
import './css/components/sidebar.css'
import './css/components/notification_bell.css'
import './css/components/notice.css'
import './css/components/charts.css'
import './css/components/report_print.css'
import './css/components/queue.css'
import './css/components/availability.css'
import './css/components/closures.css'
import './css/components/needs_attention.css'
import './css/components/cancel_booking_dialog.css'
import './css/components/no_show.css'
import './css/components/admin_service_details_modal.css'
import './css/components/assignment_panel.css'
import './css/components/audit_log.css'
import './css/components/back_job_modal.css'
import './css/components/discount_option.css'
import './css/components/feedback_modal.css'
import './css/components/technician_performance_modal.css'
import './css/components/user_details_modal.css'

import "./css/modals/service_request_modal.css"
import './css/modals/payment_modal.css';
import './css/modals/receipt_modal.css';
import './css/components/back_button.css';
import './css/components/action_buttons.css';
import './css/modals/service_report_pdf_modal.css';

// last, so the phone touch sizes apply on top of every page's own rules
import './css/mobile_touch.css';

import App from './App.jsx'


// eslint-disable-next-line no-restricted-syntax -- the one place React is mounted
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
