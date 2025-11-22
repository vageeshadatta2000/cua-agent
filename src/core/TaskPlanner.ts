import { LLMClient } from '../llm/LLMClient';
import { CUAConfig } from './types';
import { Logger } from '../utils/logger';

export interface TaskContext {
  current_url?: string;
  browser_state?: 'logged_in' | 'logged_out' | 'unknown';
  previous_actions?: string[];
  max_actions?: number;
  timeout_seconds?: number;
  success_criteria?: string;
}

const PLANNER_PROMPT = `You are a task planning assistant for a web automation agent. Given a user's task, generate detailed step-by-step instructions that the automation agent should follow.

Your steps should be:
1. Specific and actionable
2. Include wait times for page loads (especially for SPAs)
3. Include verification steps (screenshots to confirm success)
4. Handle potential edge cases (login pages, popups, etc.)
5. Use the correct tool names: screenshot, navigate, wait, click, type, find, read_page, get_page_text

Format your response as a numbered list of detailed steps. Each step should specify:
- What action to take
- What to look for/verify
- How long to wait if needed
- What to do if something goes wrong

Example for "Search for TypeScript on Google":
1. Take a screenshot to observe the current browser state
2. Navigate to https://google.com
3. Wait 2 seconds for the page to fully load
4. Take a screenshot to verify Google's homepage loaded correctly
5. Find the search input field (look for textarea or input with aria-label "Search")
6. Click on the search input field to focus it
7. Type "TypeScript" into the search field
8. Press Enter key to submit the search
9. Wait 2-3 seconds for search results to load
10. Take a screenshot to verify search results appeared
11. If results show, report success with the page title. If not, check for CAPTCHAs or errors.

Now generate detailed steps for the following task:`;

export class TaskPlanner {
  private llm: LLMClient;
  private logger: Logger;

  constructor(config: CUAConfig['llm'], logger: Logger) {
    this.llm = new LLMClient(config, logger);
    this.logger = logger;
  }

  async generatePlan(task: string): Promise<string> {
    this.logger.info('Generating task plan...', { task });

    const response = await this.llm.chat(
      [
        {
          role: 'user',
          content: `${PLANNER_PROMPT}\n\nTask: "${task}"`
        }
      ],
      [], // No tools needed for planning
      'You are a helpful task planning assistant.'
    );

    // Extract text from response
    const textBlock = response.content.find(block => block.type === 'text');
    const plan = textBlock?.text || '';

    this.logger.info('Plan generated successfully');
    return plan;
  }

  // Combine task with generated plan for the agent
  async createDetailedTask(task: string, context?: TaskContext): Promise<string> {
    const plan = await this.generatePlan(task);

    // Build context section
    let contextSection = '';
    if (context) {
      contextSection = `
CONTEXT:
- Current URL: ${context.current_url || 'New browser tab'}
- Browser State: ${context.browser_state || 'unknown'}
- Previous Actions: ${context.previous_actions?.join(', ') || 'None'}
`;
    }

    // Build constraints section
    const maxActions = context?.max_actions || 20;
    const timeout = context?.timeout_seconds || 120;
    const constraintsSection = `
CONSTRAINTS:
- Maximum ${maxActions} actions
- Must complete in under ${Math.floor(timeout / 60)} minutes
- Verify final state with screenshot
`;

    // Build success criteria section
    let successSection = '';
    if (context?.success_criteria) {
      successSection = `
SUCCESS CRITERIA:
${context.success_criteria}
`;
    }

    return `TASK: ${task}
${contextSection}${constraintsSection}${successSection}
Detailed Steps to Follow:
${plan}

Important Guidelines:
- Always take a screenshot before any action to understand the current state
- Wait 2-3 seconds after navigation for SPAs to fully load
- Click the center of elements, not edges
- If you encounter a login page, stop and report that authentication is required
- If an element is not found, try scrolling or waiting longer
- Verify each major action with a screenshot before proceeding`;
  }
}
