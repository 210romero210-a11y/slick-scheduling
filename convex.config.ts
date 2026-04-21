import { convexConfig } from "convex/server";
import { aggregateConfig } from "@convex-dev/aggregate/convex.config";
import { shardedCounterConfig } from "@convex-dev/sharded-counter/convex.config";
import { agentConfig } from "@convex-dev/agent/convex.config";
import { ragConfig } from "@convex-dev/rag/convex.config";

export default convexConfig({
  // Register the aggregate component
  aggregate: aggregateConfig,
  
  // Register the sharded counter component
  shardedCounter: shardedCounterConfig,
  
  // Register the AI agent component
  agent: agentConfig,
  
  // Register the RAG component
  rag: ragConfig,
});