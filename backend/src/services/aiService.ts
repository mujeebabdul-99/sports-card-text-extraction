import { GoogleGenerativeAI } from "@google/generative-ai";
import { NormalizedCardFields, NormalizeResponse, TitleDescriptionResponse } from "../types";

let geminiClient: GoogleGenerativeAI | null = null;
let workingGeminiModel: string = "gemini-1.5-flash"; // Use fastest flash model by default
let modelDiscoveryDone: boolean = false; // Cache flag to skip discovery on every request

function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    console.log("🤖 Initializing Google Gemini API client...");
    
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error("❌ Gemini API key is not configured");
      throw new Error("Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file. Get it from https://aistudio.google.com/app/apikey");
    }
    
    try {
      geminiClient = new GoogleGenerativeAI(apiKey);
      console.log("✅ Google Gemini API client initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize Gemini API client:", error);
      throw error;
    }
  }
  return geminiClient;
}

// Helper function to list available models via REST API
async function listAvailableModels(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    
    if (!response.ok) {
      console.log(`   ⚠️  Could not list models (status: ${response.status})`);
      return [];
    }
    
    const data = await response.json() as { models?: Array<{ name?: string }> };
    if (data.models && Array.isArray(data.models)) {
      return data.models
        .map((model) => model.name?.replace("models/", "") || "")
        .filter((name: string) => name.includes("gemini"))
        .filter(Boolean);
    }
    return [];
  } catch (error) {
    console.log(`   ⚠️  Error listing models: ${error instanceof Error ? error.message : "Unknown"}`);
    return [];
  }
}

export async function checkGeminiConnection(): Promise<boolean> {
  try {
    console.log("🔍 Testing Google Gemini API connection...");
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error("❌ GEMINI_API_KEY is not set in environment variables");
      return false;
    }
    
    // Show first few characters for debugging (mask the rest)
    const maskedKey = apiKey.length > 8 
      ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` 
      : "***";
    console.log(`   API Key: ${maskedKey} (${apiKey.length} characters)`);
    
    // Try to list available models first
    console.log("   Checking available models...");
    const availableModels = await listAvailableModels(apiKey);
    
    if (availableModels.length > 0) {
      console.log(`   ✅ Found ${availableModels.length} available model(s): ${availableModels.join(", ")}`);
    } else {
      console.log("   ⚠️  Could not list models, will try common model names...");
    }
    
    const client = getGeminiClient();
    
    // Build list of models to try: available models first, then common ones
    const modelsToTry = [
      ...availableModels,
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-pro",
      "gemini-1.0-pro",
    ].filter((model, index, self) => self.indexOf(model) === index); // Remove duplicates
    
    for (const modelName of modelsToTry) {
      try {
        console.log(`   Testing model: ${modelName}...`);
        const model = client.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("test");
        
        console.log(`✅ Google Gemini API: Connected (using ${modelName})`);
        workingGeminiModel = modelName;
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        
        if (errorMessage.includes("not found") || errorMessage.includes("404")) {
          console.log(`   ⚠️  Model ${modelName} not found`);
          continue;
        } else if (errorMessage.includes("403") || errorMessage.includes("PERMISSION_DENIED")) {
          console.error(`❌ Google Gemini API: Permission denied for ${modelName}`);
          console.error(`   Error: ${errorMessage}`);
          console.error(`   💡 This model may require billing to be enabled.`);
          console.error(`   💡 Enable billing at: https://console.cloud.google.com/billing`);
          continue;
        } else if (errorMessage.includes("401") || errorMessage.includes("API_KEY")) {
          console.error(`❌ Google Gemini API: Invalid API key`);
          console.error(`   Error: ${errorMessage}`);
          console.error(`   💡 Get a new API key from: https://aistudio.google.com/app/apikey`);
          return false;
        } else {
          // Other error - log but continue
          console.log(`   ⚠️  Error with ${modelName}: ${errorMessage.substring(0, 80)}...`);
          continue;
        }
      }
    }
    
    // All models failed
    console.error("❌ Google Gemini API: All model attempts failed");
    console.error("   💡 Possible issues:");
    console.error("   1. Billing not enabled - Enable at: https://console.cloud.google.com/billing");
    console.error("   2. API not enabled - Enable Generative Language API in Google Cloud Console");
    console.error("   3. Invalid API key - Get new key from: https://aistudio.google.com/app/apikey");
    return false;
  } catch (error) {
    console.error("❌ Google Gemini API: Connection failed", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`   Error details: ${errorMessage}`);
    return false;
  }
}

// Helper function to retry with exponential backoff (optimized delays)
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 500 // Reduced from 1000ms to 500ms for faster recovery
): Promise<T> {
  let lastError: Error | unknown;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // Only retry on 503 (service unavailable) or 429 (rate limit)
      if (errorMsg.includes("503") || errorMsg.includes("Service Unavailable") || 
          errorMsg.includes("429") || errorMsg.includes("overloaded")) {
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
          console.log(`   ⚠️  Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      // For other errors, don't retry
      throw error;
    }
  }
  
  throw lastError;
}

// Helper function to find a working model
async function findWorkingModel(client: GoogleGenerativeAI, apiKey: string): Promise<string> {
  // Try to get available models
  const availableModels = await listAvailableModels(apiKey);
  
  // Prefer fastest flash models first (optimized for speed)
  const preferredModels = [
    "gemini-1.5-flash", // Fastest, most stable
    "gemini-flash-latest", // Latest flash version
    "gemini-2.5-flash", // Newer but may be slower
    ...availableModels.filter(m => m.includes("flash") && !m.includes("preview") && !m.includes("exp") && !m.includes("thinking") && !m.includes("reasoning")),
    "gemini-1.5-pro", // Fallback to pro if flash unavailable
    ...availableModels.filter(m => !m.includes("preview") && !m.includes("exp") && !m.includes("thinking") && !m.includes("reasoning")),
  ].filter((model, index, self) => self.indexOf(model) === index);
  
  for (const modelName of preferredModels) {
    try {
      const model = client.getGenerativeModel({ model: modelName });
      await model.generateContent("test");
      console.log(`   ✅ Found working model: ${modelName}`);
      return modelName;
    } catch (e) {
      continue;
    }
  }
  
  throw new Error("No working Gemini model found");
}

export async function normalizeCardText(rawOcrText: string): Promise<NormalizeResponse> {
  try {
    console.log("🤖 Starting AI text normalization with Gemini...");
    console.log(`   OCR text length: ${rawOcrText.length} characters`);
    
    const client = getGeminiClient();
    const apiKey = process.env.GEMINI_API_KEY || "";
    
    // Use the working model
    let modelToUse = workingGeminiModel;
    console.log(`   Using model: ${modelToUse}`);

    // Optimized prompt - balanced between speed and clarity
    const prompt = `Extract and normalize sports card information from the OCR text below.

OCR Text:
${rawOcrText}

Extract these fields:
- year: Card production year (e.g., "1972", "1955")
- set: Brand/set name (e.g., "Topps", "Bowman")
- cardNumber: Card number (e.g., "#595", "#123")
- title: Card title or highlight text
- playerFirstName: Player's first name
- playerLastName: Player's last name
- gradingCompany: Grading company (e.g., "PSA", "SGC", "BGS")
- grade: Grade (e.g., "NM-MT 8", "VG-EX 4", "Mint 9")
- cert: Certification number if available
- caption: Additional caption text

Normalize abbreviations: VG→VG-EX, EX→EX-MT, NM→NM-MT

Return ONLY valid JSON with this structure:
{
  "normalized": {
    "year": "",
    "set": "",
    "cardNumber": "",
    "title": "",
    "playerFirstName": "",
    "playerLastName": "",
    "gradingCompany": "",
    "grade": "",
    "cert": "",
    "caption": ""
  },
  "confidenceByField": {
    "year": 0.0,
    "set": 0.0,
    "cardNumber": 0.0,
    "title": 0.0,
    "playerFirstName": 0.0,
    "playerLastName": 0.0,
    "gradingCompany": 0.0,
    "grade": 0.0,
    "cert": 0.0,
    "caption": 0.0
  }
}

Confidence scores: 0.5-0.7 if unclear/missing, 0.8-1.0 if clearly identified.`;

    // Try with retry logic and fallback models
    let result;
    let lastError: Error | unknown;
    
    // Skip model discovery if we already have a working model (performance optimization)
    let modelsToTry = [modelToUse];
    
    // Only do model discovery if we don't have a cached working model
    if (!modelDiscoveryDone) {
      try {
        const foundModel = await findWorkingModel(client, apiKey);
        if (foundModel && !modelsToTry.includes(foundModel)) {
          modelsToTry.push(foundModel);
          workingGeminiModel = foundModel; // Cache the working model
        }
        modelDiscoveryDone = true; // Mark discovery as done
      } catch (e) {
        // If findWorkingModel fails, use hardcoded fallbacks
        console.log("   ⚠️  Could not find working model dynamically, using fallbacks...");
      }
    }
    
    // Add fallback models (prioritize flash models for speed)
    const fallbackModels = [
      "gemini-1.5-flash", // Fastest
      "gemini-flash-latest",
      "gemini-2.5-flash",
      "gemini-1.5-pro", // Fallback
    ];
    
    modelsToTry = [
      ...modelsToTry,
      ...fallbackModels,
    ].filter((model, index, self) => self.indexOf(model) === index); // Remove duplicates
    
    for (const currentModel of modelsToTry) {
      try {
        console.log(`   Trying model: ${currentModel}...`);
        const model = client.getGenerativeModel({ 
          model: currentModel,
          generationConfig: {
            temperature: 0.2, // Lower temperature for faster, more deterministic responses
            responseMimeType: "application/json",
            maxOutputTokens: 2000, // Increased to ensure complete JSON response
          },
        });
        
        // Retry with exponential backoff for 503/429 errors (optimized delays)
        result = await retryWithBackoff(async () => {
          return await model.generateContent(prompt);
        }, 3, 500); // Reduced base delay from 1000ms to 500ms
        
        // Success - update working model
        if (currentModel !== modelToUse) {
          console.log(`   ✅ Switched to model: ${currentModel}`);
          workingGeminiModel = currentModel;
        }
        break; // Success, exit loop
      } catch (modelError) {
        lastError = modelError;
        const errorMsg = modelError instanceof Error ? modelError.message : String(modelError);
        
        // If it's a 404 (model not found), try next model
        if (errorMsg.includes("not found") || errorMsg.includes("404")) {
          console.log(`   ⚠️  Model ${currentModel} not found, trying next...`);
          continue;
        }
        
        // If it's 503/429 (overloaded/rate limit), try next model
        if (errorMsg.includes("503") || errorMsg.includes("Service Unavailable") || 
            errorMsg.includes("429") || errorMsg.includes("overloaded")) {
          console.log(`   ⚠️  Model ${currentModel} is overloaded, trying alternative...`);
          continue;
        }
        
        // For other errors, throw immediately
        throw modelError;
      }
    }
    
    // If all models failed
    if (!result) {
      const errorMsg = lastError instanceof Error ? lastError.message : String(lastError || "Unknown error");
      
      // Provide user-friendly error message
      if (errorMsg.includes("not found") || errorMsg.includes("404")) {
        throw new Error("AI service unavailable: No compatible models found. Please check your API configuration.");
      } else if (errorMsg.includes("403") || errorMsg.includes("PERMISSION_DENIED")) {
        throw new Error("AI service access denied: Please enable billing or check API permissions.");
      } else if (errorMsg.includes("401") || errorMsg.includes("API_KEY")) {
        throw new Error("AI service authentication failed: Please check your API key configuration.");
      } else if (errorMsg.includes("503") || errorMsg.includes("Service Unavailable")) {
        throw new Error("AI service temporarily unavailable: Please try again in a moment.");
      } else {
        throw new Error(`AI processing failed: ${errorMsg}`);
      }
    }
    const response = result.response;
    
    // Better error handling for empty responses
    if (!response) {
      throw new Error("No response object from Gemini");
    }
    
    let content: string;
    try {
      content = response.text();
    } catch (textError) {
      console.error("   ❌ Error getting text from response:", textError);
      // Try to get candidates if available
      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          content = candidate.content.parts[0].text || "";
        }
      }
      if (!content) {
        throw new Error(`Failed to extract text from response: ${textError instanceof Error ? textError.message : "Unknown error"}`);
      }
    }

    if (!content || content.trim().length === 0) {
      console.error("   ❌ Empty response content from Gemini");
      console.error("   Response object:", JSON.stringify(response, null, 2));
      throw new Error("No response content from Gemini - response was empty");
    }
    
    console.log(`   📝 Response length: ${content.length} characters`);
    console.log(`   📝 Response preview: ${content.substring(0, 200)}...`);

    let parsed: NormalizeResponse;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error("   ❌ Failed to parse JSON response");
      console.error("   Response content:", content);
      throw new Error(`Invalid JSON response from Gemini: ${parseError instanceof Error ? parseError.message : "Unknown parse error"}`);
    }
    
    console.log("✅ AI normalization completed");
    return parsed;
  } catch (error) {
    console.error("❌ AI Normalization Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`   Error details: ${errorMessage}`);
    throw new Error(`AI normalization failed: ${errorMessage}`);
  }
}

export async function generateTitleAndDescription(
  normalized: NormalizedCardFields
): Promise<TitleDescriptionResponse> {
  try {
    console.log("📝 Generating title and description with Gemini...");
    const client = getGeminiClient();
    const apiKey = process.env.GEMINI_API_KEY || "";
    const modelToUse = workingGeminiModel;
    console.log(`   Using model: ${modelToUse}`);

    // Build player name
    const playerName = [normalized.playerFirstName, normalized.playerLastName].filter(Boolean).join(" ");

    // Client-specified format for title and description
    const prompt = `Generate a title and description for this sports card.

Card Information:
- Year: ${normalized.year || ""}
- Brand/Set: ${normalized.set || ""}
- Card Number: ${normalized.cardNumber || ""}
- Player First Name: ${normalized.playerFirstName || ""}
- Player Last Name: ${normalized.playerLastName || ""}
- Grading Service: ${normalized.gradingCompany || ""}
- Grade: ${normalized.grade || ""}
- Card Title/Event: ${normalized.title || "None"}
- Caption: ${normalized.caption || "None"}

Title Format (REQUIRED - follow exactly):
[year] [brand] [player first name] [player last name] [special designation, if applicable*] [card number] [grading service] [grade]

*Special designations include: rookie, logo patch, jersey patch, signed, etc. 
- Check the Card Title/Event and Caption fields above for special designations
- Only include special designation if it's clearly mentioned (e.g., "Rookie", "Signed", "Logo Patch", "Jersey Patch")
- If no special designation is found, omit it entirely

IMPORTANT RULES:
- Always include player first name and last name in the title (even if they appear in the card title)
- Special designation (if any) goes AFTER player name and BEFORE card number
- Card number should include the # symbol (e.g., #595, #123)
- Use exact format: year, brand, first name, last name, special designation (optional), card number, grading service, grade
- Do NOT include the card title/event text unless it's a special designation

Description Format (REQUIRED - follow exactly):
[repeat title], [player name], [description of why player is important]. [why card is good].

CRITICAL: You MUST generate BOTH autoTitle AND autoDescription. Do NOT leave autoDescription empty.

Examples:
Title: "1972 Topps Nolan Ryan #595 PSA NM-MT 8"
Description: "1972 Topps Nolan Ryan #595 PSA NM-MT 8, Nolan Ryan, Hall of Fame pitcher known for his record 7 no-hitters and 5,714 strikeouts. This high-grade card from his prime years is highly sought after by collectors."

Title: "1955 Topps Sandy Koufax Rookie #123 PSA VG-EX 4"
Description: "1955 Topps Sandy Koufax Rookie #123 PSA VG-EX 4, Sandy Koufax, Legendary left-handed pitcher and Hall of Famer who dominated the 1960s. This is his iconic rookie card, making it extremely valuable despite the lower grade."

IMPORTANT: 
- autoDescription MUST be a complete sentence (at least 50 characters)
- autoDescription MUST explain why the player is important
- autoDescription MUST explain why the card is valuable/good
- NEVER return an empty autoDescription

Return ONLY valid JSON:
{
  "autoTitle": "",
  "autoDescription": ""
}`;

    // Try with retry logic and fallback models
    let result;
    let lastError: Error | unknown;
    
    // First, try to find a working model dynamically if the default fails
    let modelsToTry = [modelToUse];
    
    // If default model fails, try to find a working one
    try {
      const foundModel = await findWorkingModel(client, apiKey);
      if (foundModel && !modelsToTry.includes(foundModel)) {
        modelsToTry.push(foundModel);
      }
    } catch (e) {
      // If findWorkingModel fails, use hardcoded fallbacks
      console.log("   ⚠️  Could not find working model dynamically, using fallbacks...");
    }
    
    // Add fallback models (prioritize flash models for speed)
    const fallbackModels = [
      "gemini-1.5-flash", // Fastest
      "gemini-flash-latest",
      "gemini-2.5-flash",
      "gemini-1.5-pro", // Fallback
    ];
    
    modelsToTry = [
      ...modelsToTry,
      ...fallbackModels,
    ].filter((model, index, self) => self.indexOf(model) === index); // Remove duplicates
    
    for (const currentModel of modelsToTry) {
      try {
        console.log(`   Trying model: ${currentModel}...`);
        const model = client.getGenerativeModel({ 
          model: currentModel,
          generationConfig: {
            temperature: 0.2, // Lower temperature for faster, more deterministic responses
            responseMimeType: "application/json",
            maxOutputTokens: 1000, // Increased to ensure complete JSON response
          },
        });
        
        // Retry with exponential backoff for 503/429 errors (optimized delays)
        result = await retryWithBackoff(async () => {
          return await model.generateContent(prompt);
        }, 3, 500); // Reduced base delay from 1000ms to 500ms
        
        // Success - update working model
        if (currentModel !== modelToUse) {
          console.log(`   ✅ Switched to model: ${currentModel}`);
          workingGeminiModel = currentModel;
        }
        break; // Success, exit loop
      } catch (modelError) {
        lastError = modelError;
        const errorMsg = modelError instanceof Error ? modelError.message : String(modelError);
        
        // If it's a 404 (model not found), try next model
        if (errorMsg.includes("not found") || errorMsg.includes("404")) {
          console.log(`   ⚠️  Model ${currentModel} not found, trying next...`);
          continue;
        }
        
        // If it's 503/429 (overloaded/rate limit), try next model
        if (errorMsg.includes("503") || errorMsg.includes("Service Unavailable") || 
            errorMsg.includes("429") || errorMsg.includes("overloaded")) {
          console.log(`   ⚠️  Model ${currentModel} is overloaded, trying alternative...`);
          continue;
        }
        
        // For other errors, throw immediately
        throw modelError;
      }
    }
    
    // If all models failed
    if (!result) {
      const errorMsg = lastError instanceof Error ? lastError.message : String(lastError || "Unknown error");
      
      // Provide user-friendly error message
      if (errorMsg.includes("not found") || errorMsg.includes("404")) {
        throw new Error("AI service unavailable: No compatible models found. Please check your API configuration.");
      } else if (errorMsg.includes("403") || errorMsg.includes("PERMISSION_DENIED")) {
        throw new Error("AI service access denied: Please enable billing or check API permissions.");
      } else if (errorMsg.includes("401") || errorMsg.includes("API_KEY")) {
        throw new Error("AI service authentication failed: Please check your API key configuration.");
      } else if (errorMsg.includes("503") || errorMsg.includes("Service Unavailable")) {
        throw new Error("AI service temporarily unavailable: Please try again in a moment.");
      } else {
        throw new Error(`AI processing failed: ${errorMsg}`);
      }
    }
    const response = result.response;
    
    // Better error handling for empty responses
    if (!response) {
      throw new Error("No response object from Gemini");
    }
    
    let content: string;
    try {
      content = response.text();
    } catch (textError) {
      console.error("   ❌ Error getting text from response:", textError);
      // Try to get candidates if available
      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          content = candidate.content.parts[0].text || "";
        }
      }
      if (!content) {
        throw new Error(`Failed to extract text from response: ${textError instanceof Error ? textError.message : "Unknown error"}`);
      }
    }

    if (!content || content.trim().length === 0) {
      console.error("   ❌ Empty response content from Gemini");
      throw new Error("No response content from Gemini - response was empty");
    }
    
    console.log(`   📝 Response length: ${content.length} characters`);
    console.log(`   📝 Response preview: ${content.substring(0, 300)}...`);

    let parsed: TitleDescriptionResponse;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error("   ❌ Failed to parse JSON response");
      console.error("   Response content:", content);
      throw new Error(`Invalid JSON response from Gemini: ${parseError instanceof Error ? parseError.message : "Unknown parse error"}`);
    }
    
    // Validate and fix response
    let fixedTitle = parsed.autoTitle || "";
    let fixedDescription = parsed.autoDescription || "";
    
    // Check if title contains description (common AI mistake - title is too long)
    // Typical title should be < 150 characters, if longer it might contain description
    if (fixedTitle.length > 150 && !fixedDescription) {
      console.warn("   ⚠️  Title seems too long and description is empty - might be combined");
      // Try to split on common patterns
      const titlePattern = /^(.{0,150}?)(?:,\s*)(.+)$/;
      const match = fixedTitle.match(titlePattern);
      if (match && match[1] && match[2]) {
        console.log("   🔧 Attempting to split title and description");
        fixedTitle = match[1].trim();
        fixedDescription = match[2].trim();
      }
    }
    
    // If description is empty but title has description-like content, try to extract
    if (!fixedDescription && fixedTitle.includes(", ") && fixedTitle.length > 100) {
      // Look for pattern: "Title, Player Name, description..."
      const parts = fixedTitle.split(", ");
      if (parts.length >= 3) {
        // First part is likely the title, rest might be description
        const potentialTitle = parts.slice(0, 2).join(", "); // Title + Player Name
        const potentialDesc = parts.slice(2).join(", ");
        if (potentialTitle.length < 150 && potentialDesc.length > 20) {
          console.log("   🔧 Extracting description from title field");
          fixedTitle = potentialTitle;
          fixedDescription = potentialDesc;
        }
      }
    }
    
    // Validate final fields
    if (!fixedTitle || fixedTitle.trim() === "") {
      console.warn("   ⚠️  autoTitle is empty or missing in response");
      console.warn("   Full parsed response:", JSON.stringify(parsed, null, 2));
    }
    
    if (!fixedDescription || fixedDescription.trim() === "") {
      console.warn("   ⚠️  autoDescription is empty or missing in response");
      console.warn("   Full parsed response:", JSON.stringify(parsed, null, 2));
      
      // Try to generate a fallback description from the title
      if (fixedTitle && fixedTitle.trim() !== "") {
        const playerName = [normalized.playerFirstName, normalized.playerLastName].filter(Boolean).join(" ");
        if (playerName) {
          fixedDescription = `${fixedTitle}, ${playerName}, notable player in sports history. This card is valuable for collectors.`;
          console.log("   🔧 Generated fallback description");
        }
      }
    }
    
    // Final validation - ensure description is not empty
    if (!fixedDescription || fixedDescription.trim() === "") {
      console.error("   ❌ CRITICAL: autoDescription is still empty after all attempts");
      console.error("   This should not happen - AI should always generate a description");
      // Set a minimal fallback
      fixedDescription = `${fixedTitle || "Sports card"}, collectible item.`;
    }
    
    // Log what we're returning
    console.log(`   ✅ autoTitle (${fixedTitle.length} chars): ${fixedTitle ? fixedTitle.substring(0, 50) + "..." : "EMPTY"}`);
    console.log(`   ✅ autoDescription (${fixedDescription.length} chars): ${fixedDescription ? fixedDescription.substring(0, 50) + "..." : "EMPTY"}`);
    
    console.log("✅ Title and description generated");
    return {
      autoTitle: fixedTitle,
      autoDescription: fixedDescription,
    };
  } catch (error) {
    console.error("❌ Title/Description Generation Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`   Error details: ${errorMessage}`);
    throw new Error(`Title/description generation failed: ${errorMessage}`);
  }
}
