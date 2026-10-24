const mongoose = require('mongoose');
const { describeError } = require('../utils/safeLog');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    // eslint-disable-next-line no-console -- startup message, not debugging
    console.log('MongoDB connected:', mongoose.connection.name);
  } catch (err) {
    // the reason, with any connection string or secret cut out: the log must never show the database address or its password
    console.error('MongoDB connection error:', describeError(err));
    process.exit(1);
  }
};

module.exports = connectDB;