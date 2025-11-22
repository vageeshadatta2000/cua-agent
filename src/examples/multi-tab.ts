/**
 * Example: Multi-tab workflow
 *
 * Demonstrates:
 * - Creating multiple tabs
 * - Switching between tabs
 * - Parallel information gathering
 */

import { CUAAgent } from '../core/CUAAgent';
import { CUAConfig } from '../core/types';

const config: CUAConfig = {
  browser: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    timeout: 30000
  },
  llm: {
    model: 'claude-sonnet-4-5-20250929',
    api_key: process.env.ANTHROPIC_API_KEY || '',
    max_tokens: 4096,
    temperature: 0
  },
  agent: {
    max_actions_per_task: 40,
    max_retries: 3,
    default_wait_after_navigation: 2000,
    screenshot_quality: 80
  }
};

async function main() {
  const agent = new CUAAgent(config);

  try {
    await agent.initialize();

    const result = await agent.executeTask(`
      Research TypeScript and Rust by opening documentation pages in separate tabs.

      Steps:
      1. Create a new tab and navigate to typescriptlang.org
      2. Use get_page_text to extract the main tagline/description
      3. Create another new tab and navigate to rust-lang.org
      4. Use get_page_text to extract the main tagline/description
      5. Use tabs_context to see all open tabs
      6. Summarize what each language is about based on their homepage descriptions

      Remember to track tab_ids when creating new tabs.
    `);

    console.log('Research Results:', result);

  } finally {
    await agent.close();
  }
}

main().catch(console.error);
