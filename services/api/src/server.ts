import { createApp } from "./app.js";
import { readConfig, readDatabaseUri } from "./config.js";
import { connectDatabase } from "./database.js";
import { product } from "./product.js";
import { mailDelivery } from "./mail.js";

async function start() {
  let config;
  let uri;
  try {
    config = readConfig(process.env);
    uri = readDatabaseUri(process.env);
  } catch {
    console.error(
      "API configuration invalid: PORT must be an integer between 1 and 65535; MONGODB_URI is required.",
    );
    process.exitCode = 1;
    return;
  }
  const client = await connectDatabase(uri);
  let routes;
  try {
    routes = await product(client.db(), mailDelivery(process.env));
  } catch (error) {
    await client.close();
    throw error;
  }
  const { host, port } = config;
  const server = createApp(
    routes,
    process.env.NODE_ENV === "production",
  ).listen(port, host, (error?: Error) => {
    if (!error) console.log(`API listening at http://${host}:${port}`);
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    try {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        });
      }
    } finally {
      await client.close();
    }
  }
  function shutdown() {
    void close().catch(() => {
      console.error("API failed to shut down cleanly.");
      process.exitCode = 1;
    });
  }
  server.on("error", () => {
    console.error("API failed to listen. Check PORT and whether it is in use.");
    process.exitCode = 1;
    shutdown();
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, shutdown);
  }
}

void start().catch(() => {
  console.error("API startup failed. Check database and email configuration.");
  process.exitCode = 1;
});
