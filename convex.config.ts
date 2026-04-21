import { convexConfig } from "convex/server";
import { aggregateConfig } from "@convex-dev/aggregate/convex.config";
import { shardedCounterConfig } from "@convex-dev/sharded-counter/convex.config";

export default convexConfig({
  // Register the aggregate component
  aggregate: aggregateConfig,
  
  // Register the sharded counter component
  shardedCounter: shardedCounterConfig,
});