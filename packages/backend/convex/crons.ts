import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ============================================
// Daily Jobs
// ============================================

// Update social media stats for all teams (runs at 6 AM UTC)
crons.daily(
  "update-social-stats",
  { hourUTC: 6, minuteUTC: 0 },
  internal.jobs.updateAllSocialStats
);

// Clean expired cache entries (runs at 3 AM UTC)
crons.daily(
  "clean-expired-cache",
  { hourUTC: 3, minuteUTC: 0 },
  internal.cache.cleanExpiredCache
);

// ============================================
// Weekly Jobs
// ============================================

// Refresh team data and re-verify (runs Sunday at 2 AM UTC)
crons.weekly(
  "refresh-team-data",
  { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
  internal.jobs.refreshTeamData
);

// Discover new teams based on popular searches (runs Monday at 4 AM UTC)
crons.weekly(
  "discover-new-teams",
  { dayOfWeek: "monday", hourUTC: 4, minuteUTC: 0 },
  internal.jobs.discoverNewTeams
);

// ============================================
// Hourly Jobs
// ============================================

// Process pending social media update queue
crons.hourly(
  "process-social-queue",
  { minuteUTC: 15 },
  internal.social.processUpdateQueue
);

export default crons;

