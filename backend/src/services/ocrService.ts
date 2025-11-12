import { ImageAnnotatorClient } from "@google-cloud/vision";
import { config } from "../config";
import { OCRResponse, OCRBlock } from "../types";
import path from "path";
import fs from "fs";

let client: ImageAnnotatorClient | null = null;

function getVisionClient(): ImageAnnotatorClient {
  if (!client) {
    console.log("🔍 Initializing Google Vision API client...");
    console.log(`   Project ID: ${config.google.projectId || "NOT SET"}`);
    
    try {
      // Priority 1: Use JSON credentials from environment variable
      if (config.google.visionCredentialsJson) {
        console.log(`   Credentials: Using JSON from environment variable`);
        client = new ImageAnnotatorClient({
          credentials: config.google.visionCredentialsJson,
          projectId: config.google.projectId,
        });
      } else {
        // Priority 2: Use file path
        const credentialsPath = config.google.visionCredentials
          ? (path.isAbsolute(config.google.visionCredentials)
              ? config.google.visionCredentials
              : path.join(__dirname, "../../", config.google.visionCredentials))
          : null;
        
        console.log(`   Credentials: ${credentialsPath || "Using default credentials"}`);
        
        if (credentialsPath && fs.existsSync(credentialsPath)) {
          client = new ImageAnnotatorClient({
            keyFilename: credentialsPath,
            projectId: config.google.projectId,
          });
        } else {
          // Fallback: try to use default credentials
          client = new ImageAnnotatorClient({
            projectId: config.google.projectId,
          });
        }
      }
      console.log("✅ Google Vision API client initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize Google Vision API client:", error);
      throw error;
    }
  }
  return client;
}

export async function checkVisionConnection(): Promise<boolean> {
  try {
    const visionClient = getVisionClient();
    // Try a simple operation to verify connection
    console.log("🔍 Testing Google Vision API connection...");
    // We can't test without an image, so just verify client is initialized
    if (visionClient) {
      console.log("✅ Google Vision API: Connected");
      return true;
    }
    return false;
  } catch (error) {
    console.error("❌ Google Vision API: Connection failed", error);
    return false;
  }
}

export async function extractTextFromImage(imagePath: string): Promise<OCRResponse> {
  try {
    console.log("📸 Starting OCR extraction...");
    console.log(`   Image path: ${imagePath}`);
    
    const visionClient = getVisionClient();
    const fullPath = path.isAbsolute(imagePath) ? imagePath : path.join(__dirname, "../../", imagePath);
    
    console.log(`   Full path: ${fullPath}`);
    
    // Verify file exists and is readable
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Image file does not exist: ${fullPath}`);
    }
    
    try {
      fs.accessSync(fullPath, fs.constants.R_OK);
      console.log("   File is readable");
    } catch (accessError) {
      throw new Error(`Image file is not readable: ${fullPath}`);
    }
    
    const stats = fs.statSync(fullPath);
    console.log(`   File size: ${stats.size} bytes`);
    console.log("   Calling Google Vision API...");

    const [result] = await visionClient.textDetection(fullPath);
    console.log("✅ OCR extraction completed");
    const detections = result.textAnnotations || [];

    if (detections.length === 0) {
      return {
        rawOcrText: "",
        ocrBlocks: [],
      };
    }

    // First detection is the entire text
    const fullText = detections[0].description || "";
    
    // Rest are individual text blocks
    const ocrBlocks: OCRBlock[] = detections.slice(1).map((detection) => {
      const vertices = detection.boundingPoly?.vertices || [];
      const bbox: [number, number, number, number] = [
        vertices[0]?.x || 0,
        vertices[0]?.y || 0,
        vertices[2]?.x || 0,
        vertices[2]?.y || 0,
      ];

      return {
        text: detection.description || "",
        confidence: 1.0, // Google Vision doesn't provide confidence per block, so we use 1.0
        bbox,
      };
    });

    return {
      rawOcrText: fullText,
      ocrBlocks,
    };
  } catch (error) {
    console.error("❌ OCR Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`   Error details: ${errorMessage}`);
    throw new Error(`OCR processing failed: ${errorMessage}`);
  }
}

