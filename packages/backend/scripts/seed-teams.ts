/**
 * Seed script for populating the teams database with sample data.
 * 
 * Run with: npx convex run scripts/seed-teams
 * Or use the Convex dashboard to run the seedTeams mutation
 */

import { ConvexClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Sample teams data representing various professional and minor league teams
const SAMPLE_TEAMS = [
  // NFL Teams
  {
    name: "Dallas Cowboys",
    league: "NFL",
    sport: "Football",
    city: "Dallas",
    state: "TX",
    region: "southwest",
    marketSize: "large",
    demographics: {
      avgAge: 42,
      genderSplit: { male: 55, female: 45 },
      incomeLevel: "upper-middle",
      primaryAudience: ["Families", "Sports Enthusiasts", "Business Professionals"],
    },
    brandValues: ["tradition", "excellence", "community", "performance"],
    estimatedSponsorshipRange: { min: 2000000, max: 10000000 },
    founded: 1960,
    venue: "AT&T Stadium",
    avgAttendance: 93000,
    socialFollowing: 15000000,
    website: "https://www.dallascowboys.com",
  },
  {
    name: "Green Bay Packers",
    league: "NFL",
    sport: "Football",
    city: "Green Bay",
    state: "WI",
    region: "midwest",
    marketSize: "small",
    demographics: {
      avgAge: 45,
      genderSplit: { male: 52, female: 48 },
      incomeLevel: "middle",
      primaryAudience: ["Families", "Blue Collar Workers", "Sports Enthusiasts"],
    },
    brandValues: ["tradition", "community", "family", "loyalty"],
    estimatedSponsorshipRange: { min: 1000000, max: 5000000 },
    founded: 1919,
    venue: "Lambeau Field",
    avgAttendance: 81441,
    socialFollowing: 8000000,
    website: "https://www.packers.com",
  },
  {
    name: "Las Vegas Raiders",
    league: "NFL",
    sport: "Football",
    city: "Las Vegas",
    state: "NV",
    region: "west",
    marketSize: "large",
    demographics: {
      avgAge: 38,
      genderSplit: { male: 58, female: 42 },
      incomeLevel: "upper-middle",
      primaryAudience: ["Sports Enthusiasts", "Affluent Travelers", "Entertainment Seekers"],
    },
    brandValues: ["excellence", "tradition", "performance", "innovation"],
    estimatedSponsorshipRange: { min: 1500000, max: 8000000 },
    founded: 1960,
    venue: "Allegiant Stadium",
    avgAttendance: 65000,
    socialFollowing: 6000000,
    website: "https://www.raiders.com",
  },
  // NBA Teams
  {
    name: "Phoenix Suns",
    league: "NBA",
    sport: "Basketball",
    city: "Phoenix",
    state: "AZ",
    region: "southwest",
    marketSize: "large",
    demographics: {
      avgAge: 34,
      genderSplit: { male: 54, female: 46 },
      incomeLevel: "upper-middle",
      primaryAudience: ["Young Professionals", "Tech Workers", "Millennials"],
    },
    brandValues: ["innovation", "performance", "excellence", "community"],
    estimatedSponsorshipRange: { min: 500000, max: 3000000 },
    founded: 1968,
    venue: "Footprint Center",
    avgAttendance: 17071,
    socialFollowing: 4500000,
    website: "https://www.nba.com/suns",
  },
  {
    name: "Boston Celtics",
    league: "NBA",
    sport: "Basketball",
    city: "Boston",
    state: "MA",
    region: "northeast",
    marketSize: "large",
    demographics: {
      avgAge: 38,
      genderSplit: { male: 55, female: 45 },
      incomeLevel: "high",
      primaryAudience: ["Young Professionals", "Business Professionals", "Sports Enthusiasts"],
    },
    brandValues: ["tradition", "excellence", "community", "performance"],
    estimatedSponsorshipRange: { min: 1000000, max: 5000000 },
    founded: 1946,
    venue: "TD Garden",
    avgAttendance: 19156,
    socialFollowing: 10000000,
    website: "https://www.nba.com/celtics",
  },
  {
    name: "Miami Heat",
    league: "NBA",
    sport: "Basketball",
    city: "Miami",
    state: "FL",
    region: "southeast",
    marketSize: "large",
    demographics: {
      avgAge: 35,
      genderSplit: { male: 52, female: 48 },
      incomeLevel: "upper-middle",
      primaryAudience: ["Young Professionals", "Affluent", "Latin Americans"],
    },
    brandValues: ["performance", "innovation", "excellence", "wellness"],
    estimatedSponsorshipRange: { min: 800000, max: 4000000 },
    founded: 1988,
    venue: "Kaseya Center",
    avgAttendance: 19600,
    socialFollowing: 8500000,
    website: "https://www.nba.com/heat",
  },
  // MLS Teams
  {
    name: "Austin FC",
    league: "MLS",
    sport: "Soccer",
    city: "Austin",
    state: "TX",
    region: "southwest",
    marketSize: "medium",
    demographics: {
      avgAge: 31,
      genderSplit: { male: 48, female: 52 },
      incomeLevel: "high",
      primaryAudience: ["Tech Workers", "Young Professionals", "Millennials"],
    },
    brandValues: ["innovation", "community", "sustainability", "excellence"],
    estimatedSponsorshipRange: { min: 250000, max: 1500000 },
    founded: 2021,
    venue: "Q2 Stadium",
    avgAttendance: 20738,
    socialFollowing: 500000,
    website: "https://www.austinfc.com",
  },
  {
    name: "LA Galaxy",
    league: "MLS",
    sport: "Soccer",
    city: "Los Angeles",
    state: "CA",
    region: "west",
    marketSize: "large",
    demographics: {
      avgAge: 33,
      genderSplit: { male: 50, female: 50 },
      incomeLevel: "upper-middle",
      primaryAudience: ["Young Professionals", "Families", "Latin Americans"],
    },
    brandValues: ["excellence", "tradition", "performance", "community"],
    estimatedSponsorshipRange: { min: 500000, max: 3000000 },
    founded: 1994,
    venue: "Dignity Health Sports Park",
    avgAttendance: 23500,
    socialFollowing: 3000000,
    website: "https://www.lagalaxy.com",
  },
  {
    name: "Atlanta United FC",
    league: "MLS",
    sport: "Soccer",
    city: "Atlanta",
    state: "GA",
    region: "southeast",
    marketSize: "large",
    demographics: {
      avgAge: 32,
      genderSplit: { male: 52, female: 48 },
      incomeLevel: "upper-middle",
      primaryAudience: ["Young Professionals", "Families", "Sports Enthusiasts"],
    },
    brandValues: ["community", "excellence", "innovation", "family"],
    estimatedSponsorshipRange: { min: 400000, max: 2500000 },
    founded: 2017,
    venue: "Mercedes-Benz Stadium",
    avgAttendance: 47500,
    socialFollowing: 2000000,
    website: "https://www.atlutd.com",
  },
  // MLB Teams
  {
    name: "New York Yankees",
    league: "MLB",
    sport: "Baseball",
    city: "New York",
    state: "NY",
    region: "northeast",
    marketSize: "large",
    demographics: {
      avgAge: 44,
      genderSplit: { male: 55, female: 45 },
      incomeLevel: "high",
      primaryAudience: ["Business Professionals", "Families", "Sports Enthusiasts"],
    },
    brandValues: ["tradition", "excellence", "performance", "prestige"],
    estimatedSponsorshipRange: { min: 2000000, max: 15000000 },
    founded: 1901,
    venue: "Yankee Stadium",
    avgAttendance: 40000,
    socialFollowing: 12000000,
    website: "https://www.mlb.com/yankees",
  },
  {
    name: "Chicago Cubs",
    league: "MLB",
    sport: "Baseball",
    city: "Chicago",
    state: "IL",
    region: "midwest",
    marketSize: "large",
    demographics: {
      avgAge: 42,
      genderSplit: { male: 53, female: 47 },
      incomeLevel: "upper-middle",
      primaryAudience: ["Families", "Young Professionals", "Sports Enthusiasts"],
    },
    brandValues: ["tradition", "community", "family", "loyalty"],
    estimatedSponsorshipRange: { min: 1000000, max: 8000000 },
    founded: 1876,
    venue: "Wrigley Field",
    avgAttendance: 38500,
    socialFollowing: 6000000,
    website: "https://www.mlb.com/cubs",
  },
  // NHL Teams
  {
    name: "Vegas Golden Knights",
    league: "NHL",
    sport: "Hockey",
    city: "Las Vegas",
    state: "NV",
    region: "west",
    marketSize: "large",
    demographics: {
      avgAge: 36,
      genderSplit: { male: 56, female: 44 },
      incomeLevel: "upper-middle",
      primaryAudience: ["Entertainment Seekers", "Young Professionals", "Sports Enthusiasts"],
    },
    brandValues: ["innovation", "excellence", "performance", "community"],
    estimatedSponsorshipRange: { min: 500000, max: 3000000 },
    founded: 2017,
    venue: "T-Mobile Arena",
    avgAttendance: 18500,
    socialFollowing: 1500000,
    website: "https://www.nhl.com/goldenknights",
  },
  {
    name: "Seattle Kraken",
    league: "NHL",
    sport: "Hockey",
    city: "Seattle",
    state: "WA",
    region: "west",
    marketSize: "large",
    demographics: {
      avgAge: 34,
      genderSplit: { male: 54, female: 46 },
      incomeLevel: "high",
      primaryAudience: ["Tech Workers", "Young Professionals", "Families"],
    },
    brandValues: ["innovation", "sustainability", "community", "excellence"],
    estimatedSponsorshipRange: { min: 400000, max: 2500000 },
    founded: 2021,
    venue: "Climate Pledge Arena",
    avgAttendance: 17100,
    socialFollowing: 800000,
    website: "https://www.nhl.com/kraken",
  },
  // Minor League / USL
  {
    name: "Louisville City FC",
    league: "USL",
    sport: "Soccer",
    city: "Louisville",
    state: "KY",
    region: "southeast",
    marketSize: "small",
    demographics: {
      avgAge: 30,
      genderSplit: { male: 50, female: 50 },
      incomeLevel: "middle",
      primaryAudience: ["Young Professionals", "Families", "Local Community"],
    },
    brandValues: ["community", "family", "accessibility", "excellence"],
    estimatedSponsorshipRange: { min: 50000, max: 300000 },
    founded: 2015,
    venue: "Lynn Family Stadium",
    avgAttendance: 10000,
    socialFollowing: 100000,
    website: "https://www.loucity.com",
  },
  {
    name: "Sacramento Republic FC",
    league: "USL",
    sport: "Soccer",
    city: "Sacramento",
    state: "CA",
    region: "west",
    marketSize: "medium",
    demographics: {
      avgAge: 32,
      genderSplit: { male: 48, female: 52 },
      incomeLevel: "middle",
      primaryAudience: ["Families", "Young Professionals", "Local Community"],
    },
    brandValues: ["community", "family", "accessibility", "sustainability"],
    estimatedSponsorshipRange: { min: 75000, max: 400000 },
    founded: 2014,
    venue: "Heart Health Park",
    avgAttendance: 11500,
    socialFollowing: 150000,
    website: "https://www.sacrepublicfc.com",
  },
  // WNBA Teams
  {
    name: "Las Vegas Aces",
    league: "WNBA",
    sport: "Basketball",
    city: "Las Vegas",
    state: "NV",
    region: "west",
    marketSize: "medium",
    demographics: {
      avgAge: 32,
      genderSplit: { male: 40, female: 60 },
      incomeLevel: "upper-middle",
      primaryAudience: ["Women 25-44", "Families", "Sports Enthusiasts"],
    },
    brandValues: ["excellence", "empowerment", "community", "innovation"],
    estimatedSponsorshipRange: { min: 100000, max: 750000 },
    founded: 2018,
    venue: "Michelob ULTRA Arena",
    avgAttendance: 10000,
    socialFollowing: 500000,
    website: "https://aces.wnba.com",
  },
  {
    name: "New York Liberty",
    league: "WNBA",
    sport: "Basketball",
    city: "New York",
    state: "NY",
    region: "northeast",
    marketSize: "large",
    demographics: {
      avgAge: 34,
      genderSplit: { male: 38, female: 62 },
      incomeLevel: "high",
      primaryAudience: ["Women 25-44", "Young Professionals", "LGBTQ+ Community"],
    },
    brandValues: ["empowerment", "excellence", "community", "innovation"],
    estimatedSponsorshipRange: { min: 150000, max: 1000000 },
    founded: 1997,
    venue: "Barclays Center",
    avgAttendance: 12000,
    socialFollowing: 700000,
    website: "https://liberty.wnba.com",
  },
];

// This would be run as a Convex mutation
export const seedData = SAMPLE_TEAMS;

// If running as a script, use the Convex client
async function main() {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    console.error("CONVEX_URL environment variable not set");
    process.exit(1);
  }

  const client = new ConvexClient(convexUrl);

  console.log("Seeding teams database...");
  
  try {
    const ids = await client.mutation(api.teams.batchCreate, { teams: SAMPLE_TEAMS });
    console.log(`Successfully seeded ${ids.length} teams`);
  } catch (error) {
    console.error("Error seeding data:", error);
    process.exit(1);
  }

  await client.close();
}

// Run if executed directly
if (typeof require !== "undefined" && require.main === module) {
  main();
}

