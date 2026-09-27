import { setupServer } from "msw/node"

export const API = "http://api.test/api/v1"

/** Handlers are added per test with server.use(...), following docs/API.md. */
export const server = setupServer()
