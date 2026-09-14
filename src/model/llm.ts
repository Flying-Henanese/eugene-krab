import { AIMessage, AIMessageChunk, BaseMessage } from '@langchain/core/messages';
import { ChatOpenAI, ChatOpenAICompletions } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOllama } from '@langchain/ollama';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StructuredToolInterface } from '@langchain/core/tools';
import { Runnable } from '@langchain/core/runnables';
import { z } from 'zod';
import type OpenAI from 'openai';
import { DEFAULT_SYSTEM_PROMPT } from '@/agent/prompts';
import type { TokenUsage } from '@/agent/types';
import { logger } from '@/utils';
import { classifyError, isNonRetryableError } from '@/utils/errors';
import { resolveProvider, getProviderById } from '@/providers';

export const DEFAULT_PROVIDER = 'openai';
export const DEFAULT_MODEL = 'gpt-5.5';

/**
 * Gets the fast model variant for the given provider.
 * Falls back to the provided model if no fast variant is configured (e.g., Ollama).
 */
export function getFastModel(modelProvider: string, fallbackModel: string): string {
  return getProviderById(modelProvider)?.fastModel ?? fallbackModel;
}

export type DeepSeekReasoningEffort = 'low' | 'medium' | 'high';
export type GlmReasoningEffort = 'max' | 'high' | 'low';
export type ReasoningEffort = DeepSeekReasoningEffort | GlmReasoningEffort;

function normalizeDeepSeekReasoningEffort(
  value: string | undefined,
  fallback: DeepSeekReasoningEffort = 'high',
): DeepSeekReasoningEffort {
  return value === 'low' || value === 'medium' || value === 'high' ? value : fallback;
}

export function resolveDeepSeekReasoningEffort(
  explicit?: string,
): DeepSeekReasoningEffort {
  return normalizeDeepSeekReasoningEffort(
    explicit ?? process.env.DEEPSEEK_REASONING_EFFORT,
    'high',
  );
}

function normalizeGlmReasoningEffort(
  value: string | undefined,
  fallback: GlmReasoningEffort = 'max',
): GlmReasoningEffort {
  return value === 'max' || value === 'high' || value === 'low' ? value : fallback;
}

/**
 * GLM-5.3 and GLM-5.3-Flash accept max, high, and low reasoning effort.
 * The provider default is max when no valid environment value is configured.
 */
export function resolveGlmReasoningEffort(explicit?: string): GlmReasoningEffort {
  return normalizeGlmReasoningEffort(explicit ?? process.env.GLM_REASONING_EFFORT, 'max');
}

// Generic retry helper with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, provider: string, maxAttempts = 3): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const errorType = classifyError(message);
      logger.error(`[${provider} API] ${errorType} error (attempt ${attempt + 1}/${maxAttempts}): ${message}`);

      if (isNonRetryableError(message)) {
        throw new Error(`[${provider} API] ${message}`);
      }

      if (attempt === maxAttempts - 1) {
        throw new Error(`[${provider} API] ${message}`);
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw new Error('Unreachable');
}

// Model provider configuration
interface ModelOpts {
  streaming: boolean;
  reasoningEffort?: ReasoningEffort;
}

type ModelFactory = (name: string, opts: ModelOpts) => BaseChatModel;

function getApiKey(...envVars: string[]): string {
  for (const envVar of envVars) {
    const apiKey = process.env[envVar];
    if (apiKey) return apiKey;
  }
  throw new Error(`[LLM] ${envVars.join(' or ')} not found in environment variables`);
}

const GLM_REASONING_CONTENT_KEY = 'glm_reasoning_content';
const GLM_REASONING_MESSAGE_PREFIX = 'glm-reasoning-';

type GlmReasoningEntry = {
  reasoningContent: string;
  originalName?: string;
};

const glmReasoningByMessageName = new Map<string, GlmReasoningEntry>();

/**
 * LangChain's OpenAI converter does not retain GLM's provider-specific
 * reasoning_content field. GLM requires that field on an assistant tool call
 * to be sent back alongside the subsequent tool result.
 */
class GlmChatOpenAICompletions extends ChatOpenAICompletions {
  protected override _convertCompletionsMessageToBaseMessage(
    message: OpenAI.ChatCompletionMessage,
    _rawResponse: OpenAI.Chat.Completions.ChatCompletion,
  ): BaseMessage {
    const converted = super._convertCompletionsMessageToBaseMessage(message, _rawResponse);
    const reasoningContent = (message as { reasoning_content?: unknown }).reasoning_content;

    if (!AIMessage.isInstance(converted) || typeof reasoningContent !== 'string') {
      return converted;
    }

    return new AIMessage({
      content: converted.content,
      additional_kwargs: {
        ...converted.additional_kwargs,
        [GLM_REASONING_CONTENT_KEY]: reasoningContent,
      },
      response_metadata: converted.response_metadata,
      tool_calls: converted.tool_calls,
      invalid_tool_calls: converted.invalid_tool_calls,
      usage_metadata: converted.usage_metadata,
      id: converted.id,
      name: converted.name,
    });
  }
}

function getGlmReasoningContent(message: AIMessage): string | undefined {
  const value = message.additional_kwargs[GLM_REASONING_CONTENT_KEY];
  return typeof value === 'string' ? value : undefined;
}

function prepareGlmMessages(messages: BaseMessage[]): {
  messages: BaseMessage[];
  release: () => void;
} {
  const messageNames: string[] = [];
  const preparedMessages = messages.map((message) => {
    if (!AIMessage.isInstance(message)) return message;

    const reasoningContent = getGlmReasoningContent(message);
    if (reasoningContent === undefined) return message;

    const messageName = `${GLM_REASONING_MESSAGE_PREFIX}${crypto.randomUUID()}`;
    messageNames.push(messageName);
    glmReasoningByMessageName.set(messageName, {
      reasoningContent,
      originalName: message.name,
    });

    return new AIMessage({
      content: message.content,
      additional_kwargs: message.additional_kwargs,
      response_metadata: message.response_metadata,
      tool_calls: message.tool_calls,
      invalid_tool_calls: message.invalid_tool_calls,
      usage_metadata: message.usage_metadata,
      id: message.id,
      name: messageName,
    });
  });

  return {
    messages: preparedMessages,
    release: () => {
      for (const messageName of messageNames) {
        glmReasoningByMessageName.delete(messageName);
      }
    },
  };
}

type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const replayGlmReasoningContent: FetchFunction = async (input, init) => {
  if (typeof init?.body !== 'string') {
    return fetch(input, init);
  }

  try {
    const request = JSON.parse(init.body) as { messages?: Array<Record<string, unknown>> };
    if (!Array.isArray(request.messages)) {
      return fetch(input, init);
    }

    let changed = false;
    const messages = request.messages.map((message) => {
      const messageName = message.name;
      if (typeof messageName !== 'string') return message;

      const reasoning = glmReasoningByMessageName.get(messageName);
      if (!reasoning) return message;

      changed = true;
      const { name: _reasoningMarker, ...withoutMarker } = message;
      return {
        ...withoutMarker,
        ...(reasoning.originalName ? { name: reasoning.originalName } : {}),
        reasoning_content: reasoning.reasoningContent,
      };
    });

    if (!changed) {
      return fetch(input, init);
    }

    return fetch(input, {
      ...init,
      body: JSON.stringify({ ...request, messages }),
    });
  } catch {
    return fetch(input, init);
  }
};

function createGlmChatModel(name: string, opts: ModelOpts): ChatOpenAI {
  const { reasoningEffort, ...chatOpts } = opts;
  const fields = {
    model: name,
    ...chatOpts,
    apiKey: getApiKey('GLM_API_KEY', 'OPENAI_API_KEY'),
    configuration: {
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      fetch: replayGlmReasoningContent as typeof fetch,
    },
    // Keep a complete response so reasoning_content can survive a tool round.
    disableStreaming: true,
    modelKwargs: {
      thinking: { type: 'enabled' },
      reasoning_effort: resolveGlmReasoningEffort(reasoningEffort),
    },
  };

  return new ChatOpenAI({
    ...fields,
    completions: new GlmChatOpenAICompletions(fields),
  });
}

// Factories keyed by provider id — prefix routing is handled by resolveProvider()
const MODEL_FACTORIES: Record<string, ModelFactory> = {
  anthropic: (name, opts) =>
    new ChatAnthropic({
      model: name,
      ...opts,
      apiKey: getApiKey('ANTHROPIC_API_KEY'),
    }),
  google: (name, opts) =>
    new ChatGoogleGenerativeAI({
      model: name,
      ...opts,
      apiKey: getApiKey('GOOGLE_API_KEY'),
    }),
  xai: (name, opts) =>
    new ChatOpenAI({
      model: name,
      ...opts,
      apiKey: getApiKey('XAI_API_KEY'),
      configuration: {
        baseURL: 'https://api.x.ai/v1',
      },
    }),
  openrouter: (name, opts) =>
    new ChatOpenAI({
      model: name.replace(/^openrouter:/, ''),
      ...opts,
      apiKey: getApiKey('OPENROUTER_API_KEY'),
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
    }),
  moonshot: (name, opts) =>
    new ChatOpenAI({
      model: name,
      ...opts,
      apiKey: getApiKey('MOONSHOT_API_KEY'),
      configuration: {
        baseURL: 'https://api.moonshot.cn/v1',
      },
    }),
  deepseek: (name, opts) => {
    // Both deepseek-v4-pro and deepseek-v4-flash support thinking mode.
    // temperature/top_p/presence_penalty/frequency_penalty are ignored in thinking mode.
    const isThinkingModel = name === 'deepseek-v4-pro' || name === 'deepseek-v4-flash';
    const { reasoningEffort, ...chatOpts } = opts;
    return new ChatOpenAI({
      model: name,
      ...chatOpts,
      apiKey: getApiKey('DEEPSEEK_API_KEY'),
      configuration: {
        baseURL: 'https://api.deepseek.com',
      },
      ...(isThinkingModel && {
        // reasoning_effort is a top-level param; thinking toggle goes in extra_body
        // per DeepSeek V4 API docs (OpenAI SDK compat layer)
        reasoning_effort: resolveDeepSeekReasoningEffort(reasoningEffort),
        extraBody: {
          thinking: { type: 'enabled' },
        },
      }),
    });
  },
  glm: (name, opts) => createGlmChatModel(name, opts),
  ollama: (name, opts) =>
    new ChatOllama({
      model: name.replace(/^ollama:/, ''),
      ...opts,
      ...(process.env.OLLAMA_BASE_URL ? { baseUrl: process.env.OLLAMA_BASE_URL } : {}),
    }),
  'ollama-cloud': (name, opts) => {
    const apiKey = process.env.OLLAMA_CLOUD_API_KEY;
    return new ChatOllama({
      model: name.replace(/^ollama-cloud:/, ''),
      ...opts,
      baseUrl: 'https://ollama.com',
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
  },
};

const DEFAULT_FACTORY: ModelFactory = (name, opts) =>
  new ChatOpenAI({
    model: name,
    ...opts,
    apiKey: getApiKey('OPENAI_API_KEY'),
    // GPT-5.6 requires the Responses API when reasoning and function tools are combined.
    useResponsesApi: name.startsWith('gpt-5.6-'),
  });

export function getChatModel(
  modelName: string = DEFAULT_MODEL,
  streaming: boolean = false,
  options: { reasoningEffort?: ReasoningEffort; provider?: string } = {},
): BaseChatModel {
  const provider = (options.provider ? getProviderById(options.provider) : undefined) ?? resolveProvider(modelName);
  const opts: ModelOpts = (provider.id === 'deepseek' || provider.id === 'glm') && options.reasoningEffort
    ? { streaming, reasoningEffort: options.reasoningEffort }
    : { streaming };
  const factory = MODEL_FACTORIES[provider.id] ?? DEFAULT_FACTORY;
  return factory(modelName, opts);
}

function resolveCallProvider(model: string, modelProvider?: string) {
  return (modelProvider ? getProviderById(modelProvider) : undefined) ?? resolveProvider(model);
}

interface CallLlmOptions {
  model?: string;
  modelProvider?: string;
  systemPrompt?: string;
  outputSchema?: z.ZodType<unknown>;
  tools?: StructuredToolInterface[];
  signal?: AbortSignal;
  reasoningEffort?: ReasoningEffort;
}

export interface LlmResult {
  response: AIMessage | string;
  usage?: TokenUsage;
}

function extractUsage(result: unknown): TokenUsage | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const msg = result as Record<string, unknown>;

  const usageMetadata = msg.usage_metadata;
  if (usageMetadata && typeof usageMetadata === 'object') {
    const u = usageMetadata as Record<string, unknown>;
    const input = typeof u.input_tokens === 'number' ? u.input_tokens : 0;
    const output = typeof u.output_tokens === 'number' ? u.output_tokens : 0;
    const total = typeof u.total_tokens === 'number' ? u.total_tokens : input + output;
    return { inputTokens: input, outputTokens: output, totalTokens: total };
  }

  const responseMetadata = msg.response_metadata;
  if (responseMetadata && typeof responseMetadata === 'object') {
    const rm = responseMetadata as Record<string, unknown>;
    if (rm.usage && typeof rm.usage === 'object') {
      const u = rm.usage as Record<string, unknown>;
      const input = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : 0;
      const output = typeof u.completion_tokens === 'number' ? u.completion_tokens : 0;
      const total = typeof u.total_tokens === 'number' ? u.total_tokens : input + output;
      return { inputTokens: input, outputTokens: output, totalTokens: total };
    }
  }

  return undefined;
}

/**
 * Build messages with Anthropic cache_control on the system prompt.
 * Marks the system prompt as ephemeral so Anthropic caches the prefix,
 * reducing input token costs by ~90% on subsequent calls.
 */
function buildAnthropicMessages(systemPrompt: string, userPrompt: string) {
  return [
    new SystemMessage({
      content: [
        {
          type: 'text' as const,
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
    }),
    new HumanMessage(userPrompt),
  ];
}

export async function callLlm(prompt: string, options: CallLlmOptions = {}): Promise<LlmResult> {
  const { model = DEFAULT_MODEL, modelProvider, systemPrompt, outputSchema, tools, signal, reasoningEffort } = options;
  const finalSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;

  const llm = getChatModel(model, false, { reasoningEffort, provider: modelProvider });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let runnable: Runnable<any, any> = llm;

  if (outputSchema) {
    runnable = llm.withStructuredOutput(outputSchema, { strict: false });
  } else if (tools && tools.length > 0 && llm.bindTools) {
    runnable = llm.bindTools(tools);
  }

  const invokeOpts = signal ? { signal } : undefined;
  const provider = resolveCallProvider(model, modelProvider);
  let result;

  if (provider.id === 'anthropic') {
    // Anthropic: use explicit messages with cache_control for prompt caching (~90% savings)
    const messages = buildAnthropicMessages(finalSystemPrompt, prompt);
    result = await withRetry(() => runnable.invoke(messages, invokeOpts), provider.displayName);
  } else {
    // Other providers: use ChatPromptTemplate (OpenAI/Gemini have automatic caching)
    const promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', finalSystemPrompt],
      ['user', '{prompt}'],
    ]);
    const chain = promptTemplate.pipe(runnable);
    result = await withRetry(() => chain.invoke({ prompt }, invokeOpts), provider.displayName);
  }
  const usage = extractUsage(result);

  // If no outputSchema and no tools, extract content from AIMessage
  // When tools are provided, return the full AIMessage to preserve tool_calls
  if (!outputSchema && !tools && result && typeof result === 'object' && 'content' in result) {
    return { response: (result as { content: string }).content, usage };
  }
  return { response: result as AIMessage, usage };
}

// ---------------------------------------------------------------------------
// Multi-turn message array API
// ---------------------------------------------------------------------------

/**
 * Annotate the first SystemMessage with Anthropic's cache_control for prompt
 * caching (~90% input token savings on repeated calls).
 */
function annotateSystemMessageForCaching(messages: BaseMessage[]): BaseMessage[] {
  if (messages.length === 0 || messages[0]._getType() !== 'system') {
    return messages;
  }

  const systemMsg = messages[0];
  const text = typeof systemMsg.content === 'string'
    ? systemMsg.content
    : JSON.stringify(systemMsg.content);

  const annotated = new SystemMessage({
    content: [
      {
        type: 'text' as const,
        text,
        cache_control: { type: 'ephemeral' },
      },
    ],
  });

  return [annotated, ...messages.slice(1)];
}

interface CallLlmWithMessagesOptions {
  model?: string;
  modelProvider?: string;
  tools?: StructuredToolInterface[];
  signal?: AbortSignal;
  reasoningEffort?: ReasoningEffort;
}

/**
 * Call an LLM with a full message array (multi-turn tool-calling).
 *
 * Unlike callLlm() which takes a single prompt string, this function accepts
 * a BaseMessage[] array containing SystemMessage, HumanMessage, AIMessage,
 * and ToolMessage objects. This enables the agent loop where
 * conversation history (including model reasoning and tool results) persists
 * across iterations.
 *
 * All LangChain providers support BaseMessage[] via BaseChatModel.invoke().
 */
export async function callLlmWithMessages(
  messages: BaseMessage[],
  options: CallLlmWithMessagesOptions = {},
): Promise<LlmResult> {
  const { model = DEFAULT_MODEL, modelProvider, tools, signal, reasoningEffort } = options;

  const llm = getChatModel(model, false, { reasoningEffort, provider: modelProvider });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let runnable: Runnable<any, any> = llm;

  if (tools && tools.length > 0 && llm.bindTools) {
    runnable = llm.bindTools(tools);
  }

  const invokeOpts = signal ? { signal } : undefined;
  const provider = resolveCallProvider(model, modelProvider);

  // For Anthropic: annotate SystemMessage with cache_control for prompt caching
  const finalMessages = provider.id === 'anthropic'
    ? annotateSystemMessageForCaching(messages)
    : messages;
  const prepared = provider.id === 'glm'
    ? prepareGlmMessages(finalMessages)
    : { messages: finalMessages, release: () => {} };

  let result;
  try {
    result = await withRetry(
      () => runnable.invoke(prepared.messages, invokeOpts),
      provider.displayName,
    );
  } finally {
    prepared.release();
  }

  const usage = extractUsage(result);
  return { response: result as AIMessage, usage };
}

// ---------------------------------------------------------------------------
// Streaming multi-turn API
// ---------------------------------------------------------------------------

/**
 * Stream an LLM response as AIMessageChunk objects.
 *
 * Uses LangChain's .stream() method. Chunks can be accumulated via .concat()
 * to progressively build complete tool_calls. Falls back to blocking invoke
 * if streaming is not supported by the provider.
 */
export async function* streamLlmWithMessages(
  messages: BaseMessage[],
  options: CallLlmWithMessagesOptions = {},
): AsyncGenerator<AIMessageChunk, void> {
  const { model = DEFAULT_MODEL, modelProvider, tools, signal, reasoningEffort } = options;

  const llm = getChatModel(model, true, { reasoningEffort, provider: modelProvider });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let runnable: Runnable<any, any> = llm;

  if (tools && tools.length > 0 && llm.bindTools) {
    runnable = llm.bindTools(tools);
  }

  const invokeOpts = signal ? { signal } : undefined;
  const provider = resolveCallProvider(model, modelProvider);

  const finalMessages = provider.id === 'anthropic'
    ? annotateSystemMessageForCaching(messages)
    : messages;
  const prepared = provider.id === 'glm'
    ? prepareGlmMessages(finalMessages)
    : { messages: finalMessages, release: () => {} };

  try {
    const stream = await runnable.stream(prepared.messages, invokeOpts);

    for await (const chunk of stream) {
      yield chunk as AIMessageChunk;
    }
  } finally {
    prepared.release();
  }
}
