// Finds text that looks like a real secret, for test/secretsGuard.test.js. It returns [{ line, kind }] and never the matched value, so
// nothing that uses it can leak the secret into a log. Placeholders such as <password> are not findings.
const PLACEHOLDER = /^(<[^>]*>|\$\{[^}]*\}|\{\{[^}]*\}\}|your[-_ ]?.*|change[-_ ]?me.*|example.*|xxx+.*|\*+|\.\.\.|password|pass|secret|user|username|placeholder.*|replace.*|test.*|dummy.*|fake.*)$/i;
const SECRET_NAME = '(?:JWT_SECRET|[A-Z_]*SECRET[A-Z_]*|[A-Z_]*API_KEY|[A-Z_]*APIKEY|SMTP_PASS[A-Z_]*|[A-Z_]*PASSWORD|[A-Z_]*TOKEN|[A-Z_]*PRIVATE_KEY|BREVO[A-Z_]*|SENDGRID[A-Z_]*|[A-Z_]*_KEY)';
const ASSIGNMENT = new RegExp(String.raw`^\s*(?:export\s+)?(?:const\s+|let\s+|var\s+)?['"]?(${SECRET_NAME})['"]?\s*[:=]\s*['"\`]?([^\s'"\`#,;]+)`);
const MONGO_URI = /mongodb(?:\+srv)?:\/\/([^:\s/@'"`]+):([^@\s'"`]+)@/g;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const API_KEY = /\b(xkeysib-[A-Za-z0-9-]{20,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{30,}|re_[A-Za-z0-9]{20,})\b/;
const WORDS = /test|example|dummy|fake|placeholder|not-a-real|change-?me|change-this|your-/i;

// A value that could be a real secret: long enough, not a placeholder or a test value, and random looking (it has a digit, or is a long mix
// of upper and lower case). A plain word such as the name of a storage key is not.
function looksReal(value) {
  if (value.length < 12 || PLACEHOLDER.test(value) || WORDS.test(value)) return false;
  return /\d/.test(value) || (value.length >= 20 && /[a-z]/.test(value) && /[A-Z]/.test(value));
}

// What is wrong with a text, as [{ line, kind, key }]. The matched value is never returned.
function findSecrets(text) {
  const found = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const n = index + 1;
    for (const m of line.matchAll(MONGO_URI)) {
      if (!PLACEHOLDER.test(m[2])) found.push({ line: n, key: 'MONGO_URI', kind: 'a MongoDB connection string with a real looking password' });
    }
    if (PRIVATE_KEY.test(line)) found.push({ line: n, key: 'PRIVATE KEY', kind: 'a private key' });
    const assignment = line.match(ASSIGNMENT);
    if (assignment) {
      const value = assignment[2];
      const code = /^process\.env|^env\.|^req\.|^null|^undefined|^true|^false|^\/|[(){}[\]]/.test(value);
      if (looksReal(value) && !code) found.push({ line: n, key: assignment[1], kind: `${assignment[1]} set to a real looking value` });
    }
    if (API_KEY.test(line)) found.push({ line: n, key: 'API KEY', kind: 'an API key' });
  });
  return found;
}

module.exports = { findSecrets };
