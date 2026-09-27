export const API_URL = process.env.E2E_API_URL ?? "http://localhost:8086/api/v1"
export const PROD = process.env.E2E_TARGET === "prod"
