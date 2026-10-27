// Executed by mongosh only when initializing a new, empty database volume.
const database = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE);
database.createUser({
  user: process.env.APP_USER,
  pwd: process.env.APP_PASSWORD,
  roles: [{ role: "readWrite", db: process.env.MONGO_INITDB_DATABASE }],
});
