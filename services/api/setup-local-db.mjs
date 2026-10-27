import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const paths = [".env.mongo", "services/api/.env", "services/api/.env.test"];
if (paths.some((path) => existsSync(new URL(path, root)))) {
  console.error(
    "Setup stopped: a local environment file already exists. Preserve it and follow README instructions.",
  );
  process.exitCode = 1;
} else {
  const secret = () => randomBytes(32).toString("hex");
  const dev = secret();
  const test = secret();
  const contents = [
    `MONGO_DEV_ADMIN_PASSWORD=${secret()}\nMONGO_TEST_ADMIN_PASSWORD=${secret()}\nMONGO_DEV_PASSWORD=${dev}\nMONGO_TEST_PASSWORD=${test}\n`,
    `PORT=3000\nMAIL_MODE=local\nMONGODB_URI=mongodb://spendwise_dev:${dev}@127.0.0.1:27117/spendwise_dev?authSource=spendwise_dev\n`,
    `MONGODB_TEST_URI=mongodb://spendwise_test:${test}@127.0.0.1:27118/spendwise_test?authSource=spendwise_test\n`,
  ];
  for (let i = 0; i < paths.length; i++) {
    writeFileSync(new URL(paths[i], root), contents[i], {
      flag: "wx",
      mode: 0o600,
    });
  }
  console.log(
    "Created ignored local environment files with distinct generated credentials. No credentials were printed.",
  );
}
