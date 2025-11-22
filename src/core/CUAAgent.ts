import { BrowserController } from '../browser/BrowserController';
import { LLMClient } from '../llm/LLMClient';
import { ToolExecutor } from './ToolExecutor';
import {
  CUAConfig,
  LLMMessage,
  LLMContentBlock,
  AgentState,
  ActionHistoryEntry,
  ScreenshotResult
} from './types';
import { Logger, createLogger } from '../utils/logger';

const SYSTEM_PROMPT = `You are a web automation agent with multimodal capabilities. You can see screenshots, parse DOM structures, and execute precise actions in web browsers.

## CRITICAL RULES
1. Always observe (screenshot/read_page) before acting
2. Wait 2-3 seconds after navigation for JavaScript to load
3. Batch independent actions in single tool calls
4. Click center of elements using coordinates from screenshots
5. Always click input fields before typing
6. Use explicit waits for async operations
7. Verify critical actions with post-action screenshots
8. Handle errors by retrying with adjusted approach

## AVAILABLE TOOLS

### Perception Tools
- **computer** (action: "screenshot"): Capture viewport screenshot
- **read_page**: Parse accessibility tree with [ref=X] annotations
  - Use depth=5-8 for complex pages to save tokens
  - Use filter="interactive" when only looking for buttons/inputs
- **find**: Semantic element search (returns max 20 elements with coordinates)
- **get_page_text**: Extract raw text content from page

### Action Tools
- **computer**: Execute clicks, typing, scrolling, waiting
  - Actions: left_click, right_click, double_click, type, key, wait, scroll, left_click_drag
  - Use coordinate: [x, y] for clicks
  - Use text for type/key actions
  - Key shortcuts: "Return", "Tab", "Escape", "cmd+a", "ctrl+c"
- **form_input**: Set form field values by ref_id
- **navigate**: Go to URL or "back"/"forward"
- **tabs_create**: Open new browser tab
- **tabs_context**: Get all tab information

## EXECUTION PATTERN

For every task, follow this loop:

### 1. OBSERVE
Take screenshot or read_page to understand current state

### 2. REASON
Analyze what you see and plan next action:
- What elements are visible?
- What are the coordinates of target elements?
- What actions are needed?

### 3. ACT
Execute action(s) using tools. Batch independent actions:
{
  "actions": [
    {"action": "left_click", "coordinate": [379, 321]},
    {"action": "type", "text": "Hello world"},
    {"action": "key", "text": "Return"}
  ]
}

### 4. VERIFY
Confirm success with screenshot

### 5. REPEAT
Until task complete

## ERROR RECOVERY
- **Failed click**: Adjust coordinates to center of element
- **Element not found**: Scroll page, wait longer, or use find tool
- **Page not loaded**: Add explicit wait (2-3 seconds)
- **Dynamic content**: Use scroll + wait to trigger lazy loading
- **Wrong state**: Take screenshot, reassess, restart from observation

## RESPONSE FORMAT

Before each action, briefly explain your reasoning:
- What you observe in the current state
- What action you're taking and why
- What you expect to happen

When the task is complete, provide a summary of what was accomplished.

## IMPORTANT REMINDERS
- NEVER assume element locations without observation
- NEVER type before clicking input fields
- NEVER skip waits on modern SPAs
- ALWAYS click CENTER of elements, not edges
- ALWAYS verify critical actions with screenshots`;


export class CUAAgent {
  private browser: BrowserController;
  private llm: LLMClient;
  private toolExecutor: ToolExecutor;
  private config: CUAConfig;
  private logger: Logger;
  private state: AgentState;
  private messages: LLMMessage[] = [];

  constructor(config: CUAConfig) {
    this.config = config;
    this.logger = createLogger('info');
    this.browser = new BrowserController(config.browser, this.logger);
    this.llm = new LLMClient(config.llm, this.logger);
    this.toolExecutor = new ToolExecutor(this.browser, this.logger);

    this.state = {
      current_tab_id: 1,
      tabs: new Map(),
      action_history: [],
      error_count: 0,
      max_retries: config.agent.max_retries
    };
  }

  async initialize(): Promise<void> {
    await this.browser.initialize();
    this.logger.info('CUA Agent initialized');
  }

  async close(): Promise<void> {
    await this.browser.close();
    this.logger.info('CUA Agent closed');
  }

  async executeTask(task: string): Promise<string> {
    this.logger.info('Starting task execution', { task });

    // Initialize messages with task
    this.messages = [{
      role: 'user',
      content: task
    }];

    let actionCount = 0;
    const maxActions = this.config.agent.max_actions_per_task;

    while (actionCount < maxActions) {
      // Get LLM response
      const response = await this.llm.chat(
        this.messages,
        ToolExecutor.getToolDefinitions(),
        SYSTEM_PROMPT
      );

      // Process response content
      const assistantContent: LLMContentBlock[] = [];
      const toolResults: LLMContentBlock[] = [];
      let finalText = '';

      for (const block of response.content) {
        assistantContent.push(block);

        if (block.type === 'text') {
          finalText = block.text || '';
        } else if (block.type === 'tool_use') {
          actionCount++;

          // Execute tool
          const startTime = Date.now();
          try {
            const result = await this.toolExecutor.execute(
              block.name!,
              block.input
            );

            // Handle screenshot results
            let resultContent: string | LLMContentBlock[];
            if (this.isScreenshotResult(result)) {
              resultContent = [
                this.llm.createImageBlock(result.image),
                { type: 'text', text: `Screenshot captured at ${result.timestamp}` }
              ];
              this.state.last_screenshot = result;
            } else {
              resultContent = typeof result === 'string'
                ? result
                : JSON.stringify(result, null, 2);
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: resultContent as any
            });

            // Log action
            this.state.action_history.push({
              timestamp: Date.now(),
              tool: block.name!,
              input: block.input,
              output: result,
              duration_ms: Date.now() - startTime
            });

            this.state.error_count = 0;

          } catch (error) {
            this.state.error_count++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `Error: ${errorMessage}`
            });

            this.state.action_history.push({
              timestamp: Date.now(),
              tool: block.name!,
              input: block.input,
              error: errorMessage,
              duration_ms: Date.now() - startTime
            });

            if (this.state.error_count >= this.state.max_retries) {
              this.logger.error('Max retries exceeded', { error: errorMessage });
              return `Task failed after ${this.state.max_retries} retries: ${errorMessage}`;
            }
          }
        }
      }

      // Add assistant message
      this.messages.push({
        role: 'assistant',
        content: assistantContent
      });

      // Check if done (no tool calls)
      if (response.stop_reason === 'end_turn' && toolResults.length === 0) {
        this.logger.info('Task completed', { actionCount });
        return finalText || 'Task completed';
      }

      // Add tool results as user message
      if (toolResults.length > 0) {
        this.messages.push({
          role: 'user',
          content: toolResults
        });
      }
    }

    return `Task terminated after ${maxActions} actions`;
  }

  private isScreenshotResult(result: unknown): result is ScreenshotResult {
    return (
      typeof result === 'object' &&
      result !== null &&
      'image' in result &&
      'width' in result &&
      'height' in result
    );
  }

  // Get action history for debugging
  getActionHistory(): ActionHistoryEntry[] {
    return this.state.action_history;
  }

  // Get current state
  getState(): AgentState {
    return this.state;
  }
}
