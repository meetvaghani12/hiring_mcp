import { createCandidate } from "../auth.js";
import { pool } from "../db/index.js";

async function main() {
  const name = process.argv[2];
  const email = process.argv[3];
  const { candidate, token } = await createCandidate({ name, email });
  console.log("Candidate created:");
  console.log("  id:    ", candidate.id);
  console.log("  name:  ", candidate.name ?? "(none)");
  console.log("  email: ", candidate.email ?? "(none)");
  console.log("\nBearer token (store now, not retrievable later):\n");
  console.log("  " + token);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
