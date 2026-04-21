/**
 * ANOLLA SPEC - OLLAMA LLM CONFIGURATION
 * 
 * Configures Convex Agent component to use Ollama with gemma4:e4b model.
 * Place in: .convex/llm.ts
 */

import { ollama } from "ai-sdk-ollama";

// Ollama configuration
export const ollamaModel = "gemma4:e4b";

// Create Ollama provider
export const ollamaProvider = ollama({
  model: ollamaModel,
});

// Embedding model for RAG (using Ollama's embedding endpoint)
export const embeddingModel = "nomic-embed-text";

// Generate chat completion config for agent
export const chatModelConfig = {
  model: ollamaModel,
  temperature: 0.7,
  maxTokens: 4096,
};

// Default Ollama server URL
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";