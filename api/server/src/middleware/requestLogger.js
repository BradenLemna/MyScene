// Minimal request logger: one line per request with method, path, status
// and duration. Query strings never contain secrets in this API (all keys
// are server-side), so logging the original URL is safe.
export function requestLogger(req, res, next) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    next();
}
