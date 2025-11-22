import Anthropic from '@anthropic-ai/sdk';
import { CUAConfig, LLMMessage, ToolDefinition, LLMContentBlock } from '../core/types';
import { Logger } from '../utils/logger';

export class LLMClient {
  private client: Anthropic;
  private config: CUAConfig['llm'];
  private logger: Logger;

  constructor(config: CUAConfig['llm'], logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.client = new Anthropic({ apiKey: config.api_key });
  }

  async chat(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<{
    content: LLMContentBlock[];
    stop_reason: string;
    usage: { input_tokens: number; output_tokens: number };
  }> {
    this.logger.debug('Sending request to LLM', {
      messageCount: messages.length,
      toolCount: tools.length
    });

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.max_tokens,
      temperature: this.config.temperature,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content as any
      })),
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as any
      }))
    });

    this.logger.debug('Received LLM response', {
      stopReason: response.stop_reason,
      contentBlocks: response.content.length
    });

    return {
      content: response.content.map(block => {
        if (block.type === 'text') {
          return { type: 'text' as const, text: block.text };
        } else if (block.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input
          };
        }
        return block as LLMContentBlock;
      }),
      stop_reason: response.stop_reason || 'end_turn',
      usage: response.usage
    };
  }

  // Convert image buffer to base64 for LLM
  imageToBase64(buffer: Buffer): string {
    return buffer.toString('base64');
  }

  // Create image content block
  createImageBlock(buffer: Buffer): LLMContentBlock {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: this.imageToBase64(buffer)
      }
    };
  }
}
