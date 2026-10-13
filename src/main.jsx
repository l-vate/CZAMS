//import 'bootstrap/dist/css/bootstrap.min.css'; 
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

import "./css/modals/service_request_modal.css"
import './css/modals/payment_modal.css';
import './css/modals/receipt_modal.css';
import './css/modals/service_report_pdf_modal.css';

import App from './App.jsx'


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
