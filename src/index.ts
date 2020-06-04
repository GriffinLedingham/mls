import app from "./app"

export default app.listen(app.get("port"), () => {
  console.log(`Server running on port ${app.get('port')}...`)
  console.log("  Press CTRL-C to stop\n")
})