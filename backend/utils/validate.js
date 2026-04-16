// Tiny validation helpers for Express route handlers.
//
// We deliberately avoid pulling in zod / joi / express-validator — the shape
// of most payloads here is small and easy to assert inline. These helpers
// throw a `ValidationError` (HTTP 400) that the global error handler in
// server.js turns into a JSON response.
//
// Usage:
//   import { requireFields, requirePositive, requireRange } from '../utils/validate.js'
//
//   router.post('/clients', (req, res) => {
//     requireFields(req.body, ['name'])
//     requireRange(req.body.risk_profile, 1, 5, 'risk_profile')
//     ...
//   })
//
// The global error handler catches synchronous throws and formats them
// uniformly, so route handlers stay clean.

export class ValidationError extends Error {
  constructor(message, field) {
    super(message)
    this.name = 'ValidationError'
    this.status = 400
    this.field = field
  }
}

/**
 * Assert that the given fields are present (non-null, non-undefined, non-empty-string).
 * Numbers including 0 are accepted.
 */
export function requireFields(obj, fields) {
  if (!obj || typeof obj !== 'object') {
    throw new ValidationError('Request body is missing or not an object')
  }
  for (const field of fields) {
    const v = obj[field]
    if (v === undefined || v === null || v === '') {
      throw new ValidationError(`Missing required field: ${field}`, field)
    }
  }
}

/**
 * Assert that a value is a finite number greater than 0.
 * Accepts numeric strings. Null/undefined is allowed (use requireFields
 * separately if the field itself is mandatory).
 */
export function requirePositive(value, fieldName) {
  if (value === undefined || value === null || value === '') return
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError(`${fieldName} must be a positive number`, fieldName)
  }
}

/**
 * Assert that a value is a finite number within [min, max] (inclusive).
 * Null/undefined is allowed (use requireFields separately if mandatory).
 */
export function requireRange(value, min, max, fieldName) {
  if (value === undefined || value === null || value === '') return
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ValidationError(`${fieldName} must be between ${min} and ${max}`, fieldName)
  }
}

/**
 * Assert that a value is one of the allowed enum values.
 */
export function requireEnum(value, allowed, fieldName) {
  if (value === undefined || value === null || value === '') return
  if (!allowed.includes(value)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${allowed.join(', ')}`,
      fieldName
    )
  }
}

/**
 * Assert that a value is a non-negative finite number (0 allowed).
 */
export function requireNonNegative(value, fieldName) {
  if (value === undefined || value === null || value === '') return
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError(`${fieldName} must be zero or positive`, fieldName)
  }
}

/**
 * Assert that a value is a positive integer (useful for IDs, counts, months).
 */
export function requireInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') return
  const n = Number(value)
  if (!Number.isInteger(n)) {
    throw new ValidationError(`${fieldName} must be an integer`, fieldName)
  }
}
