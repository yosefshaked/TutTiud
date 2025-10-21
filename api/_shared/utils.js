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

const logEnvironmentStatuses = (functionName, variableNames) => {
  variableNames.forEach((name) => {
    if (process.env[name]) {
      console.log(`[${functionName}] Checking ${name}: Found`)
    } else {
      console.error(`[${functionName}] Checking ${name}: Not Found`)
    }
  })
}

module.exports = {
  isRecord,
  sendJson,
  createHttpError,
  logEnvironmentStatuses
}
