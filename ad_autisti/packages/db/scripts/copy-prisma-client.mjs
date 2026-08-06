import { cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(currentDir, "..");
const source = join(packageRoot, "src", "generated", "prisma");
const target = join(packageRoot, "dist", "generated", "prisma");

await cp(source, target, { recursive: true, force: true, errorOnExist: false });
