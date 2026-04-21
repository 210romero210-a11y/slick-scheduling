/**
 * ANOLLA SPEC - OLLAMA LLM CONFIGURATION
 * 
 * Configures Convex Agent component to use Ollama with gemma4:e4b model.
 * Place in: .convex/llm.ts
 */

import { ollama } from "ai-sdk-ollama";

// Ollama configuration
export const chatModelConfig = {
  model: "gemma4:e4b",
  temperature: 0.7,
  maxTokens: 4096,
};

// Embedding model for RAG (qwen3-embedding:4b)
export const embeddingModel = "qwen3-embedding:4b";

// Create provider for agent component
export const ollamaProvider = ollama(chatModelConfig);

// Default Ollama server URL
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";