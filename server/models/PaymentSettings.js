const mongoose = require('mongoose');

// Singleton document (one row, fixed _id) — admin-managed payment methods and
// down payment percentage options, both previously hardcoded constants in
// book_service.jsx. Account details are a free-form label/value list rather than
// fixed fields (accountName/accountNumber/bankName...) since different methods
// need different fields and the set of methods itself isn't fixed either.
const paymentSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'default' },

  paymentMethods: [{
    name: { type: String, required: true },
    accountDetails: [{
      label: { type: String, required: true },
      value: { type: String, required: true },
    }],
  }],

  downPaymentPercentages: [{ type: Number, min: 0, max: 100 }],
}, { timestamps: true, collection: 'paymentsettings' });

module.exports = mongoose.model('PaymentSettings', paymentSettingsSchema);
