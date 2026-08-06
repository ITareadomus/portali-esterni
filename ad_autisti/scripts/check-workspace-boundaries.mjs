import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
]);

const sourceFilePattern = /\.(cjs|cts|js|jsx|mjs|mts|ts|tsx)$/;
const importPatterns = [
  /\bimport\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g,
  /\bexport\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g,
  /\bimport\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const packageDependencyKeys = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

function packageBoundary(packageName) {
  return [packageName, `${packageName}/`];
}

const webForbiddenImports = [
  ...packageBoundary("@adam/api"),
  ...packageBoundary("@adam/db"),
  "@nestjs/",
  "@prisma/",
  ...packageBoundary("prisma"),
  ...packageBoundary("mariadb"),
  "better-auth",
  "better-auth/adapters/",
  ...packageBoundary("better-auth/node"),
  ...packageBoundary("better-auth/next-js"),
  ...packageBoundary("apps/api"),
  ...packageBoundary("packages/db"),
];

const webForbiddenDependencies = webForbiddenImports.filter(
  (specifier) => specifier !== "better-auth" && !specifier.startsWith("better-auth/"),
);

const rules = [
  {
    scope: "apps/web",
    message: "apps/web must stay frontend/BFF-only and must not import backend, db, or server-auth code.",
    forbiddenImports: webForbiddenImports,
    forbiddenDependencies: webForbiddenDependencies,
    forbiddenWorkspaceTargets: ["apps/api", "packages/db"],
  },
  {
    scope: "apps/api",
    message: "apps/api must not depend on frontend code or frontend frameworks.",
    forbiddenImports: [
      ...packageBoundary("@adam/web"),
      ...packageBoundary("next"),
      ...packageBoundary("react"),
      ...packageBoundary("react-dom"),
      ...packageBoundary("apps/web"),
    ],
    forbiddenWorkspaceTargets: ["apps/web"],
  },
  {
    scope: "packages/types",
    message: "packages/types must remain neutral shared types without app, db, or framework dependencies.",
    forbiddenImports: [
      ...packageBoundary("@adam/api"),
      ...packageBoundary("@adam/db"),
      ...packageBoundary("@adam/web"),
      "@nestjs/",
      "@prisma/",
      ...packageBoundary("prisma"),
      ...packageBoundary("mariadb"),
      ...packageBoundary("next"),
      ...packageBoundary("react"),
      ...packageBoundary("react-dom"),
      ...packageBoundary("better-auth"),
      ...packageBoundary("apps/api"),
      ...packageBoundary("apps/web"),
      ...packageBoundary("packages/db"),
    ],
    forbiddenWorkspaceTargets: ["apps/api", "apps/web", "packages/db"],
  },
  {
    scope: "packages/db",
    message: "packages/db must stay persistence-only and must not depend on app or UI framework code.",
    forbiddenImports: [
      ...packageBoundary("@adam/api"),
      ...packageBoundary("@adam/web"),
      "@nestjs/",
      ...packageBoundary("next"),
      ...packageBoundary("react"),
      ...packageBoundary("react-dom"),
      ...packageBoundary("apps/api"),
      ...packageBoundary("apps/web"),
    ],
    forbiddenWorkspaceTargets: ["apps/api", "apps/web"],
  },
];

const violations = [];

function toWorkspacePath(path) {
  return relative(workspaceRoot, path).split(sep).join("/");
}

function isPackageJson(path) {
  return path.endsWith(`${sep}package.json`);
}

function isRelativeSpecifier(specifier) {
  return specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../");
}

function matchesForbiddenSpecifier(specifier, forbiddenSpecifier) {
  if (forbiddenSpecifier.endsWith("/")) {
    return specifier.startsWith(forbiddenSpecifier);
  }

  return specifier === forbiddenSpecifier;
}

function matchesWorkspaceTarget(workspacePath, target) {
  return workspacePath === target || workspacePath.startsWith(`${target}/`);
}

function findRule(path) {
  const workspacePath = toWorkspacePath(path);
  return rules.find((rule) => workspacePath === rule.scope || workspacePath.startsWith(`${rule.scope}/`));
}

function collectImportSpecifiers(source) {
  const specifiers = [];

  for (const pattern of importPatterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

function resolveWorkspaceSpecifier(importerPath, specifier) {
  if (!isRelativeSpecifier(specifier)) return null;

  const resolvedPath = resolve(dirname(importerPath), specifier);
  const workspacePath = toWorkspacePath(resolvedPath);

  if (workspacePath.startsWith("../")) return null;
  return workspacePath;
}

function recordSpecifierViolation(path, rule, specifier, forbiddenSpecifier) {
  violations.push({
    path: toWorkspacePath(path),
    message: rule.message,
    detail: `import "${specifier}" matches forbidden boundary "${forbiddenSpecifier}"`,
  });
}

function recordWorkspaceTargetViolation(path, rule, specifier, target) {
  violations.push({
    path: toWorkspacePath(path),
    message: rule.message,
    detail: `relative import "${specifier}" resolves inside forbidden workspace path "${target}"`,
  });
}

function checkSpecifiers(path, rule, specifiers) {
  for (const specifier of specifiers) {
    for (const forbiddenSpecifier of rule.forbiddenImports) {
      if (matchesForbiddenSpecifier(specifier, forbiddenSpecifier)) {
        recordSpecifierViolation(path, rule, specifier, forbiddenSpecifier);
      }
    }

    const resolvedWorkspacePath = resolveWorkspaceSpecifier(path, specifier);
    if (!resolvedWorkspacePath) continue;

    for (const target of rule.forbiddenWorkspaceTargets ?? []) {
      if (matchesWorkspaceTarget(resolvedWorkspacePath, target)) {
        recordWorkspaceTargetViolation(path, rule, specifier, target);
      }
    }
  }
}

function checkPackageDependencies(path, rule, packageJson) {
  const forbiddenDependencies = rule.forbiddenDependencies ?? rule.forbiddenImports;

  for (const key of packageDependencyKeys) {
    const dependencies = packageJson[key] ?? {};

    for (const dependencyName of Object.keys(dependencies)) {
      for (const forbiddenSpecifier of forbiddenDependencies) {
        if (matchesForbiddenSpecifier(dependencyName, forbiddenSpecifier)) {
          violations.push({
            path: toWorkspacePath(path),
            message: rule.message,
            detail: `${key} dependency "${dependencyName}" matches forbidden boundary "${forbiddenSpecifier}"`,
          });
        }
      }
    }
  }
}

async function checkFile(path) {
  const rule = findRule(path);

  if (!rule) return;

  const source = await readFile(path, "utf8");

  if (isPackageJson(path)) {
    checkPackageDependencies(path, rule, JSON.parse(source));
    return;
  }

  if (!sourceFilePattern.test(path)) return;

  checkSpecifiers(path, rule, collectImportSpecifiers(source));
}

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }

    await checkFile(path);
  }
}

await walk(workspaceRoot);

if (violations.length > 0) {
  console.error("Workspace boundary violations found:");

  for (const violation of violations) {
    console.error(`- ${violation.path}`);
    console.error(`  ${violation.message}`);
    console.error(`  ${violation.detail}`);
  }

  process.exit(1);
}

console.log("Workspace boundaries OK.");
