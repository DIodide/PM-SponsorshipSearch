import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

// ----------------------
// Types
// ----------------------

interface GeneratedCampaign {
  title: string;
  description: string;
  tactics: string[];
  whyItWorks: string;
  goals: string[];
  channels: {
    primary: string;
    secondary: string;
  };
  estimatedCost: number;
  suggestedDates: {
    start: string;
    end: string;
  };
  visualPrompts?: string[];
  imageUrls: string[];
  teamId: string;
  teamName: string;
  status: "draft" | "active" | "completed";
}

// ----------------------
// Helper: Store base64 image to Convex storage
// ----------------------

async function storeBase64Image(
  ctx: any,
  base64Data: string,
  mimeType: string
): Promise<string | null> {
  try {
    // Convert base64 to Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Create a Blob and store it
    const blob = new Blob([bytes], { type: mimeType });
    const storageId = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);
    return url;
  } catch (error) {
    console.error("Failed to store image:", error);
    return null;
  }
}

// ----------------------
// Generate Campaign Visuals using Gemini 3 Pro Image
// ----------------------

export const generateCampaignVisuals = action({
  args: {
    teamName: v.string(),
    teamLeague: v.string(),
    campaignTitle: v.string(),
    touchpoints: v.array(v.string()),
    visualPrompts: v.array(v.string()),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<string[]> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY not configured");
      return [];
    }

    const count = args.count || 4;
    const generatedImages: string[] = [];
    const promptsToProcess = args.visualPrompts.slice(0, count);

    // Generate images in parallel for better performance
    const imagePromises = promptsToProcess.map(async (prompt) => {
      const fullPrompt = `
Create a professional sports marketing photograph for a ${args.teamLeague} team sponsorship campaign.

Team: ${args.teamName}
Campaign: ${args.campaignTitle}
Scene: ${prompt}
Touchpoints: ${args.touchpoints.join(", ")}

Style requirements:
- High-energy, authentic sports photography
- Brand activation atmosphere
- Engaged fans and vibrant crowd scenes
- Professional commercial quality
- No text, logos, or watermarks in the image
- Photorealistic style
      `.trim();

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: fullPrompt }] }],
              generationConfig: {
                responseModalities: ["image", "text"],
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Gemini Image API error:", response.status, errorText);
          return null;
        }

        const data = await response.json();
        const imagePart = data.candidates?.[0]?.content?.parts?.find(
          (p: any) => p.inlineData?.mimeType?.startsWith("image/")
        );

        if (imagePart?.inlineData?.data) {
          // Store the image in Convex storage
          const url = await storeBase64Image(
            ctx,
            imagePart.inlineData.data,
            imagePart.inlineData.mimeType
          );
          return url;
        }
        return null;
      } catch (error) {
        console.error("Error generating image:", error);
        return null;
      }
    });

    const results = await Promise.all(imagePromises);
    for (const url of results) {
      if (url) {
        generatedImages.push(url);
      }
    }

    return generatedImages;
  },
});

// ----------------------
// Generate Full Campaign with Text Details
// ----------------------

export const generateCampaign = action({
  args: {
    teamId: v.string(),
    teamName: v.string(),
    teamLeague: v.string(),
    teamRegion: v.string(),
    mediaStrategy: v.string(),
    touchpoints: v.array(v.string()),
    notes: v.optional(v.string()),
    uploadedImageUrls: v.optional(v.array(v.string())),
    generateVisuals: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<GeneratedCampaign> => {
    const apiKey = process.env.GEMINI_API_KEY;

    // Default fallback campaign
    const fallbackCampaign: GeneratedCampaign = {
      title: `${args.teamName} Partnership Campaign`,
      description: `A strategic ${args.mediaStrategy} campaign leveraging ${args.touchpoints.join(", ")} touchpoints to connect with ${args.teamName} fans.`,
      tactics: [
        `${args.touchpoints[0] || "Social"} media activation with team branding`,
        "Fan engagement experiences at home games",
        "Co-branded content series featuring team players",
      ],
      whyItWorks: `This campaign leverages ${args.teamName}'s strong ${args.teamRegion} fanbase through authentic touchpoints that resonate with their audience.`,
      goals: ["Brand Awareness", "Fan Engagement", "Customer Acquisition"],
      channels: {
        primary: args.touchpoints[0] || "Social Media",
        secondary: args.touchpoints[1] || "Events",
      },
      estimatedCost: 15000,
      suggestedDates: {
        start: "Mar 1",
        end: "Mar 31",
      },
      imageUrls: args.uploadedImageUrls || [],
      teamId: args.teamId,
      teamName: args.teamName,
      status: "draft",
    };

    if (!apiKey) {
      console.error("GEMINI_API_KEY not configured, using fallback campaign");
      return fallbackCampaign;
    }

    // 1. Generate campaign text content using Gemini 2.0 Flash
    const textPrompt = `
Generate a creative and strategic sponsorship campaign for a brand partnering with ${args.teamName} (${args.teamLeague}).

Campaign Parameters:
- Media Strategy: ${args.mediaStrategy}
- Touchpoints: ${args.touchpoints.join(", ")}
- Region: ${args.teamRegion}
${args.notes ? `- Additional Notes from the brand: ${args.notes}` : ""}

Create an exciting, memorable campaign that would resonate with the team's fanbase.

Respond in this exact JSON format (no markdown, no code blocks, just raw JSON):
{
  "title": "Catchy, memorable campaign title (e.g., 'Pop Off with the Lakers', 'Slam Dunk Summer')",
  "description": "2-3 sentence compelling campaign description that captures the essence and excitement",
  "tactics": [
    "Specific tactic 1 with detailed activation idea",
    "Specific tactic 2 with detailed activation idea",
    "Specific tactic 3 with detailed activation idea"
  ],
  "whyItWorks": "1-2 sentences explaining why this strategy will be effective for this team and audience",
  "goals": ["Goal 1", "Goal 2", "Goal 3"],
  "channels": {
    "primary": "Primary marketing channel",
    "secondary": "Secondary marketing channel"
  },
  "estimatedCost": 12500,
  "suggestedDates": {
    "start": "Mar 3",
    "end": "Mar 27"
  },
  "visualPrompts": [
    "Detailed scene description for activation image 1 (e.g., 'Excited fans at stadium concourse sampling products')",
    "Detailed scene description for activation image 2",
    "Detailed scene description for activation image 3",
    "Detailed scene description for activation image 4"
  ]
}
    `.trim();

    try {
      const textResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: textPrompt }] }],
            generationConfig: {
              maxOutputTokens: 4096,
              temperature: 0.7,
            },
          }),
        }
      );

      if (!textResponse.ok) {
        const errorText = await textResponse.text();
        console.error("Gemini Text API error:", textResponse.status, errorText);
        return fallbackCampaign;
      }

      const data = await textResponse.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      const finishReason = data.candidates?.[0]?.finishReason;
      
      // Check if response was truncated
      if (finishReason === "MAX_TOKENS" || finishReason === "LENGTH") {
        console.error("Gemini response was truncated due to token limit");
        return fallbackCampaign;
      }

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("Could not parse JSON from Gemini response");
        return fallbackCampaign;
      }
      
      // Quick validation: check if JSON appears complete (ends with proper closing brace)
      const extractedJson = jsonMatch[0];
      if (!extractedJson.trim().endsWith('}')) {
        console.error("JSON appears to be truncated (doesn't end with })");
        return fallbackCampaign;
      }

      // Sanitize JSON string - remove/escape control characters that break JSON.parse
      // This handles cases where AI includes literal newlines/tabs in string values
      let sanitizedJson = extractedJson;
      
      // Process the string to properly escape control characters within JSON string values
      // We do this by finding string values and escaping their contents
      let result = '';
      let inString = false;
      let escaped = false;
      
      for (let i = 0; i < sanitizedJson.length; i++) {
        const char = sanitizedJson[i];
        const code = char.charCodeAt(0);
        
        if (escaped) {
          result += char;
          escaped = false;
          continue;
        }
        
        if (char === '\\' && inString) {
          escaped = true;
          result += char;
          continue;
        }
        
        if (char === '"') {
          inString = !inString;
          result += char;
          continue;
        }
        
        // Handle control characters inside strings
        if (inString && code < 32) {
          if (code === 10) result += '\\n';      // newline
          else if (code === 13) result += '\\r'; // carriage return
          else if (code === 9) result += '\\t';  // tab
          else result += '';                      // remove other control chars
          continue;
        }
        
        result += char;
      }
      
      sanitizedJson = result;

      let campaignData;
      try {
        campaignData = JSON.parse(sanitizedJson);
      } catch (parseError) {
        console.error("JSON parse error after sanitization:", parseError);
        console.error("Raw text from Gemini:", text.substring(0, 500));
        return fallbackCampaign;
      }

      // 2. Generate visuals if requested
      let imageUrls = args.uploadedImageUrls || [];

      if (args.generateVisuals && campaignData.visualPrompts?.length > 0) {
        console.log("Generating campaign visuals...");
        const generatedUrls = await ctx.runAction(
          api.campaignGeneration.generateCampaignVisuals,
          {
            teamName: args.teamName,
            teamLeague: args.teamLeague,
            campaignTitle: campaignData.title || "Campaign",
            touchpoints: args.touchpoints,
            visualPrompts: campaignData.visualPrompts,
            count: 4,
          }
        );
        imageUrls = [...imageUrls, ...generatedUrls];
      }

      return {
        title: campaignData.title || fallbackCampaign.title,
        description: campaignData.description || fallbackCampaign.description,
        tactics: campaignData.tactics || fallbackCampaign.tactics,
        whyItWorks: campaignData.whyItWorks || fallbackCampaign.whyItWorks,
        goals: campaignData.goals || fallbackCampaign.goals,
        channels: campaignData.channels || fallbackCampaign.channels,
        estimatedCost: campaignData.estimatedCost || fallbackCampaign.estimatedCost,
        suggestedDates: campaignData.suggestedDates || fallbackCampaign.suggestedDates,
        visualPrompts: campaignData.visualPrompts,
        imageUrls,
        teamId: args.teamId,
        teamName: args.teamName,
        status: "draft",
      };
    } catch (error) {
      console.error("Error generating campaign:", error);
      return fallbackCampaign;
    }
  },
});

// ----------------------
// Generate Only Visuals (for when user wants to regenerate images)
// ----------------------

export const regenerateVisuals = action({
  args: {
    teamName: v.string(),
    teamLeague: v.string(),
    campaignTitle: v.string(),
    touchpoints: v.array(v.string()),
    customPrompts: v.optional(v.array(v.string())),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<string[]> => {
    // Generate default prompts if none provided
    const defaultPrompts = [
      `Excited fans at a ${args.teamLeague} game cheering and engaging with a brand activation booth`,
      `Interactive product sampling station at the stadium concourse with diverse fans participating`,
      `Social media content creation moment with fans taking photos at a branded photo opportunity`,
      `Premium hospitality experience with fans enjoying exclusive brand partnership amenities`,
    ];

    const visualPrompts = args.customPrompts || defaultPrompts;

    return await ctx.runAction(api.campaignGeneration.generateCampaignVisuals, {
      teamName: args.teamName,
      teamLeague: args.teamLeague,
      campaignTitle: args.campaignTitle,
      touchpoints: args.touchpoints,
      visualPrompts,
      count: args.count || 4,
    });
  },
});
