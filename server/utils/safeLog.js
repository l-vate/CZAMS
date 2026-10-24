// What may be written to a log or a startup message about a failure. A database or library error can carry the connection string (user
// and password included), and a log is read by more people and tools than the .env file is, so every error text goes through here first:
//   - any mongodb:// or mongodb+srv:// address is cut to "mongodb://<hidden>"
//   - the exact value of a secret setting (the database address, the JWT secret, the SMTP password), if it appears, is replaced by <hidden>
// Nothing is ever printed from the environment itself.
const SECRET_SETTINGS = ['MONGO_URI', 'JWT_SECRET', 'SMTP_PASS'];
const URI = /mongodb(?:\+srv)?:\/\/[^\s'"`<>]+/gi;
const MIN_SECRET_LENGTH = 6; // a shorter value would blank out ordinary words

function scrubSecrets(text, env = process.env) {
  let out = String(text ?? '').replace(URI, 'mongodb://<hidden>');
  for (const key of SECRET_SETTINGS) {
    const value = env[key];
    if (typeof value === 'string' && value.length >= MIN_SECRET_LENGTH) out = out.split(value).join('<hidden>');
  }
  return out;
}

// "Name: message" for an error, scrubbed. Use it when only the reason is wanted (a connection that failed).
const describeError = (err, env = process.env) => scrubSecrets(err && err.message ? `${err.name || 'Error'}: ${err.message}` : String(err), env);

// The whole error with its stack, scrubbed, for the server log of a real fault.
const describeFault = (err, env = process.env) => scrubSecrets(err && err.stack ? err.stack : String(err), env);

module.exports = { scrubSecrets, describeError, describeFault };
