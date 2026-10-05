// TEST-ONLY: ADR-015 §2 parsed from the accepted ADR file.
import { readFileSync } from "node:fs";

// The test IS the spec: the expected matrix is parsed from ADR-015 §2 itself, so the code and the
// accepted ADR cannot drift apart silently.
export const ADR = readFileSync(new URL("../../../docs/decisions/ADR-015-DEFAULT_ROLES_AND_PERMISSIONS.md", import.meta.url), "utf8");

function adrMatrix() {
  const section = ADR.slice(ADR.indexOf("### Role × permission matrix"));
  const start = section.indexOf("\n|") + 1;
  const lines = section.slice(start, section.indexOf("\n\n", start)).split("\n"); // the table only
  const roles = lines[0]!.split("|").slice(2, -1).map((c) => c.trim());
  const matrix = new Map<string, string[]>(roles.map((r) => [r, []]));
  const keys: string[] = [];
  for (const line of lines.slice(2)) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const key = cells[0]!.replaceAll("`", "");
    keys.push(key);
    roles.forEach((r, i) => cells[i + 1] === "✓" && matrix.get(r)!.push(key));
  }
  return { roles, keys, matrix };
}

export const ADR_MATRIX = adrMatrix();

