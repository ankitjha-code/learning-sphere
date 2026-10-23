export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Please sign in to continue.') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have permission to do that.', details?: unknown) =>
  new AppError(403, 'forbidden', message, details);
export const notFound = (what = 'Item') => new AppError(404, 'not_found', `${what} not found.`);
export const conflict = (message: string, details?: unknown) => new AppError(409, 'conflict', message, details);
export const tooMany = (message = 'Too many requests. Please wait a moment and try again.', retryAfter?: number) =>
  new AppError(429, 'rate_limited', message, retryAfter ? { retryAfter } : undefined);
export const unavailable = (code: string, message: string, details?: unknown) => new AppError(503, code, message, details);
