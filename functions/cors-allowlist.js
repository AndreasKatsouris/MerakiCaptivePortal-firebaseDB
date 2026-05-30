// Shared CORS origin allowlist for all HTTP Cloud Functions.
//
// Extracted so every entry point (index.js, ross.js, …) enforces the SAME
// policy — previously ross.js used `cors({ origin: true })` which reflected
// any origin (OWASP H-5). ross.js cannot import index.js directly (index.js
// requires ross.js → circular), so the policy lives here.
//
// Allows:
//  - localhost ports for dev
//  - canonical Firebase Hosting domains (live)
//  - Firebase Hosting preview channels: <site>--<channel>-<hash>.web.app
//    (created by `firebase hosting:channel:deploy`). Without this, every
//    preview channel fails the verifyAdminStatus preflight and admins are
//    locked out of the UI on previews.
const STATIC_CORS_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:8000',
    'https://merakicaptiveportal-bda0f.web.app',
    'https://merakicaptiveportal-bda0f.firebaseapp.com',
    'https://merakicaptiveportal-firebasedb.web.app',
    'https://merakicaptiveportal-firebasedb.firebaseapp.com'
];
const PREVIEW_CHANNEL_PATTERN = /^https:\/\/merakicaptiveportal-firebasedb--[a-z0-9-]+\.web\.app$/;

function isAllowedOrigin(origin) {
    if (!origin) return true; // same-origin / curl / server-to-server
    if (STATIC_CORS_ORIGINS.includes(origin)) return true;
    if (PREVIEW_CHANNEL_PATTERN.test(origin)) return true;
    return false;
}

// A `cors` middleware option object that enforces the allowlist.
const corsOptions = {
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error(`CORS: origin not allowed: ${origin}`));
    },
    credentials: true
};

module.exports = { STATIC_CORS_ORIGINS, PREVIEW_CHANNEL_PATTERN, isAllowedOrigin, corsOptions };
