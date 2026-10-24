// Checks the settings the server cannot run safely without. Pure: it takes the environment as an argument and returns the problems
// instead of exiting, so it is tested without stopping a process. Messages name the variable and never its value.
const PRODUCTION_MIN_SECRET = 32;
const DEVELOPMENT_MIN_SECRET = 16;

// A value that looks like a placeholder someone forgot to replace: it is written in angle brackets (as in .env.example), contains "secret"
// together with "dev", or contains "change", "test" or "example".
function looksLikePlaceholder(value) {
  const text = String(value).toLowerCase();
  return /<[^>]*>/.test(text) || (text.includes('secret') && text.includes('dev')) || text.includes('change') || text.includes('test') || text.includes('example');
}

// { errors, warnings }. In production any error means the server must not start; in development there are warnings only.
function checkEnvironment(env = process.env) {
  const errors = [];
  const warnings = [];
  const secret = env.JWT_SECRET;

  if (env.NODE_ENV === 'production') {
    if (!secret) errors.push('JWT_SECRET is missing. Set it to a long random string (at least 32 characters).');
    else if (secret.length < PRODUCTION_MIN_SECRET) errors.push(`JWT_SECRET is shorter than ${PRODUCTION_MIN_SECRET} characters. Use a longer random string.`);
    if (!env.MONGO_URI) errors.push('MONGO_URI is missing. Set it to the database connection string.');
    // Uploaded files kept on the host's disk are lost whenever the host restarts or redeploys.
    if (String(env.FILE_STORE || '').trim().toLowerCase() === 'disk') {
      warnings.push('FILE_STORE is disk in production, so uploaded files will be lost when the host restarts or redeploys. Use gridfs.');
    }
  } else if (secret) {
    if (secret.length < DEVELOPMENT_MIN_SECRET) warnings.push(`JWT_SECRET is shorter than ${DEVELOPMENT_MIN_SECRET} characters.`);
    if (looksLikePlaceholder(secret)) warnings.push('JWT_SECRET looks like a placeholder. Replace it before this runs anywhere real.');
  }
  return { errors, warnings };
}

// Prints the warnings and, when there are errors, the errors and then exits. Called once, at startup.
function enforceEnvironment(env = process.env, { log = console, exit = process.exit } = {}) {
  const { errors, warnings } = checkEnvironment(env);
  warnings.forEach((w) => log.warn(`Config warning: ${w}`));
  if (errors.length > 0) {
    errors.forEach((e) => log.error(`Config error: ${e}`));
    log.error('The server did not start because of the settings above.');
    exit(1);
  }
}

module.exports = { checkEnvironment, enforceEnvironment, looksLikePlaceholder };
