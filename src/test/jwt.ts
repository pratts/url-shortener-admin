function base64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** An unsigned JWT-shaped token whose `exp` is `secondsFromNow` away. */
export function makeToken(secondsFromNow = 3600, now = Date.now()) {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const exp = Math.floor(now / 1000) + secondsFromNow
  const payload = base64Url(
    JSON.stringify({ sub: "1", iat: exp - 3600, exp, iss: "url-shortener-admin" })
  )
  return `${header}.${payload}.signature`
}
