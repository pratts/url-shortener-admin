// Adjusts the OpenAPI document converted from the backend's Swagger 2 docs so
// generated TypeScript types match the real API: the Swagger generator marks
// no field as required and cannot express a nullable next_cursor.
//
//   node scripts/fix-openapi.mjs docs/openapi.json
import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2] ?? "docs/openapi.json";
const doc = JSON.parse(readFileSync(path, "utf8"));
const schemas = doc.components.schemas;

// Response bodies always contain every field.
for (const name of ["shortlink.View", "user.Profile", "user.Session", "shortlink.Page"]) {
  schemas[name].required = Object.keys(schemas[name].properties).sort();
}

// next_cursor is null on the last page.
schemas["shortlink.Page"].properties.next_cursor = {
  type: "string",
  nullable: true,
  description: "Cursor for the next page; null on the last page.",
};

// Required request fields.
schemas["user.LoginInput"].required = ["email", "password"];
schemas["user.RegisterInput"].required = ["email", "name", "password"];
schemas["shortlink.Input"].required = ["url"];

doc.servers = [
  { url: "http://localhost:8086/api/v1", description: "local" },
  { url: "https://api.tidylnk.com/api/v1", description: "production (example)" },
];

writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
console.log(`updated ${path}`);
