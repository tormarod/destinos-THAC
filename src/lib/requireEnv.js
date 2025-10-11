// src/lib/requireEnv.js
function requireEnv(keys) {
  const missing = keys.filter(
    (k) => !process.env[k] || process.env[k].trim() === "",
  );
  if (missing.length) {
    const msg = `[env] Missing required env vars: ${missing.join(", ")}`;
    console.error(msg);
    throw new Error(msg);
  }
}

module.exports = { requireEnv };
