export function readConfig(env: NodeJS.ProcessEnv) {
  const value = env.PORT ?? "3000";
  const port = Number(value);
  if (
    !/^\d+$/.test(value) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return { host: "127.0.0.1", port };
}

export function readDatabaseUri(env: NodeJS.ProcessEnv) {
  if (
    env.NODE_ENV &&
    !["development", "test", "production"].includes(env.NODE_ENV)
  ) {
    throw new Error("NODE_ENV must be development, test, or production.");
  }
  const uri = env.MONGODB_URI;
  if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri)) {
    throw new Error("MONGODB_URI must be a MongoDB connection string.");
  }
  if (env.NODE_ENV === "production") {
    const options = new URLSearchParams();
    for (const [key, value] of new URLSearchParams(uri.split("?")[1] ?? "")) {
      if (options.has(key.toLowerCase()))
        throw new Error(
          "Duplicate MongoDB options are not permitted in production.",
        );
      options.set(key.toLowerCase(), value.toLowerCase());
    }
    if (
      options.get("tls") === "false" ||
      options.get("ssl") === "false" ||
      options.get("tlsallowinvalidcertificates") === "true" ||
      options.get("tlsallowinvalidhostnames") === "true" ||
      options.get("tlsinsecure") === "true" ||
      (!uri.startsWith("mongodb+srv://") && options.get("tls") !== "true")
    ) {
      throw new Error("Production MongoDB requires verified TLS.");
    }
  }
  return uri;
}
