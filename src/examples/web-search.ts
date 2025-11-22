/**
 * Example: Web search and data extraction
 *
 * Demonstrates:
 * - Navigation
 * - Form filling
 * - Text extraction
 * - Multi-step workflow
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
    max_actions_per_task: 20,
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
      Search for "TypeScript best practices 2024" on Google and extract the titles of the first 5 results.

      Steps:
      1. Take screenshot to see current state
      2. Navigate to google.com
      3. Wait for page to load
      4. Click on the search input field
      5. Type "TypeScript best practices 2024"
      6. Press Enter to search
      7. Wait for results to load
      8. Use get_page_text to extract the search results
      9. Report the titles of the first 5 results
    `);

    console.log('Search Results:', result);

  } finally {
    await agent.close();
  }
}

main().catch(console.error);
