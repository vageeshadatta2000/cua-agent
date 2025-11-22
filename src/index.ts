import { CUAAgent } from './core/CUAAgent';
import { CUAConfig } from './core/types';

// Default configuration
const defaultConfig: CUAConfig = {
  browser: {
    headless: false, // Set to true for production
    viewport: {
      width: 1280,
      height: 720
    },
    timeout: 30000
  },
  llm: {
    model: 'claude-sonnet-4-5-20250929',
    api_key: process.env.ANTHROPIC_API_KEY || '',
    max_tokens: 4096,
    temperature: 0
  },
  agent: {
    max_actions_per_task: 50,
    max_retries: 3,
    default_wait_after_navigation: 2000,
    screenshot_quality: 80
  }
};

// Export main classes and types
export { CUAAgent } from './core/CUAAgent';
export { BrowserController } from './browser/BrowserController';
export { LLMClient } from './llm/LLMClient';
export { ToolExecutor } from './core/ToolExecutor';
export * from './core/types';
export { createLogger } from './utils/logger';

// Main entry point for CLI usage
async function main() {
  const task = process.argv[2];

  if (!task) {
    console.log('Usage: npx ts-node src/index.ts "Your task description"');
    console.log('');
    console.log('Example:');
    console.log('  npx ts-node src/index.ts "Navigate to google.com and search for TypeScript"');
    console.log('');
    console.log('Environment variables:');
    console.log('  ANTHROPIC_API_KEY - Your Anthropic API key (required)');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  const agent = new CUAAgent(defaultConfig);

  try {
    await agent.initialize();
    console.log('Agent initialized. Starting task...\n');

    const result = await agent.executeTask(task);

    console.log('\n--- Task Result ---');
    console.log(result);
    console.log('-------------------\n');

    // Print action summary
    const history = agent.getActionHistory();
    console.log(`Total actions executed: ${history.length}`);

    const totalTime = history.reduce((sum, h) => sum + h.duration_ms, 0);
    console.log(`Total execution time: ${totalTime}ms`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await agent.close();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
