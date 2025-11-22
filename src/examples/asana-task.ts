/**
 * Example: Execute any task using the CUA Agent
 *
 * Usage:
 *   npx ts-node src/examples/asana-task.ts "Create a task called 'Review docs' in Asana"
 *   npx ts-node src/examples/asana-task.ts "Search for TypeScript tutorials on Google"
 *
 * The agent will automatically generate the execution steps based on the task.
 */

import 'dotenv/config';
import { CUAAgent } from '../core/CUAAgent';
import { CUAConfig } from '../core/types';
import { TaskPlanner, TaskContext } from '../core/TaskPlanner';
import { createLogger } from '../utils/logger';
import * as readline from 'readline';

const config: CUAConfig = {
  browser: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    timeout: 30000
  },
  llm: {
    model: 'claude-3-5-haiku-20241022',
    api_key: process.env.ANTHROPIC_API_KEY || '',
    max_tokens: 4096,
    temperature: 0
  },
  agent: {
    max_actions_per_task: 50,
    max_retries: 3,
    default_wait_after_navigation: 5000, // Fix: Increased for SPAs like Asana
    screenshot_quality: 80
  }
};

async function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  // Get task from command line argument or prompt user
  let task = process.argv[2];

  if (!task) {
    console.log('CUA Agent - Computer Use Agent\n');
    task = await promptUser('Enter your task: ');
  }

  if (!task.trim()) {
    console.error('Error: No task provided');
    process.exit(1);
  }

  console.log(`\nTask: ${task}\n`);

  // Generate detailed plan first
  const logger = createLogger('info');
  const planner = new TaskPlanner(config.llm, logger);

  console.log('Generating detailed execution plan...\n');

  // Optional: Add context for the task
  const context: TaskContext = {
    current_url: 'about:blank',
    browser_state: 'unknown',
    max_actions: 20,
    timeout_seconds: 120,
    // success_criteria: 'Task appears in the task list'
  };

  const detailedTask = await planner.createDetailedTask(task, context);

  console.log('--- Generated Plan ---');
  console.log(detailedTask);
  console.log('----------------------\n');

  console.log('Initializing agent...\n');

  const agent = new CUAAgent(config);

  try {
    await agent.initialize();

    // Execute with the detailed plan
    const result = await agent.executeTask(detailedTask);

    console.log('\n--- Result ---');
    console.log(result);
    console.log('--------------\n');

    // Print action breakdown
    const history = agent.getActionHistory();
    console.log('Action Breakdown:');
    history.forEach((action, i) => {
      console.log(`${i + 1}. ${action.tool} (${action.duration_ms}ms)`);
      if (action.error) {
        console.log(`   Error: ${action.error}`);
      }
    });

    const totalTime = history.reduce((sum, h) => sum + h.duration_ms, 0);
    console.log(`\nTotal: ${history.length} actions in ${totalTime}ms`);

  } finally {
    await agent.close();
  }
}

main().catch(console.error);
