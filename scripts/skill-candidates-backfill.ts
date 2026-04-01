import "dotenv/config";
import {
  exportSkillCandidatesFromDbToJson,
  importSkillCandidatesFromJsonToDb,
} from "../src/routing/skill-candidates-migration.js";

const direction = process.argv[2] ?? "import";
const jsonFile = process.argv[3];

if (direction !== "import" && direction !== "export") {
  console.error("Usage:");
  console.error("  npx tsx scripts/skill-candidates-backfill.ts import [json-file]");
  console.error("  npx tsx scripts/skill-candidates-backfill.ts export [json-file]");
  process.exit(1);
}

if (direction === "import") {
  const result = await importSkillCandidatesFromJsonToDb({
    jsonFile: jsonFile || undefined,
  });
  console.log(
    JSON.stringify(
      {
        direction,
        ...result,
      },
      null,
      2
    )
  );
} else {
  const result = await exportSkillCandidatesFromDbToJson({
    jsonFile: jsonFile || undefined,
  });
  console.log(
    JSON.stringify(
      {
        direction,
        ...result,
      },
      null,
      2
    )
  );
}
