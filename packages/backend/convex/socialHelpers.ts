import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// Social media account schema for internal use
const socialAccountSchema = v.object({
  handle: v.string(),
  followers: v.number(),
  engagement: v.optional(v.number()),
  lastUpdated: v.number(),
});

// Queue a team for social media update
export const queueSocialUpdate = internalMutation({
  args: {
    teamId: v.id("teams"),
    platform: v.string(),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("socialUpdateQueue", {
      teamId: args.teamId,
      platform: args.platform,
      status: "pending",
      retryCount: 0,
      scheduledFor: args.scheduledFor || Date.now(),
    });
  },
});

// Get pending updates from queue
export const getPendingUpdates = internalQuery({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    return await ctx.db
      .query("socialUpdateQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .filter((q) => q.lte(q.field("scheduledFor"), now))
      .take(args.limit);
  },
});

// Mark update as completed
export const completeUpdate = internalMutation({
  args: {
    queueId: v.id("socialUpdateQueue"),
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const queue = await ctx.db.get(args.queueId);
    if (!queue) return;
    
    if (args.success) {
      await ctx.db.delete(args.queueId);
    } else {
      // Retry with exponential backoff
      const retryCount = queue.retryCount + 1;
      if (retryCount >= 3) {
        await ctx.db.patch(args.queueId, {
          status: "failed",
          errorMessage: args.errorMessage,
          lastAttempt: Date.now(),
        });
      } else {
        const backoffMs = Math.pow(2, retryCount) * 60000; // 2min, 4min, 8min
        await ctx.db.patch(args.queueId, {
          status: "pending",
          retryCount,
          errorMessage: args.errorMessage,
          lastAttempt: Date.now(),
          scheduledFor: Date.now() + backoffMs,
        });
      }
    }
  },
});

