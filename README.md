# CUA Agent - Computer Use Agent for Web Automation

A high-performance LLM-based Computer Use Agent (CUA) system for autonomous web browser automation. This system uses multimodal perception (vision + DOM) and precise interaction mechanisms to complete complex web tasks.

## Features

- **Multimodal Perception**: Screenshots (vision) + accessibility trees + semantic element search
- **Precise Actions**: Pixel-level clicks, keyboard input, form manipulation, navigation
- **State Management**: Multi-tab support, session context, action history
- **Error Handling**: Automatic retries, async loading waits, dynamic content handling
- **LLM Integration**: Claude Sonnet 4.5 for intelligent task planning and execution

## Installation

```bash
npm install
```

## Configuration

Set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

## Usage

### CLI

```bash
# Run a task
npx ts-node src/index.ts "Navigate to google.com and search for TypeScript"

# Build and run
npm run build
node dist/index.js "Your task here"
```

### Programmatic

```typescript
import { CUAAgent, CUAConfig } from './src';

const config: CUAConfig = {
  browser: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    timeout: 30000
  },
  llm: {
    model: 'claude-sonnet-4-5-20250929',
    api_key: process.env.ANTHROPIC_API_KEY,
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

const agent = new CUAAgent(config);
await agent.initialize();

const result = await agent.executeTask('Your task description');
console.log(result);

await agent.close();
```

## Available Tools

### Perception Tools

| Tool | Description |
|------|-------------|
| `computer` (screenshot) | Capture viewport screenshot |
| `read_page` | Parse accessibility tree with ref_ids |
| `find` | Semantic element search (max 20 results) |
| `get_page_text` | Extract raw text content |

### Action Tools

| Tool | Description |
|------|-------------|
| `computer` | Execute clicks, typing, scrolling, waiting |
| `form_input` | Set form field values by ref_id |
| `navigate` | Go to URL or back/forward |
| `tabs_create` | Open new browser tab |
| `tabs_context` | Get all tab information |

## Action Types

```typescript
// Click actions
{ action: 'left_click', coordinate: [x, y] }
{ action: 'right_click', coordinate: [x, y] }
{ action: 'double_click', coordinate: [x, y] }

// Keyboard
{ action: 'type', text: 'Hello world' }
{ action: 'key', text: 'Return' }  // Enter, Tab, Escape, etc.
{ action: 'key', text: 'cmd+a' }   // Keyboard shortcuts

// Other
{ action: 'wait', duration: 2 }
{ action: 'scroll', coordinate: [x, y], scroll_parameters: {...} }
{ action: 'left_click_drag', start_coordinate: [...], end_coordinate: [...] }
```

## Action Batching

Batch independent actions for efficiency:

```typescript
{
  "actions": [
    { "action": "left_click", "coordinate": [379, 321] },
    { "action": "type", "text": "Hello" },
    { "action": "key", "text": "Return" }
  ]
}
```

## Best Practices

### Always Do
- Take screenshot before any action
- Wait 2-3 seconds after navigation for SPAs
- Click center of elements, not edges
- Batch independent actions
- Verify actions with post-action screenshots

### Never Do
- Assume element locations without observation
- Skip waits on modern SPAs
- Type before clicking input fields
- Use hardcoded coordinates across different pages

## Examples

See `src/examples/` for complete examples:

- `asana-task.ts` - Create task in Asana
- `web-search.ts` - Google search and extraction
- `multi-tab.ts` - Multi-tab research workflow

## Architecture

```
src/
├── core/
│   ├── types.ts        # Type definitions
│   ├── CUAAgent.ts     # Main agent orchestration
│   └── ToolExecutor.ts # Tool execution logic
├── browser/
│   └── BrowserController.ts  # Puppeteer/CDP integration
├── llm/
│   └── LLMClient.ts    # Anthropic API client
├── utils/
│   └── logger.ts       # Logging utilities
├── examples/           # Example scripts
└── index.ts           # Entry point
```

## Error Handling

The agent automatically:
- Retries failed actions (configurable max retries)
- Waits for async content to load
- Handles dynamic elements with scroll + wait
- Logs all actions for debugging

## Performance Optimization

- Use `depth` parameter in `read_page` (5-8 for complex pages)
- Use `filter="interactive"` when only looking for buttons/inputs
- Batch actions to reduce tool call overhead
- Use screenshots for visual tasks instead of parsing entire DOM

## License

MIT
