/**
 * Errors thrown by services/routes. The error handler turns them into
 * `{ error: string, code?: string, details?: unknown }` (the client reads `.error`).
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new AppError(400, message, 'BAD_REQUEST', details);
  }
  static unauthorized(message = 'Authentication required') {
    return new AppError(401, message, 'UNAUTHORIZED');
  }
  static forbidden(message = 'Forbidden') {
    return new AppError(403, message, 'FORBIDDEN');
  }
  static notFound(message = 'Not found') {
    return new AppError(404, message, 'NOT_FOUND');
  }
  static conflict(message = 'Conflict') {
    return new AppError(409, message, 'CONFLICT');
  }
  static unprocessable(message = 'Unprocessable request', details?: unknown) {
    return new AppError(422, message, 'UNPROCESSABLE', details);
  }
  static tooManyRequests(message = 'Too many requests') {
    return new AppError(429, message, 'RATE_LIMITED');
  }
}
