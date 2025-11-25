import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { performance } from "perf_hooks";
import { config } from "../config";
import { extractTextFromImage } from "../services/ocrService";
import { normalizeCardText, generateTitleAndDescription } from "../services/aiService";
import { randomUUID } from "crypto";
import { CardRecord } from "../types";
import { cardsStore } from "../models/cardStore";

const router: Router = Router();

router.post("/", async (req: Request, res: Response) => {
  const timings: Record<string, number> = {};
  const totalStartTime = performance.now();
  
  try {
    console.log("🚀 Starting card processing pipeline...");
    const { filename, sourceImageId, url } = req.body;

    if (!filename) {
      console.error("❌ Missing filename in request");
      return res.status(400).json({ error: "Filename is required" });
    }

    console.log(`📁 Processing file: ${filename}`);

    // Step 1: OCR
    console.log("\n--- Step 1: OCR Extraction ---");
    const ocrStartTime = performance.now();
    
    // Build image path - handle both absolute and relative paths
    const uploadDir = config.upload.dir;
    const imagePath = path.isAbsolute(uploadDir) 
      ? path.join(uploadDir, filename)
      : path.join(__dirname, "../../", uploadDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      console.error(`❌ Image file not found: ${imagePath}`);
      console.error(`   Upload directory: ${uploadDir}`);
      console.error(`   Filename: ${filename}`);
      return res.status(404).json({ 
        error: "Image file not found",
        path: imagePath 
      });
    }
    
    console.log(`   Image path verified: ${imagePath}`);
    let ocrResult;
    try {
      ocrResult = await extractTextFromImage(imagePath);
      const ocrEndTime = performance.now();
      timings.ocr = Math.round((ocrEndTime - ocrStartTime) / 100) / 10; // Round to 1 decimal place
      console.log(`   Extracted ${ocrResult.rawOcrText.length} characters`);
      console.log(`   ⏱️  OCR took ${timings.ocr}s`);
      
      // Check if OCR extracted any text
      if (!ocrResult.rawOcrText || ocrResult.rawOcrText.trim().length === 0) {
        console.warn("⚠️  OCR returned empty text - image may be invalid or contain no readable text");
        return res.status(400).json({
          error: "No text found in image",
          message: "Unable to extract any text from this image. Please ensure:\n• The image is clear and in focus\n• The card text is visible and readable\n• The image is not corrupted or damaged\n• Try uploading a higher quality image",
          step: "ocr",
        });
      }
    } catch (ocrError: any) {
      console.error("❌ OCR processing failed:", ocrError);
      const ocrErrorMessage = ocrError instanceof Error ? ocrError.message : "Unknown OCR error";
      
      // Provide specific error messages for common OCR failures
      if (ocrErrorMessage.includes("does not exist") || ocrErrorMessage.includes("not found")) {
        return res.status(404).json({
          error: "Image file not found",
          message: "The uploaded image file could not be found. Please try uploading again.",
          step: "ocr",
        });
      } else if (ocrErrorMessage.includes("not readable") || ocrErrorMessage.includes("permission")) {
        return res.status(403).json({
          error: "Image file access denied",
          message: "Unable to read the image file. Please try uploading again.",
          step: "ocr",
        });
      } else if (ocrErrorMessage.includes("Invalid image") || ocrErrorMessage.includes("corrupted")) {
        return res.status(400).json({
          error: "Invalid or corrupted image",
          message: "The uploaded image appears to be corrupted or invalid. Please try:\n• Uploading a different image file\n• Ensuring the file is a valid JPG, PNG, GIF, or WebP\n• Checking that the image is not damaged",
          step: "ocr",
        });
      } else {
        return res.status(500).json({
          error: "OCR processing failed",
          message: "Unable to extract text from the image. Please ensure the image is clear and contains readable text, then try again.",
          step: "ocr",
          details: config.nodeEnv === "development" ? ocrErrorMessage : undefined,
        });
      }
    }

    // Step 2: Normalize
    console.log("\n--- Step 2: AI Normalization ---");
    const normalizeStartTime = performance.now();
    let normalizeResult;
    try {
      normalizeResult = await normalizeCardText(ocrResult.rawOcrText);
      const normalizeEndTime = performance.now();
      timings.normalization = Math.round((normalizeEndTime - normalizeStartTime) / 100) / 10;
      console.log("   Normalization completed");
      console.log(`   ⏱️  Normalization took ${timings.normalization}s`);
    } catch (normalizeError: any) {
      console.error("❌ AI Normalization failed:", normalizeError);
      const normalizeErrorMessage = normalizeError instanceof Error ? normalizeError.message : "Unknown error";
      
      // Provide user-friendly error messages
      if (normalizeErrorMessage.includes("AI service unavailable") || normalizeErrorMessage.includes("No compatible models")) {
        return res.status(503).json({
          error: "AI service unavailable",
          message: "The AI service is currently unavailable. This may be due to:\n• API configuration issues\n• No compatible AI models available\n• Please try again later or contact support",
          step: "normalization",
        });
      } else if (normalizeErrorMessage.includes("access denied") || normalizeErrorMessage.includes("billing")) {
        return res.status(403).json({
          error: "AI service access denied",
          message: "Unable to access AI services. Please ensure:\n• Billing is enabled for your Google Cloud account\n• API permissions are correctly configured\n• Contact your administrator if this persists",
          step: "normalization",
        });
      } else if (normalizeErrorMessage.includes("authentication failed") || normalizeErrorMessage.includes("API key")) {
        return res.status(401).json({
          error: "AI service authentication failed",
          message: "Invalid API credentials. Please check:\n• Your API key is correctly configured\n• The API key has the necessary permissions\n• Contact support if you need help setting up API access",
          step: "normalization",
        });
      } else if (normalizeErrorMessage.includes("temporarily unavailable")) {
        return res.status(503).json({
          error: "AI service temporarily unavailable",
          message: "The AI service is temporarily overloaded. Please:\n• Wait a few moments and try again\n• The service should be available shortly",
          step: "normalization",
        });
      } else {
        return res.status(500).json({
          error: "AI normalization failed",
          message: normalizeErrorMessage || "Unable to process the extracted text. Please try again or contact support if the issue persists.",
          step: "normalization",
          details: config.nodeEnv === "development" ? normalizeErrorMessage : undefined,
        });
      }
    }

    // Step 3: Create card record first (before background title generation)
    console.log("\n--- Step 3: Creating Card Record ---");
    const cardId = randomUUID();
    const now = new Date().toISOString();

    const card: CardRecord = {
      id: cardId,
      sourceImage: {
        id: sourceImageId || cardId,
        url: url || `/uploads/${filename}`,
        filename,
      },
      rawOcrText: ocrResult.rawOcrText,
      ocrBlocks: ocrResult.ocrBlocks,
      normalized: normalizeResult.normalized,
      confidenceByField: normalizeResult.confidenceByField,
      autoTitle: "", // Will be filled in background
      autoDescription: "", // Will be filled in background
      processingStatus: "ready_for_review",
      errors: [],
      createdAt: now,
      updatedAt: now,
    };

    cardsStore.set(cardId, card);
    
    // Step 4: Generate title and description (NON-BLOCKING - runs in background)
    console.log("\n--- Step 4: Generate Title/Description (background) ---");
    
    // Start title generation in background (don't await - return immediately)
    const titleStartTime = performance.now();
    generateTitleAndDescription(normalizeResult.normalized)
      .then((result) => {
        const titleEndTime = performance.now();
        const titleTime = Math.round((titleEndTime - titleStartTime) / 100) / 10;
        console.log("   ✅ Title/Description generated in background");
        console.log(`   ⏱️  Title generation took ${titleTime}s`);
        
        // Update the card record with the generated title/description
        const existingCard = cardsStore.get(cardId);
        if (existingCard) {
          // Validate the fields before saving
          let finalTitle = result.autoTitle || "";
          let finalDescription = result.autoDescription || "";
          
          // Check if title is too long (might contain description)
          // Typical title should be < 150 characters
          if (finalTitle.length > 150 && finalDescription.length < 50) {
            console.warn(`   ⚠️  WARNING: autoTitle is very long (${finalTitle.length} chars) and autoDescription is short (${finalDescription.length} chars)`);
            console.warn(`   ⚠️  This suggests the fields might be swapped or combined`);
            console.warn(`   ⚠️  autoTitle: "${finalTitle.substring(0, 100)}..."`);
            console.warn(`   ⚠️  autoDescription: "${finalDescription}"`);
            
            // Try to detect if title contains description
            if (finalTitle.includes(", ") && finalTitle.split(", ").length >= 3) {
              const parts = finalTitle.split(", ");
              // First 2 parts are likely the title, rest is description
              const potentialTitle = parts.slice(0, 2).join(", ");
              const potentialDesc = parts.slice(2).join(", ");
              if (potentialTitle.length < 150 && potentialDesc.length > 50) {
                console.log(`   🔧 Attempting to fix swapped fields`);
                finalTitle = potentialTitle;
                finalDescription = potentialDesc;
              }
            }
          }
          
          // Check if description is in title field (common AI mistake)
          if (finalTitle === finalDescription && finalDescription.length > 100) {
            console.error(`   ❌ ERROR: autoTitle and autoDescription are identical!`);
            console.error(`   ❌ This means the AI returned the same value for both fields`);
            console.error(`   ❌ Value: "${finalTitle.substring(0, 100)}..."`);
          }
          
          // Ensure title is not empty
          if (!finalTitle || finalTitle.trim() === "") {
            console.error(`   ❌ ERROR: autoTitle is empty!`);
            finalTitle = existingCard.normalized.title || "Untitled Card";
          }
          
          existingCard.autoTitle = finalTitle;
          existingCard.autoDescription = finalDescription;
          existingCard.updatedAt = new Date().toISOString();
          cardsStore.set(cardId, existingCard);
          
          // VERIFY what was actually saved
          const savedCard = cardsStore.get(cardId);
          console.log(`   📝 Card ${cardId} updated with title/description`);
          console.log(`   📝 Final autoTitle: "${finalTitle}" (${finalTitle.length} chars)`);
          console.log(`   📝 Final autoDescription: "${finalDescription.substring(0, 80)}..." (${finalDescription.length} chars)`);
          console.log(`   ✅ VERIFICATION - Saved card record:`);
          console.log(`      savedCard.autoTitle: "${savedCard?.autoTitle}" (${savedCard?.autoTitle?.length || 0} chars)`);
          console.log(`      savedCard.autoDescription: "${savedCard?.autoDescription?.substring(0, 80) || ""}..." (${savedCard?.autoDescription?.length || 0} chars)`);
          
          // CRITICAL: Verify fields are not swapped
          if (savedCard) {
            if (savedCard.autoTitle && savedCard.autoDescription) {
              if (savedCard.autoTitle.length > savedCard.autoDescription.length + 50) {
                console.error(`   ❌ CRITICAL: Saved autoTitle (${savedCard.autoTitle.length} chars) is much longer than autoDescription (${savedCard.autoDescription.length} chars)!`);
                console.error(`   ❌ This suggests fields may be swapped in the saved record!`);
              }
              if (savedCard.autoTitle === savedCard.autoDescription) {
                console.error(`   ❌ CRITICAL: Saved autoTitle and autoDescription are identical!`);
              }
            }
          }
          
          // Validate that description is not empty
          if (!finalDescription || finalDescription.trim() === "") {
            console.warn(`   ⚠️  WARNING: autoDescription is empty for card ${cardId}`);
            console.warn(`   ⚠️  Full result:`, JSON.stringify(result, null, 2));
          }
        } else {
          console.error(`   ❌ Card ${cardId} not found in store - cannot update title/description`);
        }
      })
      .catch((titleError: any) => {
        console.error("❌ Title/Description generation failed (background):", titleError);
        // Non-blocking error - card is already created, just log it
        console.warn("⚠️  Title generation failed, but card processing completed");
      });
    
    // Don't wait for title generation - return immediately
    console.log("   ⚡ Title generation started in background, returning response immediately");
    
    const totalEndTime = performance.now();
    timings.total = Math.round((totalEndTime - totalStartTime) / 100) / 10;
    
    console.log(`✅ Card processing completed successfully! Card ID: ${cardId}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⏱️  Processing Timings:");
    console.log(`   OCR: ${timings.ocr}s`);
    console.log(`   AI Normalization: ${timings.normalization}s`);
    console.log(`   Title Generation: Running in background (non-blocking)`);
    console.log(`   Total (blocking): ${timings.total}s`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    res.json({ cardId, card, timings });
  } catch (error) {
    console.error("\n❌ Processing error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`   Error details: ${errorMessage}`);
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    // Return more details even in production for debugging
    res.status(500).json({
      error: "Processing failed",
      message: errorMessage,
      step: errorMessage.includes("OCR") ? "ocr" : errorMessage.includes("Normalization") ? "normalization" : errorMessage.includes("Title") ? "title_generation" : "unknown",
      details: error instanceof Error ? error.stack : undefined,
    });
  }
});

export { router as processRouter };

