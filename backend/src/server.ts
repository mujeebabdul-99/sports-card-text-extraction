import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { config } from "./config";
import { imageRouter } from "./controllers/imageController";
import { cardRouter } from "./controllers/cardController";
import { ocrRouter } from "./controllers/ocrController";
import { normalizeRouter } from "./controllers/normalizeController";
import { exportRouter } from "./controllers/exportController";
import { processRouter } from "./controllers/processController";

const app: express.Application = express();

// Ensure uploads directory exists
const uploadsDir = config.upload.dir;
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`📁 Created uploads directory: ${uploadsDir}`);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
const staticUploadsPath = path.isAbsolute(config.upload.dir)
  ? config.upload.dir
  : path.join(__dirname, "../uploads");
app.use("/uploads", express.static(staticUploadsPath));

// Routes
app.use("/api/images", imageRouter);
app.use("/api/cards", cardRouter);
app.use("/api/ocr", ocrRouter);
app.use("/api/normalize", normalizeRouter);
app.use("/api/export", exportRouter);
app.use("/api/process", processRouter);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API connection check
app.get("/api/health", async (req, res) => {
  const { checkVisionConnection } = await import("./services/ocrService");
  const { checkGeminiConnection } = await import("./services/aiService");
  
  const visionStatus = await checkVisionConnection();
  const geminiStatus = await checkGeminiConnection();
  
  res.json({
    status: visionStatus && geminiStatus ? "healthy" : "degraded",
    services: {
      googleVision: visionStatus ? "connected" : "disconnected",
      gemini: geminiStatus ? "connected" : "disconnected",
    },
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: config.nodeEnv === "development" ? err.message : "Something went wrong",
  });
});

const PORT = config.port;

app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${config.nodeEnv}`);
  console.log(`📁 Upload directory: ${uploadsDir}`);
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 Checking API connections...\n");
  
  // Check API connections on startup
  try {
    const { checkVisionConnection } = await import("./services/ocrService");
    const { checkGeminiConnection } = await import("./services/aiService");
    
    await checkVisionConnection();
    await checkGeminiConnection();
    
    console.log("\n✅ All API connections verified!");
  } catch (error) {
    console.error("\n⚠️  Some API connections failed. Please check your configuration.");
  }
  
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
});

export default app;

