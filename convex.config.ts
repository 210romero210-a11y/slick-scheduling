import { convexConfig } from "convex/server";
import { aggregateConfig } from "@convex-dev/aggregate/convex.config";
import { shardedCounterConfig } from "@convex-dev/sharded-counter/convex.config";
import { agentConfig } from "@convex-dev/agent/convex.config";
import { ragConfig } from "@convex-dev/rag/convex.config";
import workpool from "@convex-dev/workpool/convex.config.js";
import workflow from "@convex-dev/workflow/convex.config.js";
import crons from "@convex-dev/crons/convex.config.js";

export default convexConfig({
  // Register the aggregate component
  aggregate: aggregateConfig,
  
  // Register the sharded counter component
  shardedCounter: shardedCounterConfig,
  
  // Register the AI agent component
  agent: agentConfig,
  
  // Register the RAG component
  rag: ragConfig,
  
  // Register the Workpool component (for reliable async operations)
  workpool: workpool,
  
  // Register the Workflow component (for multi-step processes)
  workflow: workflow,
  
  // Register the Crons component (for scheduled jobs)
  crons: crons,
});