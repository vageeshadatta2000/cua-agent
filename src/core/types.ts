// Core Types for Computer Use Agent

// Action Types
export type ActionType =
  | 'screenshot'
  | 'left_click'
  | 'right_click'
  | 'double_click'
  | 'type'
  | 'key'
  | 'wait'
  | 'scroll'
  | 'left_click_drag'
  | 'scroll_to';

export interface Coordinate {
  x: number;
  y: number;
}

export interface ScrollParameters {
  scroll_direction: 'up' | 'down' | 'left' | 'right';
  scroll_amount: 'max' | number;
}

export interface BaseAction {
  action: ActionType;
}

export interface ScreenshotAction extends BaseAction {
  action: 'screenshot';
}

export interface ClickAction extends BaseAction {
  action: 'left_click' | 'right_click' | 'double_click';
  coordinate?: [number, number];
  ref?: string;
}

export interface TypeAction extends BaseAction {
  action: 'type';
  text: string;
}

export interface KeyAction extends BaseAction {
  action: 'key';
  text: string;
}

export interface WaitAction extends BaseAction {
  action: 'wait';
  duration: number;
}

export interface ScrollAction extends BaseAction {
  action: 'scroll';
  coordinate: [number, number];
  scroll_parameters: ScrollParameters;
}

export interface DragAction extends BaseAction {
  action: 'left_click_drag';
  start_coordinate: [number, number];
  end_coordinate: [number, number];
}

export interface ScrollToAction extends BaseAction {
  action: 'scroll_to';
  ref: string;
}

export type Action =
  | ScreenshotAction
  | ClickAction
  | TypeAction
  | KeyAction
  | WaitAction
  | ScrollAction
  | DragAction
  | ScrollToAction;

// Tool Input Types
export interface ComputerToolInput {
  action?: Action;
  actions?: Action[];
  tab_id: number;
}

export interface ReadPageInput {
  tab_id: number;
  depth?: number;
  filter?: 'interactive' | 'all';
  ref_id?: string;
}

export interface FindInput {
  query: string;
  tab_id: number;
}

export interface GetPageTextInput {
  tab_id: number;
}

export interface FormInputInput {
  ref: string;
  value: string | boolean | number;
  tab_id: number;
}

export interface NavigateInput {
  url: string;
  tab_id: number;
}

export interface TabsCreateInput {
  url?: string;
}

// Tool Output Types
export interface ScreenshotResult {
  image: Buffer;
  width: number;
  height: number;
  timestamp: number;
}

export interface Element {
  ref_id: string;
  tag: string;
  text?: string;
  role?: string;
  coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes?: Record<string, string>;
  children?: Element[];
}

export interface FindResult {
  elements: Element[];
  total: number;
}

export interface Tab {
  id: number;
  url: string;
  title: string;
  active: boolean;
}

export interface TabsContextResult {
  tabs: Tab[];
  current_tab_id: number;
}

// Agent State
export interface AgentState {
  current_tab_id: number;
  tabs: Map<number, Tab>;
  last_screenshot?: ScreenshotResult;
  action_history: ActionHistoryEntry[];
  error_count: number;
  max_retries: number;
}

export interface ActionHistoryEntry {
  timestamp: number;
  tool: string;
  input: unknown;
  output?: unknown;
  error?: string;
  duration_ms: number;
}

// LLM Message Types
export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | LLMContentBlock[];
}

export interface LLMContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
}

// Tool Definition for LLM
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Task Types
export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  steps?: TaskStep[];
  result?: unknown;
  error?: string;
}

export interface TaskStep {
  description: string;
  tool: string;
  input: unknown;
  output?: unknown;
  status: 'pending' | 'completed' | 'failed';
}

// Configuration
export interface CUAConfig {
  browser: {
    headless: boolean;
    viewport: {
      width: number;
      height: number;
    };
    timeout: number;
  };
  llm: {
    model: string;
    api_key: string;
    max_tokens: number;
    temperature: number;
  };
  agent: {
    max_actions_per_task: number;
    max_retries: number;
    default_wait_after_navigation: number;
    screenshot_quality: number;
  };
}
