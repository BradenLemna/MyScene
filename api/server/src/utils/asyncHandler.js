// Express 4 does not catch rejected promises from async route handlers.
// This wrapper forwards any rejection to the next middleware (the error
// handler), so no request ever hangs or crashes the process.
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
