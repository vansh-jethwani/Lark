import mongoose from "mongoose";

const buckets = new Map();

// Intentionally small in-memory limiter: it protects a single process without
// introducing a new operational dependency. Use a shared store when scaling.
export function rateLimit({ windowMs, max, key = (req) => req.ip }) {
  return (req, res, next) => {
    const now = Date.now();
    const bucketKey = `${req.baseUrl}:${req.route?.path || req.path}:${key(req) || "unknown"}`;
    const bucket = buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.set("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ message: "Too many requests. Please try again shortly." });
    }
    return next();
  };
}

export function validateObjectIdParam(name) {
  return (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params[name])) {
      return res.status(400).json({ message: "Invalid identifier." });
    }
    return next();
  };
}

// Cookie authentication is cross-origin in production. Browser state-changing
// requests must therefore originate from one of the CORS-approved SPA origins.
export function requireTrustedOrigin(allowedOrigins) {
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    if (!origin || !allowedOrigins.has(origin)) {
      return res.status(403).json({ message: "Cross-site request blocked." });
    }
    return next();
  };
}

export function securityHeaders(req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
    // Deliberately avoids default-src so configured ImageKit media and Socket.IO
    // endpoints remain compatible with existing deployments.
    "Content-Security-Policy": "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
  });
  if (process.env.NODE_ENV === "production") {
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return next();
}
