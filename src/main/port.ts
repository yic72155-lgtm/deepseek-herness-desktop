import net from 'node:net'

const HOST = '127.0.0.1'

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

export async function findAvailablePort(preferredPort: number): Promise<number> {
  if (await isPortAvailable(preferredPort)) {
    return preferredPort
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
