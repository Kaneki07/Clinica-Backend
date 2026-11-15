export class HttpError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, message, details);
}

export function unauthorized(message = 'No autorizado.'): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message = 'No tienes permisos para esta acción.'): HttpError {
  return new HttpError(403, message);
}

export function notFound(message = 'Registro no encontrado.'): HttpError {
  return new HttpError(404, message);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message);
}
