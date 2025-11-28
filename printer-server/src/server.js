import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import net from 'node:net'
import { randomUUID } from 'node:crypto'

dotenv.config()

const SERVER_PORT = Number(process.env.PORT ?? 3002)
const DEFAULT_PRINTER_HOST = process.env.PRINTER_HOST ?? ''
const DEFAULT_PRINTER_PORT = Number(process.env.PRINTER_PORT ?? 9100)
const bodyLimit = process.env.MAX_LABEL_SIZE ?? '256kb'

const app = express()

app.use(cors())
app.use(express.json({ limit: bodyLimit }))

app.use((req, _res, next) => {
  req.requestId = randomUUID()
  console.log(`[${req.requestId}] ${req.method} ${req.path}`)
  next()
})

const sendToPrinter = (payload, host, port, timeout = 10_000) =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout }, () => {
      socket.write(payload, (err) => {
        if (err) {
          reject(err)
          socket.destroy()
        } else {
          socket.end()
          resolve(undefined)
        }
      })
    })

    socket.on('error', reject)
    socket.on('timeout', () => {
      socket.destroy(new Error('Connection to printer timed out'))
    })
  })

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    defaultPrinterHost: DEFAULT_PRINTER_HOST || null,
    defaultPrinterPort: DEFAULT_PRINTER_PORT,
    timestamp: new Date().toISOString(),
  })
})

app.post('/print', async (req, res) => {
  const { zpl, printerIp, printerPort, timeout } = req.body ?? {}
  const label = typeof zpl === 'string' ? zpl.trim() : ''
  const host =
    typeof printerIp === 'string' && printerIp.trim()
      ? printerIp.trim()
      : DEFAULT_PRINTER_HOST.trim()
  const port = Number(printerPort ?? DEFAULT_PRINTER_PORT)
  const socketTimeout = Number(timeout ?? 10_000)

  if (!label) {
    return res.status(400).json({
      success: false,
      error: 'ZPL payload is required',
      requestId: req.requestId,
    })
  }
  if (!host) {
    return res.status(400).json({
      success: false,
      error: 'Printer IP is required (send printerIp or set PRINTER_HOST)',
      requestId: req.requestId,
    })
  }

  try {
    await sendToPrinter(label, host, port, socketTimeout)
    console.log(
      `[${req.requestId}] Sent ${label.length} bytes to ${host}:${port}`,
    )
    res.json({
      success: true,
      printerIp: host,
      printerPort: port,
      requestId: req.requestId,
    })
  } catch (error) {
    console.error(`[${req.requestId}] Printer send failed`, error)
    res.status(502).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      printerIp: host,
      printerPort: port,
      requestId: req.requestId,
    })
  }
})

app.listen(SERVER_PORT, () => {
  console.log(
    `Printer server listening on port ${SERVER_PORT} (default printer ${DEFAULT_PRINTER_HOST ||
      'unset'}:${DEFAULT_PRINTER_PORT})`,
  )
})

