import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

function countFilesByExt(dir, ext, maxDepth, depth = 0) {
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.next', 'vendor']);
  if (depth > maxDepth) return 0;
  let count = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          count += countFilesByExt(join(dir, entry.name), ext, maxDepth, depth + 1);
        }
      } else if (entry.name.endsWith('.' + ext)) {
        count++;
      }
    }
  } catch { /* permission error or unreadable dir */ }
  return count;
}

export function collectProjectInfo() {
  const data = {};

  try {
    const cwd = process.cwd();

    // Package.json — tech stack detection
    const pkgPath = join(cwd, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        data.hasPackageJson = true;
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        const depNames = Object.keys(allDeps);
        data.depCount = depNames.length;

        // Major frameworks
        data.usesReact = depNames.some(d => d === 'react' || d === 'next');
        data.usesVue = depNames.some(d => d === 'vue' || d === 'nuxt');
        data.usesSvelte = depNames.some(d => d.includes('svelte'));
        data.usesTypescript = depNames.some(d => d === 'typescript');
        data.usesTailwind = depNames.some(d => d.includes('tailwind'));
        data.usesExpress = depNames.some(d => d === 'express' || d === 'fastify' || d === 'hono');
        data.usesPrisma = depNames.some(d => d === 'prisma' || d === '@prisma/client');
        data.projectType = pkg.type || 'commonjs';

        // AI SDK detection
        data.usesAnthropicSDK = depNames.some(d => d.includes('anthropic'));
        data.usesOpenAISDK = depNames.includes('openai');
        data.usesLangChain = depNames.some(d => d.includes('langchain'));
        data.usesVercelAI = depNames.includes('ai');
        data.usesLlamaIndex = depNames.some(d => d.includes('llamaindex'));
        data.usesGoogleAI = depNames.some(d => d.includes('generative-ai'));
        data.usesSupabase = depNames.some(d => d.includes('supabase'));
        data.usesFirebase = depNames.some(d => d.includes('firebase'));
        data.usesStripe = depNames.includes('stripe');
        data.usesAuth = depNames.some(d => d.includes('next-auth') || d.includes('clerk') || d.includes('lucia') || d.includes('auth0'));
        data.usesORM = depNames.some(d => d.includes('prisma') || d.includes('drizzle') || d.includes('typeorm') || d.includes('sequelize') || d.includes('mongoose'));
        data.usesRedis = depNames.some(d => d.includes('redis') || d.includes('ioredis'));
        data.usesQueue = depNames.some(d => d.includes('bullmq') || d.includes('bee-queue'));
        data.usesWebSocket = depNames.some(d => d.includes('socket.io') || d.includes('ws'));
        data.usesZod = depNames.includes('zod');
        data.usesTRPC = depNames.some(d => d.includes('trpc'));
        data.usesGraphQL = depNames.some(d => d.includes('graphql') || d.includes('apollo'));
      } catch {}
    } else {
      data.hasPackageJson = false;
    }

    // Language detection
    data.isPython = existsSync(join(cwd, 'requirements.txt')) || existsSync(join(cwd, 'pyproject.toml'));
    data.isRust = existsSync(join(cwd, 'Cargo.toml'));
    data.isGo = existsSync(join(cwd, 'go.mod'));

    // CWD file count
    try {
      const cwdFiles = readdirSync(cwd);
      data.cwdFileCount = cwdFiles.length;
      data.hasSrcDir = cwdFiles.includes('src');
      data.hasTestDir = cwdFiles.includes('test') || cwdFiles.includes('tests') || cwdFiles.includes('__tests__');
    } catch {}

    // Package manager
    data.packageManager = existsSync(join(cwd, 'bun.lockb')) ? 'bun'
      : existsSync(join(cwd, 'pnpm-lock.yaml')) ? 'pnpm'
      : existsSync(join(cwd, 'yarn.lock')) ? 'yarn'
      : existsSync(join(cwd, 'package-lock.json')) ? 'npm' : 'none';

    // Monorepo detection
    data.isMonorepo = existsSync(join(cwd, 'lerna.json'))
      || existsSync(join(cwd, 'nx.json'))
      || existsSync(join(cwd, 'turbo.json'))
      || existsSync(join(cwd, 'pnpm-workspace.yaml'));

    // Infra signals
    data.hasDocker = existsSync(join(cwd, 'Dockerfile')) || existsSync(join(cwd, 'docker-compose.yml'));
    data.hasCI = existsSync(join(cwd, '.github/workflows')) || existsSync(join(cwd, '.gitlab-ci.yml'));
    data.deployment = existsSync(join(cwd, 'vercel.json')) ? 'vercel'
      : existsSync(join(cwd, 'netlify.toml')) ? 'netlify'
      : existsSync(join(cwd, 'fly.toml')) ? 'fly'
      : existsSync(join(cwd, 'railway.json')) ? 'railway'
      : existsSync(join(cwd, 'amplify.yml')) ? 'aws' : 'unknown';

    // Testing & quality
    data.hasTests = existsSync(join(cwd, 'jest.config.js')) || existsSync(join(cwd, 'vitest.config.ts')) || existsSync(join(cwd, 'vitest.config.js')) || existsSync(join(cwd, '.mocharc.yml'));
    data.hasLinting = existsSync(join(cwd, '.eslintrc.json')) || existsSync(join(cwd, '.eslintrc.js')) || existsSync(join(cwd, 'biome.json')) || existsSync(join(cwd, '.prettierrc'));
    data.hasEnvFile = existsSync(join(cwd, '.env')) || existsSync(join(cwd, '.env.local'));
    data.hasReadme = existsSync(join(cwd, 'README.md'));
    data.hasLicense = existsSync(join(cwd, 'LICENSE')) || existsSync(join(cwd, 'LICENSE.md'));

    // Bundler
    data.bundler = existsSync(join(cwd, 'vite.config.ts')) || existsSync(join(cwd, 'vite.config.js')) ? 'vite'
      : existsSync(join(cwd, 'webpack.config.js')) ? 'webpack'
      : existsSync(join(cwd, 'next.config.js')) || existsSync(join(cwd, 'next.config.ts')) ? 'next'
      : existsSync(join(cwd, 'esbuild.config.js')) ? 'esbuild' : 'unknown';

    // API/backend signals
    data.hasGraphQL = existsSync(join(cwd, 'schema.graphql')) || existsSync(join(cwd, 'schema.gql'));
    data.hasOpenAPI = existsSync(join(cwd, 'openapi.yaml')) || existsSync(join(cwd, 'swagger.json'));

    // File type distribution
    try {
      data.filesByType = {
        js: countFilesByExt(cwd, 'js', 4), ts: countFilesByExt(cwd, 'ts', 4),
        tsx: countFilesByExt(cwd, 'tsx', 4), jsx: countFilesByExt(cwd, 'jsx', 4),
        py: countFilesByExt(cwd, 'py', 4), go: countFilesByExt(cwd, 'go', 4),
        rs: countFilesByExt(cwd, 'rs', 4), java: countFilesByExt(cwd, 'java', 4),
        rb: countFilesByExt(cwd, 'rb', 4), php: countFilesByExt(cwd, 'php', 4),
        swift: countFilesByExt(cwd, 'swift', 4), kt: countFilesByExt(cwd, 'kt', 4),
        md: countFilesByExt(cwd, 'md', 4), json: countFilesByExt(cwd, 'json', 4),
        yaml: countFilesByExt(cwd, 'yaml', 4) + countFilesByExt(cwd, 'yml', 4),
        css: countFilesByExt(cwd, 'css', 4), html: countFilesByExt(cwd, 'html', 4),
        sql: countFilesByExt(cwd, 'sql', 4),
      };
    } catch {}

    // Project structure signals
    data.hasTodoFile = existsSync(join(cwd, 'TODO.md')) || existsSync(join(cwd, 'TASKS.md'));
    data.hasPlanFile = existsSync(join(cwd, 'plan.md')) || existsSync(join(cwd, 'ROADMAP.md'));
    data.hasChangelog = existsSync(join(cwd, 'CHANGELOG.md'));
    data.hasContributing = existsSync(join(cwd, 'CONTRIBUTING.md'));

    // Development maturity signals
    data.hasTypeConfig = existsSync(join(cwd, 'tsconfig.json'));
    data.hasBiome = existsSync(join(cwd, 'biome.json'));
    data.hasNixFile = existsSync(join(cwd, 'flake.nix')) || existsSync(join(cwd, 'shell.nix'));
    data.hasDevcontainer = existsSync(join(cwd, '.devcontainer'));

    // Security posture
    data.hasGitignore = existsSync(join(cwd, '.gitignore'));
    data.hasSecurityPolicy = existsSync(join(cwd, 'SECURITY.md'));
    data.hasCodeowners = existsSync(join(cwd, '.github', 'CODEOWNERS'));
    data.hasPRTemplate = existsSync(join(cwd, '.github', 'pull_request_template.md'));
    data.hasIssueTemplates = existsSync(join(cwd, '.github', 'ISSUE_TEMPLATE'));

    // Build tools
    data.hasMakefile = existsSync(join(cwd, 'Makefile'));
    data.hasJustfile = existsSync(join(cwd, 'justfile'));
  } catch {
    // never throw from telemetry collectors
  }

  return data;
}
