import { Router, Request, Response } from "express";
import { cardsStore } from "../models/cardStore";
import { stringify } from "csv-stringify/sync";
import { google } from "googleapis";
import { config } from "../config";
import path from "path";
import fs from "fs";

const router = Router();

router.post("/csv", (req: Request, res: Response) => {
  try {
    const { cardId } = req.body;

    if (!cardId) {
      return res.status(400).json({ error: "Card ID is required" });
    }

    const card = cardsStore.get(cardId);
    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    // Prepare CSV data
    const csvData = [
      {
        Year: card.normalized.year,
        Set: card.normalized.set,
        "Card Number": card.normalized.cardNumber,
        Title: card.normalized.title,
        "Player First Name": card.normalized.playerFirstName,
        "Player Last Name": card.normalized.playerLastName,
        "Grading Company": card.normalized.gradingCompany,
        Grade: card.normalized.grade,
        Cert: card.normalized.cert,
        Caption: card.normalized.caption,
        "Auto Title": card.autoTitle,
        "Auto Description": card.autoDescription,
      },
    ];

    const csv = stringify(csvData, { header: true });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="card-${cardId}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("CSV export error:", error);
    res.status(500).json({ error: "CSV export failed" });
  }
});

router.post("/sheets", async (req: Request, res: Response) => {
  try {
    const { cardId } = req.body;

    if (!cardId) {
      return res.status(400).json({ error: "Card ID is required" });
    }

    const card = cardsStore.get(cardId);
    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    const spreadsheetId = config.google.sheets.spreadsheetId || req.body.spreadsheetId;
    const sheetName = config.google.sheets.sheetName || req.body.sheetName || "Cards";

    if (!spreadsheetId) {
      return res.status(400).json({ 
        error: "Google Sheets Spreadsheet ID is required. Set GOOGLE_SHEETS_SPREADSHEET_ID in .env or provide spreadsheetId in request." 
      });
    }

    // Initialize Google Sheets API
    let auth: google.auth.GoogleAuth;
    
    // Priority 1: Use JSON credentials from environment variable
    if (config.google.sheets.serviceAccountKeyJson) {
      auth = new google.auth.GoogleAuth({
        credentials: config.google.sheets.serviceAccountKeyJson,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
    } else {
      // Priority 2: Use file path
      const credentialsPath = config.google.sheets.serviceAccountKey
        ? (path.isAbsolute(config.google.sheets.serviceAccountKey)
            ? config.google.sheets.serviceAccountKey
            : path.join(__dirname, "../../", config.google.sheets.serviceAccountKey))
        : null;

      if (!credentialsPath || !fs.existsSync(credentialsPath)) {
        return res.status(500).json({ 
          error: "Google Sheets service account credentials not found. Check GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY or GOOGLE_SHEETS_CREDENTIALS_JSON in .env" 
        });
      }

      auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
    }

    const sheets = google.sheets({ version: "v4", auth });

    // Prepare data row
    const rowData = [
      card.normalized.year,
      card.normalized.set,
      card.normalized.cardNumber,
      card.normalized.title,
      card.normalized.playerFirstName,
      card.normalized.playerLastName,
      card.normalized.gradingCompany,
      card.normalized.grade,
      card.normalized.cert,
      card.normalized.caption,
      card.autoTitle,
      card.autoDescription,
    ];

    // Check if sheet exists, create if not
    try {
      await sheets.spreadsheets.get({ spreadsheetId });
    } catch (error) {
      return res.status(404).json({ error: `Spreadsheet not found. Please check the spreadsheet ID: ${spreadsheetId}` });
    }

    // Get existing sheets
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = spreadsheet.data.sheets?.some(
      (sheet) => sheet.properties?.title === sheetName
    );

    // Create sheet if it doesn't exist
    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });
    }

    // Get current data to find next row
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
    });

    const nextRow = (existingData.data.values?.length || 0) + 1;

    // Add header row if this is the first data row
    if (nextRow === 1) {
      const headers = [
        "Year",
        "Set",
        "Card Number",
        "Title",
        "Player First Name",
        "Player Last Name",
        "Grading Company",
        "Grade",
        "Cert",
        "Caption",
        "Auto Title",
        "Auto Description",
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:L1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [headers],
        },
      });
    }

    // Append data row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A${nextRow}:L${nextRow}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [rowData],
      },
    });

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    res.json({
      message: "Data exported to Google Sheets successfully",
      spreadsheetId,
      sheetName,
      sheetUrl,
      row: nextRow,
    });
  } catch (error) {
    console.error("Sheets export error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ 
      error: "Google Sheets export failed",
      details: config.nodeEnv === "development" ? errorMessage : undefined,
    });
  }
});

export { router as exportRouter };

