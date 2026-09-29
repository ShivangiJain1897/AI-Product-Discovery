import fs from "node:fs";
import path from "node:path";
const f = process.env.CLARITY_DB_PATH || path.join(process.cwd(), "data", "clarity.db");
for (const s of ["", "-wal", "-shm"]) if (fs.existsSync(f + s)) fs.rmSync(f + s);
console.log("Database removed:", f);
