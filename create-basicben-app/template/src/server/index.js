/**
 * Server entry point
 *
 * This file is automatically loaded by BasicBen.
 * You can customize server setup here.
 */

import { createServer } from 'basicben/server'

const app = await createServer()

const port = process.env.PORT || 3001

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
