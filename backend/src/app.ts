import cors from 'cors'
import express from 'express'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import helmet from 'helmet'
import { apiRouter } from './routes/index.js'
import { getStorageInfo } from './data/index.js'

export function createApp() {
  const app = express()
  const currentDirectory = dirname(fileURLToPath(import.meta.url))
  const frontendDistDirectory = join(currentDirectory, '../../frontend/dist')
  const frontendIndexFile = join(frontendDistDirectory, 'index.html')
  const hasFrontendBuild = existsSync(frontendIndexFile)

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  )
  app.use(
    cors({
      origin: true,
    }),
  )
  app.use(express.json({ limit: '2mb' }))
  app.use((request, _response, next) => {
    console.log(`${request.method} ${request.originalUrl}`)
    next()
  })

  app.use('/api', apiRouter)

  if (hasFrontendBuild) {
    app.use(express.static(frontendDistDirectory))

    app.get(/^\/(?!api(?:\/|$)).*/, (_request, response) => {
      response.sendFile(frontendIndexFile)
    })
  } else {
    app.get('/', (_request, response) => {
      response.json({
        name: 'Super M2 API',
        version: '0.1.0',
        message: 'واجهة برمجة Super M2 تعمل بشكل طبيعي.',
        storage: getStorageInfo(),
      })
    })
  }

  return app
}
