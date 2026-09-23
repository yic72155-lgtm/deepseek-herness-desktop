import net from 'node:net'

const HOST = '127.0.0.1'

/** 从首选端口向后扫描的范围宽度（首选端口 + 0..99）。 */
const SCAN_RANGE = 100

export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', () => {
      resolve(false)
    })

    server.once('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen(port, HOST)
  })
}

/**
 * 在首选端口及其后的一个区段内找空闲端口。
 *
 * 之所以不直接让系统随机分配：随机端口每次启动都变，地址不稳定
 * （书签、托盘里的端口提示、以后做远程访问都用不上），而且浏览器的
 * 认证 cookie 是按 authority（host:port）签发的，端口一变旧 cookie 就作废。
 * 在区段内顺序取第一个空闲端口，可以让绝大多数启动都落在同一个地址上。
 *
 * 全部被占用时才退回系统随机分配（极端情况，至少还能启动）。
 */
export async function findAvailablePort(preferredPort: number): Promise<number> {
  for (let offset = 0; offset < SCAN_RANGE; offset += 1) {
    const candidate = preferredPort + offset
    if (candidate > 65535) break
    if (await isPortAvailable(candidate)) {
      return candidate
    }
  }

  return new Promise((resolve, reject) => {
    const server = net.createServer()

    server.once('error', reject)

    server.listen(0, HOST, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('无法获取可用的本地端口'))
        return
      }

      const port = address.port
      server.close(() => resolve(port))
    })
  })
}
