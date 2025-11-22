import { BrowserController } from '../browser/BrowserController';
import {
  ComputerToolInput,
  ReadPageInput,
  FindInput,
  GetPageTextInput,
  FormInputInput,
  NavigateInput,
  TabsCreateInput,
  ScreenshotResult,
  Action,
  ToolDefinition
} from './types';
import { Logger } from '../utils/logger';

export class ToolExecutor {
  private browser: BrowserController;
  private logger: Logger;

  constructor(browser: BrowserController, logger: Logger) {
    this.browser = browser;
    this.logger = logger;
  }

  async execute(toolName: string, input: unknown): Promise<unknown> {
    const startTime = Date.now();
    this.logger.info(`Executing tool: ${toolName}`, { input });

    try {
      let result: unknown;

      switch (toolName) {
        case 'computer':
          result = await this.executeComputer(input as ComputerToolInput);
          break;
        case 'read_page':
          result = await this.executeReadPage(input as ReadPageInput);
          break;
        case 'find':
          result = await this.executeFind(input as FindInput);
          break;
        case 'get_page_text':
          result = await this.executeGetPageText(input as GetPageTextInput);
          break;
        case 'form_input':
          result = await this.executeFormInput(input as FormInputInput);
          break;
        case 'navigate':
          result = await this.executeNavigate(input as NavigateInput);
          break;
        case 'tabs_create':
          result = await this.executeTabsCreate(input as TabsCreateInput);
          break;
        case 'tabs_context':
          result = await this.executeTabsContext();
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      const duration = Date.now() - startTime;
      this.logger.info(`Tool ${toolName} completed in ${duration}ms`);

      return result;
    } catch (error) {
      this.logger.error(`Tool ${toolName} failed`, { error });
      throw error;
    }
  }

  private async executeComputer(input: ComputerToolInput): Promise<ScreenshotResult> {
    const actions = input.actions || (input.action ? [input.action] : []);

    for (const action of actions) {
      await this.executeAction(input.tab_id, action);
    }

    // Always return screenshot after actions
    return await this.browser.screenshot(input.tab_id);
  }

  private async executeAction(tabId: number, action: Action): Promise<void> {
    switch (action.action) {
      case 'screenshot':
        // No-op, screenshot is returned after all actions
        break;

      case 'left_click':
      case 'right_click':
      case 'double_click':
        if (action.ref) {
          await this.browser.clickByRef(
            tabId,
            action.ref,
            action.action === 'right_click' ? 'right' : 'left'
          );
        } else if (action.coordinate) {
          await this.browser.click(
            tabId,
            action.coordinate,
            action.action === 'right_click' ? 'right' : 'left',
            action.action === 'double_click' ? 2 : 1
          );
        }
        break;

      case 'type':
        await this.browser.type(tabId, action.text);
        break;

      case 'key':
        await this.browser.pressKey(tabId, action.text);
        break;

      case 'wait':
        await this.browser.wait(Math.min(action.duration, 30));
        break;

      case 'scroll':
        await this.browser.scroll(tabId, action.coordinate, action.scroll_parameters);
        break;

      case 'left_click_drag':
        await this.browser.drag(tabId, action.start_coordinate, action.end_coordinate);
        break;

      case 'scroll_to':
        // Scroll element into view
        await this.browser.clickByRef(tabId, action.ref); // This will scroll to element
        break;
    }
  }

  private async executeReadPage(input: ReadPageInput): Promise<string> {
    return await this.browser.readPage(
      input.tab_id,
      input.depth,
      input.filter,
      input.ref_id
    );
  }

  private async executeFind(input: FindInput): Promise<unknown> {
    const elements = await this.browser.findElements(input.tab_id, input.query);
    return { elements, total: elements.length };
  }

  private async executeGetPageText(input: GetPageTextInput): Promise<string> {
    return await this.browser.getPageText(input.tab_id);
  }

  private async executeFormInput(input: FormInputInput): Promise<void> {
    await this.browser.formInput(input.tab_id, input.ref, input.value);
  }

  private async executeNavigate(input: NavigateInput): Promise<ScreenshotResult> {
    await this.browser.navigate(input.tab_id, input.url);
    return await this.browser.screenshot(input.tab_id);
  }

  private async executeTabsCreate(input: TabsCreateInput): Promise<unknown> {
    return await this.browser.createTab(input.url);
  }

  private async executeTabsContext(): Promise<unknown> {
    const tabs = await this.browser.getTabsContext();
    return { tabs, current_tab_id: tabs[0]?.id || 1 };
  }

  // Get tool definitions for LLM
  static getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'computer',
        description: 'Execute low-level computer actions like clicks, typing, scrolling. Returns screenshot after execution.',
        input_schema: {
          type: 'object',
          properties: {
            tab_id: { type: 'number', description: 'Tab ID to execute actions on' },
            action: {
              type: 'object',
              description: 'Single action to execute',
              properties: {
                action: {
                  type: 'string',
                  enum: ['screenshot', 'left_click', 'right_click', 'double_click', 'type', 'key', 'wait', 'scroll', 'left_click_drag', 'scroll_to']
                },
                coordinate: { type: 'array', items: { type: 'number' } },
                text: { type: 'string' },
                duration: { type: 'number' },
                ref: { type: 'string' },
                scroll_parameters: {
                  type: 'object',
                  properties: {
                    scroll_direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
                    scroll_amount: { type: ['string', 'number'] }
                  }
                },
                start_coordinate: { type: 'array', items: { type: 'number' } },
                end_coordinate: { type: 'array', items: { type: 'number' } }
              }
            },
            actions: {
              type: 'array',
              description: 'Multiple actions to execute in sequence',
              items: { type: 'object' }
            }
          },
          required: ['tab_id']
        }
      },
      {
        name: 'read_page',
        description: 'Read the accessibility tree of the page. Returns hierarchical text with [ref=X] annotations.',
        input_schema: {
          type: 'object',
          properties: {
            tab_id: { type: 'number', description: 'Tab ID' },
            depth: { type: 'number', description: 'Max depth to traverse (default 15, use 5-8 for complex pages)' },
            filter: { type: 'string', enum: ['interactive', 'all'], description: 'Filter element types' },
            ref_id: { type: 'string', description: 'Focus on specific subtree' }
          },
          required: ['tab_id']
        }
      },
      {
        name: 'find',
        description: 'Find elements by semantic query. Returns max 20 elements with ref_ids and coordinates.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural language description of element' },
            tab_id: { type: 'number', description: 'Tab ID' }
          },
          required: ['query', 'tab_id']
        }
      },
      {
        name: 'get_page_text',
        description: 'Extract raw text content from page, prioritizing article content.',
        input_schema: {
          type: 'object',
          properties: {
            tab_id: { type: 'number', description: 'Tab ID' }
          },
          required: ['tab_id']
        }
      },
      {
        name: 'form_input',
        description: 'Set value on form element by ref_id. Handles text inputs, checkboxes, selects.',
        input_schema: {
          type: 'object',
          properties: {
            ref: { type: 'string', description: 'Element ref_id from read_page or find' },
            value: { type: ['string', 'boolean', 'number'], description: 'Value to set' },
            tab_id: { type: 'number', description: 'Tab ID' }
          },
          required: ['ref', 'value', 'tab_id']
        }
      },
      {
        name: 'navigate',
        description: 'Navigate to URL or use "back"/"forward" for history navigation.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to navigate to, or "back"/"forward"' },
            tab_id: { type: 'number', description: 'Tab ID' }
          },
          required: ['url', 'tab_id']
        }
      },
      {
        name: 'tabs_create',
        description: 'Create a new browser tab.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Optional URL to open in new tab' }
          }
        }
      },
      {
        name: 'tabs_context',
        description: 'Get information about all open tabs.',
        input_schema: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }
}
