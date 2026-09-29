import { loadDemos } from "../src/lib/seed";
loadDemos().then((r) => { console.log(r.skipped ? "Demo examples already present." : "Demo examples loaded."); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
