import dotenv from "dotenv";

dotenv.config();

// Helper to parse JSON from env var or return null
function parseJsonFromEnv(envVar: string | undefined): any | null {
  if (!envVar) return null;
  try {
    // Replace escaped newlines with actual newlines
    const unescaped = envVar.replace(/\\n/g, '\n');
    return JSON.parse(unescaped);
  } catch {
    return null;
  }
}

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3001",

  google: {
    projectId: process.env.GOOGLE_PROJECT_ID || "project-fast-pitch",
    // Support both file path and JSON string from env
    visionCredentials: process.env.GOOGLE_VISION_CREDENTIALS || "./credentials/google-vision-credentials.json",
    visionCredentialsJson: parseJsonFromEnv(process.env.GOOGLE_VISION_CREDENTIALS_JSON),
    geminiCredentials: process.env.GOOGLE_GEMINI_CREDENTIALS || "./credentials/google-gemini-credentials.json",
    geminiCredentialsJson: parseJsonFromEnv(process.env.GOOGLE_GEMINI_CREDENTIALS_JSON),
    sheets: {
      serviceAccountKey: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY || "./credentials/google-sheets-credentials.json",
      serviceAccountKeyJson: parseJsonFromEnv(process.env.GOOGLE_SHEETS_CREDENTIALS_JSON),
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "",
      sheetName: process.env.GOOGLE_SHEETS_SHEET_NAME || "Cards",
    },
  },

  upload: {
    dir: process.env.UPLOAD_DIR || "./uploads",
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || "10485760", 10), // 10MB
  },
};

