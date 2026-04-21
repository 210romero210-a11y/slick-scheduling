/**
 * ANOLLA SPEC - OLLAMA LLM CONFIGURATION
 * 
 * Configures Ollama provider for Convex AI components.
 * Models sourced from environment variables for easy swapping.
 */

import { ollama } from "ai-sdk-ollama";

// Model configuration from environment
export const chatModelConfig = {
  model: process.env.OLLAMA_CHAT_MODEL || "gemma4:e4b",
  temperature: 0.7,
  maxTokens: 4096,
};

export const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || "qwen3-embedding:4b";

// Alias exports for convenience
export const ollamaModel = chatModelConfig.model;

// Create provider with configured base URL
export const ollamaProvider = ollama(chatModelConfig);

// Base URL from environment
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";