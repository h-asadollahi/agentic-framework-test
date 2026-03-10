import "dotenv/config";
import {
  exportLearnedRoutesFromDbToJson,
  importLearnedRoutesFromJsonToDb,
} from "../src/routing/learned-routes-migration.js";

const direction = process.argv[2] ?? "import";
const jsonFile = process.argv[3];

if (direction !== "import" && direction !== "export") {
  console.error("Usage:");
  console.error("  npx tsx scripts/learned-routes-backfill.ts import [json-file]");
  console.error("  npx tsx scripts/learned-routes-backfill.ts export [json-file]");
  process.exit(1);
}

if (direction === "import") {
  const result = await importLearnedRoutesFromJsonToDb({
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
  const result = await exportLearnedRoutesFromDbToJson({
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

