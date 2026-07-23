import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { apiRouter } from './api/index'
import { getLayout } from './layout'
import type { Bindings } from './types'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

// Global error handler to surface actual error messages
app.onError((err, c) => {
  console.error('Unhandled error:', err.message, err.stack)
  return c.json({ error: err.message || 'Internal Server Error' }, 500)
})

// API routes
app.route('/api', apiRouter)

// SPA - serve for all non-API routes
app.get('*', (c) => {
  return c.html(getLayout())
})

export default app
