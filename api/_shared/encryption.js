const nodeCrypto = require('crypto')

const deriveEncryptionKey = (secret) => {
  if (!secret) {
    throw new Error('Missing encryption secret')
  }

  try {
    const decoded = Buffer.from(secret, 'base64')
    if (decoded.length === 32) {
      return decoded
    }
  } catch {
    // Ignore malformed base64 and fall back to hashing
  }

  return nodeCrypto.createHash('sha256').update(secret).digest()
}

const encryptValue = (value, secret) => {
  const encryptionKey = deriveEncryptionKey(secret)
  const iv = nodeCrypto.randomBytes(12)
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', encryptionKey, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

const decryptValue = (payload, secret) => {
  const encryptionKey = deriveEncryptionKey(secret)
  const buffer = Buffer.from(payload, 'base64')

  if (buffer.length < 28) {
    throw new Error('Encrypted payload is too short')
  }

  const iv = buffer.subarray(0, 12)
  const authTag = buffer.subarray(12, 28)
  const encrypted = buffer.subarray(28)

  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', encryptionKey, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

module.exports = {
  deriveEncryptionKey,
  encryptValue,
  decryptValue
}
