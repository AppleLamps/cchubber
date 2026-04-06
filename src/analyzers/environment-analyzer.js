import { collectGitInfo } from '../collectors/git-info.js';
import { collectProjectInfo } from '../collectors/project-info.js';
import { collectToolsInfo } from '../collectors/tools-detection.js';
import { collectSystemInfo } from '../collectors/system-info.js';
import { collectClaudeConfig } from '../collectors/claude-config.js';

/**
 * Analyze the user's environment and produce a structured profile
 * for display in the terminal summary and HTML report.
 */
export function analyzeEnvironment(claudeDir) {
  const git = collectGitInfo();
  const project = collectProjectInfo();
  const tools = collectToolsInfo();
  const system = collectSystemInfo();
  const claude = collectClaudeConfig(claudeDir);

  // Derive insights
  const languages = [];
  if (project.filesByType) {
    const types = project.filesByType;
    const sorted = Object.entries(types)
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a);
    for (const [ext, count] of sorted.slice(0, 5)) {
      languages.push({ ext, count });
    }
  }

  const frameworks = [];
  if (project.usesReact) frameworks.push('React');
  if (project.usesVue) frameworks.push('Vue');
  if (project.usesSvelte) frameworks.push('Svelte');
  if (project.usesExpress) frameworks.push('Express/Fastify');
  if (project.usesPrisma) frameworks.push('Prisma');
  if (project.usesTypescript) frameworks.push('TypeScript');
  if (project.usesTailwind) frameworks.push('Tailwind');
  if (project.usesGraphQL) frameworks.push('GraphQL');
  if (project.isPython) frameworks.push('Python');
  if (project.isRust) frameworks.push('Rust');
  if (project.isGo) frameworks.push('Go');

  // Use rich aiTools array from collector (includes versions)
  const aiTools = tools.aiTools || [];

  const maturitySignals = [];
  if (project.hasTests) maturitySignals.push('Testing configured');
  if (project.hasLinting) maturitySignals.push('Linting configured');
  if (project.hasCI) maturitySignals.push('CI/CD configured');
  if (project.hasDocker) maturitySignals.push('Docker configured');
  if (project.hasTypeConfig) maturitySignals.push('TypeScript configured');
  if (project.isMonorepo) maturitySignals.push('Monorepo');
  if (project.hasSecurityPolicy) maturitySignals.push('Security policy');
  if (project.hasCodeowners) maturitySignals.push('CODEOWNERS');

  return {
    available: true,
    system: {
      os: system.os,
      arch: system.arch,
      osVersion: system.osVersion,
      nodeVersion: system.nodeVersion,
      cpuCores: system.cpuCores,
      ramGB: system.ramGB,
      editor: tools.editor,
      shell: tools.shell,
      isWSL: system.isWSL,
      isDocker: system.isDocker,
      isCI: system.isCI,
    },
    git: {
      isGitRepo: git.isGitRepo,
      host: git.gitHost,
      commits: git.gitCommitCount,
      branches: git.gitBranchCount,
      contributors: git.gitContributors,
      daysSinceLastCommit: git.daysSinceLastCommit,
    },
    project: {
      packageManager: project.packageManager,
      depCount: project.depCount || 0,
      bundler: project.bundler,
      deployment: project.deployment,
      projectType: project.projectType,
    },
    languages,
    frameworks,
    aiTools,
    maturitySignals,
    claude: {
      version: claude.ccVersion,
      mcpServers: claude.mcpServers || [],
      mcpServerCount: claude.mcpServerCount || 0,
      localMcpCount: claude.localMcpCount || 0,
      hasHooks: claude.hasHooks,
      hookCount: claude.hookCount || 0,
      skillCount: claude.skillCount || 0,
      hasClaudeignore: claude.hasClaudeignore,
      hasGlobalClaudeMd: claude.hasGlobalClaudeMd,
      authMethod: claude.authMethod,
      installDays: claude.ccInstallDays,
      totalConversations: claude.totalConversations || 0,
      jsonlTotalMB: claude.jsonlTotalMB || 0,
    },
  };
}
