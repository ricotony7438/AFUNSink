export default eventHandler(async (event) => {
  const token = extractBearerToken(event)
  if (token) {
    await deleteUserSession(event, token)
  }
  return { success: true }
})