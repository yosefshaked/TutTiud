const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const sendJson = (context, status, body) => {
  context.res = {
    status,
    headers: {
      'Content-Type': 'application/json'
    },
    body
  }
}

const createHttpError = (status, message, details) => {
  const error = new Error(message)
  error.status = status
  if (details !== undefined) {
    error.details = details
  }
  return error
}

module.exports = {
  isRecord,
  sendJson,
  createHttpError
}
