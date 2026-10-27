import { MongoClient } from "mongodb";

export async function connectDatabase(uri: string) {
  let client: MongoClient | undefined;
  try {
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      waitQueueTimeoutMS: 5000,
      maxPoolSize: 5,
      writeConcern: { w: "majority", j: true },
    });
    await client.connect();
    await client.db().command({ ping: 1 });
    return client;
  } catch {
    await client?.close();
    throw new Error(
      "Database connection failed. Check local MongoDB and its configuration.",
    );
  }
}
