/**
 * 密码哈希工具 - 使用 PBKDF2 + SHA-256
 * 兼容 Cloudflare Workers(只用 crypto.subtle API)
 */

const ITERATIONS = 100_000
const KEY_LENGTH = 32 // 256 bits
const SALT_LENGTH = 16 // 128 bits

/**
 * 把字节数组转成十六进制字符串
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 把十六进制字符串转回字节数组
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

/**
 * 把密码哈希成存储格式
 * 输出格式:`pbkdf2$iterations$salt-hex$hash-hex`
 */
export async function hashPassword(password: string): Promise<string> {
  const saltArray = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))

  const encoder = new TextEncoder()
  const passwordBytes = encoder.encode(password)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBytes as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltArray as BufferSource,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8,
  )

  const hash = new Uint8Array(hashBuffer)
  return `pbkdf2$${ITERATIONS}$${bytesToHex(saltArray)}$${bytesToHex(hash)}`
}

/**
 * 验证密码是否匹配存储的哈希
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
      return false
    }

    const iterations = Number.parseInt(parts[1], 10)
    const saltArray = hexToBytes(parts[2])
    const expectedHash = parts[3]

    const encoder = new TextEncoder()
    const passwordBytes = encoder.encode(password)

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBytes as BufferSource,
      { name: 'PBKDF2' },
      false,
      ['deriveBits'],
    )

    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltArray as BufferSource,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      KEY_LENGTH * 8,
    )

    const actualHash = bytesToHex(new Uint8Array(hashBuffer))

    if (actualHash.length !== expectedHash.length) return false
    let diff = 0
    for (let i = 0; i < actualHash.length; i++) {
      diff |= actualHash.charCodeAt(i) ^ expectedHash.charCodeAt(i)
    }
    return diff === 0
  }
  catch {
    return false
  }
}