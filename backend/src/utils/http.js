function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parsePagination(query) {
  const page = Math.max(1, Math.min(Number.parseInt(query.page, 10) || 1, 100000));
  const limit = Math.max(1, Math.min(Number.parseInt(query.limit, 10) || 20, 100));
  return { page, limit, offset: (page - 1) * limit };
}

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanString(value, maxLength) {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  if (!result || result.length > maxLength) return null;
  return result;
}

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { parseId, parsePagination, isEmail, cleanString, asyncHandler };
