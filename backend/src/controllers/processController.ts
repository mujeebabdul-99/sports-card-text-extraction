import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { config } from "../config";
import { extractTextFromImage } from "../services/ocrService";
import { normalizeCardText, generateTitleAndDescription } from "../services/aiService";
import { randomUUID } from "crypto";
import { CardRecord } from "../types";
import { cardsStore } from "../models/cardStore";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
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
    const ocrResult = await extractTextFromImage(imagePath);
    console.log(`   Extracted ${ocrResult.rawOcrText.length} characters`);

    // Step 2: Normalize
    console.log("\n--- Step 2: AI Normalization ---");
    const normalizeResult = await normalizeCardText(ocrResult.rawOcrText);
    console.log("   Normalization completed");

    // Step 3: Generate title and description
    console.log("\n--- Step 3: Generate Title/Description ---");
    const titleDescResult = await generateTitleAndDescription(normalizeResult.normalized);
    console.log("   Title/Description generated");

    // Step 4: Create card record
    console.log("\n--- Step 4: Creating Card Record ---");
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
      autoTitle: titleDescResult.autoTitle,
      autoDescription: titleDescResult.autoDescription,
      processingStatus: "ready_for_review",
      errors: [],
      createdAt: now,
      updatedAt: now,
    };

    cardsStore.set(cardId, card);
    console.log(`✅ Card processing completed successfully! Card ID: ${cardId}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    res.json({ cardId, card });
  } catch (error) {
    console.error("\n❌ Processing error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`   Error details: ${errorMessage}`);
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    res.status(500).json({
      error: "Processing failed",
      message: errorMessage,
      details: config.nodeEnv === "development" ? (error instanceof Error ? error.stack : undefined) : undefined,
    });
  }
});

export { router as processRouter };

