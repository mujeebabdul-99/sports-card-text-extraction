import { Router, Request, Response } from "express";
import { cardsStore } from "../models/cardStore";
import { stringify } from "csv-stringify/sync";
import { google } from "googleapis";
import { config } from "../config";
import path from "path";
import fs from "fs";

const router: Router = Router();

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
    
    // CRITICAL: Verify card record structure before export
    console.log(`🔍 VERIFICATION - Card ${cardId} record check:`);
    console.log(`   card.autoTitle exists: ${!!card.autoTitle}`);
    console.log(`   card.autoTitle type: ${typeof card.autoTitle}`);
    console.log(`   card.autoTitle value: "${card.autoTitle}"`);
    console.log(`   card.autoDescription exists: ${!!card.autoDescription}`);
    console.log(`   card.autoDescription type: ${typeof card.autoDescription}`);
    console.log(`   card.autoDescription value: "${card.autoDescription?.substring(0, 100) || ""}..."`);
    
    // Safety check: If autoTitle looks like description, swap them
    if (card.autoTitle && card.autoDescription) {
      if (card.autoTitle.length > 200 && card.autoDescription.length < 100) {
        console.error(`❌ CRITICAL: autoTitle (${card.autoTitle.length} chars) is longer than autoDescription (${card.autoDescription.length} chars)!`);
        console.error(`   This suggests fields are swapped in the card record.`);
        console.error(`   Swapping fields before export...`);
        const temp = card.autoTitle;
        card.autoTitle = card.autoDescription;
        card.autoDescription = temp;
        cardsStore.set(cardId, card);
        console.log(`   ✅ Fields swapped and saved.`);
      }
    }

    // Prepare CSV data
    // Use autoTitle for Title field if available (since Listing Title shows autoTitle)
    // Add detailed logging to debug the issue
    console.log(`📊 CSV Export - Card ${cardId} data:`);
    console.log(`   autoTitle (${card.autoTitle?.length || 0} chars): "${card.autoTitle?.substring(0, 80) || "EMPTY"}..."`);
    console.log(`   autoDescription (${card.autoDescription?.length || 0} chars): "${card.autoDescription?.substring(0, 80) || "EMPTY"}..."`);
    
    // Safety check: Ensure autoTitle is not actually the description
    let listingTitle = card.autoTitle && card.autoTitle.trim() !== "" 
      ? card.autoTitle 
      : card.normalized.title;
    
    // Validate and fix if title contains description
    if (listingTitle && card.autoDescription) {
      // Check if title is too long (likely contains description)
      if (listingTitle.length > 150 && listingTitle.includes(card.autoDescription.substring(0, 50))) {
        console.warn(`⚠️  WARNING: listingTitle appears to contain description!`);
        console.warn(`   Attempting to extract actual title...`);
        
        // Try to extract title from the beginning (title should be shorter)
        const titleMatch = listingTitle.match(/^(.{0,150}?)(?:\s*,\s*[A-Z][a-z]+\s+[A-Z][a-z]+)/);
        if (titleMatch && titleMatch[1]) {
          listingTitle = titleMatch[1].trim();
          console.log(`   🔧 Extracted title: "${listingTitle.substring(0, 80)}..."`);
        } else {
          // Fallback: use first 100 chars as title
          listingTitle = listingTitle.substring(0, 100).trim();
          console.warn(`   ⚠️  Using truncated title: "${listingTitle}..."`);
        }
      }
      
      // Check if title and description are swapped
      if (listingTitle === card.autoDescription) {
        console.error(`❌ ERROR: listingTitle matches autoDescription! Fields are swapped.`);
        console.error(`   Using normalized title as fallback.`);
        listingTitle = card.normalized.title || "Untitled";
      }
    }
    
    console.log(`   Using listingTitle (${listingTitle?.length || 0} chars): "${listingTitle?.substring(0, 80) || "EMPTY"}..."`);
    
    // Log if autoDescription is missing for debugging
    if (!card.autoDescription || card.autoDescription.trim() === "") {
      console.warn(`⚠️  Export: autoDescription is empty for card ${cardId}`);
      console.warn(`   autoTitle: "${card.autoTitle}"`);
    }
    
    const csvData = [
      {
        Year: card.normalized.year,
        Set: card.normalized.set,
        "Card Number": card.normalized.cardNumber,
        "Listing Title": listingTitle,
        "Player First Name": card.normalized.playerFirstName,
        "Player Last Name": card.normalized.playerLastName,
        "Grading Company": card.normalized.gradingCompany,
        Grade: card.normalized.grade,
        Cert: card.normalized.cert,
        "Listing Caption": card.normalized.caption,
        "Auto Description": card.autoDescription || "", // Ensure it's never undefined
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
    
    // CRITICAL: Verify card record structure before export
    console.log(`🔍 VERIFICATION - Card ${cardId} record check:`);
    console.log(`   card.autoTitle exists: ${!!card.autoTitle}`);
    console.log(`   card.autoTitle type: ${typeof card.autoTitle}`);
    console.log(`   card.autoTitle value: "${card.autoTitle}"`);
    console.log(`   card.autoDescription exists: ${!!card.autoDescription}`);
    console.log(`   card.autoDescription type: ${typeof card.autoDescription}`);
    console.log(`   card.autoDescription value: "${card.autoDescription?.substring(0, 100) || ""}..."`);
    
    // Safety check: If autoTitle looks like description, swap them
    if (card.autoTitle && card.autoDescription) {
      if (card.autoTitle.length > 200 && card.autoDescription.length < 100) {
        console.error(`❌ CRITICAL: autoTitle (${card.autoTitle.length} chars) is longer than autoDescription (${card.autoDescription.length} chars)!`);
        console.error(`   This suggests fields are swapped in the card record.`);
        console.error(`   Swapping fields before export...`);
        const temp = card.autoTitle;
        card.autoTitle = card.autoDescription;
        card.autoDescription = temp;
        cardsStore.set(cardId, card);
        console.log(`   ✅ Fields swapped and saved.`);
      }
    }

    const spreadsheetId = config.google.sheets.spreadsheetId || req.body.spreadsheetId;
    const sheetName = config.google.sheets.sheetName || req.body.sheetName || "Cards";

    if (!spreadsheetId) {
      return res.status(400).json({ 
        error: "Google Sheets Spreadsheet ID is required. Set GOOGLE_SHEETS_SPREADSHEET_ID in .env or provide spreadsheetId in request." 
      });
    }

    // Initialize Google Sheets API
    // Using any type to avoid TypeScript namespace issues during build
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let googleAuth: any;
    
    // Priority 1: Use JSON credentials from environment variable
    if (config.google.sheets.serviceAccountKeyJson) {
      googleAuth = new google.auth.GoogleAuth({
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
        if (config.nodeEnv === "production") {
          return res.status(500).json({ 
            error: "Google Sheets service account credentials not found. In production, you must set GOOGLE_SHEETS_CREDENTIALS_JSON environment variable. Copy the entire contents of your service account JSON file and set it as an environment variable." 
          });
        }
        return res.status(500).json({ 
          error: "Google Sheets service account credentials not found. Check GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY or GOOGLE_SHEETS_CREDENTIALS_JSON in .env" 
        });
      }

      googleAuth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });
    }

    const sheets = google.sheets({ version: "v4", auth: googleAuth });

    // Prepare data row
    // Use autoTitle for Listing Title if available (since Listing Title shows autoTitle)
    // Add detailed logging to debug the issue
    console.log(`📊 Sheets Export - Card ${cardId} data:`);
    console.log(`   autoTitle (${card.autoTitle?.length || 0} chars): "${card.autoTitle?.substring(0, 80) || "EMPTY"}..."`);
    console.log(`   autoDescription (${card.autoDescription?.length || 0} chars): "${card.autoDescription?.substring(0, 80) || "EMPTY"}..."`);
    
    // Safety check: Ensure autoTitle is not actually the description
    // If autoTitle is very long (>150 chars) and matches autoDescription, it's likely swapped
    let listingTitle = card.autoTitle && card.autoTitle.trim() !== "" 
      ? card.autoTitle 
      : card.normalized.title;
    
    // Validate and fix if title contains description
    if (listingTitle && card.autoDescription) {
      // Check if title is too long (likely contains description)
      if (listingTitle.length > 150 && listingTitle.includes(card.autoDescription.substring(0, 50))) {
        console.warn(`⚠️  WARNING: listingTitle appears to contain description!`);
        console.warn(`   Attempting to extract actual title...`);
        
        // Try to extract title from the beginning (title should be shorter)
        // Title format: [year] [brand] [player] [special] [card#] [grading] [grade]
        // Should be < 150 characters typically
        const titleMatch = listingTitle.match(/^(.{0,150}?)(?:\s*,\s*[A-Z][a-z]+\s+[A-Z][a-z]+)/);
        if (titleMatch && titleMatch[1]) {
          listingTitle = titleMatch[1].trim();
          console.log(`   🔧 Extracted title: "${listingTitle.substring(0, 80)}..."`);
        } else {
          // Fallback: use first 100 chars as title
          listingTitle = listingTitle.substring(0, 100).trim();
          console.warn(`   ⚠️  Using truncated title: "${listingTitle}..."`);
        }
      }
      
      // Check if title and description are swapped
      if (listingTitle === card.autoDescription) {
        console.error(`❌ ERROR: listingTitle matches autoDescription! Fields are swapped.`);
        console.error(`   Using normalized title as fallback.`);
        listingTitle = card.normalized.title || "Untitled";
      }
    }
    
    console.log(`   Using listingTitle (${listingTitle?.length || 0} chars): "${listingTitle?.substring(0, 80) || "EMPTY"}..."`);
    
    // Log if autoDescription is missing for debugging
    if (!card.autoDescription || card.autoDescription.trim() === "") {
      console.warn(`⚠️  Sheets Export: autoDescription is empty for card ${cardId}`);
      console.warn(`   autoTitle: "${card.autoTitle}"`);
    }
    
    // FINAL SAFETY CHECK: Ensure listingTitle is NOT the description
    if (listingTitle && card.autoDescription) {
      // If listingTitle matches or contains the description, something is wrong
      if (listingTitle === card.autoDescription || 
          (listingTitle.length > 200 && listingTitle.includes(card.autoDescription.substring(0, 50)))) {
        console.error(`❌ CRITICAL ERROR: listingTitle contains description!`);
        console.error(`   listingTitle: "${listingTitle.substring(0, 100)}..."`);
        console.error(`   autoDescription: "${card.autoDescription.substring(0, 100)}..."`);
        console.error(`   Using normalized.title as fallback`);
        listingTitle = card.normalized.title || "Untitled Card";
      }
    }
    
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

    // Get current data to find next row and check headers
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
    });

    const nextRow = (existingData.data.values?.length || 0) + 1;

    // Verify headers if they exist and update if needed
    // Initialize with default values first
    let needsHeaderUpdate = false;
    let autoDescriptionColumnIndex = 10; // Default to K (index 10) for new format
    
    if (existingData.data.values && existingData.data.values.length > 0) {
      const existingHeaders = existingData.data.values[0];
      const expectedHeaders = [
        "Year",
        "Set",
        "Card Number",
        "Listing Title",
        "Player First Name",
        "Player Last Name",
        "Grading Company",
        "Grade",
        "Cert",
        "Listing Caption",
        "Auto Description",
      ];
      
      console.log(`📋 Existing headers in sheet:`, existingHeaders);
      console.log(`📋 Expected headers:`, expectedHeaders);
      
      // Check if sheet has old format (12 columns with "Auto Title" in column K)
      if (existingHeaders.length === 12 && existingHeaders[11] === "Auto Description") {
        // Check if column K has "Auto Title" or duplicate "Auto Description"
        if (existingHeaders[10] === "Auto Title" || existingHeaders[10] === "Auto Description") {
          console.log(`   ℹ️  Sheet has 12-column format. Auto Title in column K, Auto Description in column L.`);
          autoDescriptionColumnIndex = 11; // Use column L (index 11) for Auto Description
          if (existingHeaders[10] === "Auto Description") {
            console.log(`   ⚠️  Column K has duplicate "Auto Description" header, will update to "Auto Title"`);
            needsHeaderUpdate = true;
          }
        } else {
          console.log(`   ℹ️  Sheet has 12 columns. Using column L (index 11) for Auto Description.`);
          autoDescriptionColumnIndex = 11;
          needsHeaderUpdate = true;
        }
      } else if (existingHeaders.length === 11 && existingHeaders[10] === "Auto Description") {
        console.log(`   ✅ Headers match expected format (11 columns).`);
        autoDescriptionColumnIndex = 10; // Use column K (index 10) for Auto Description
      } else {
        console.warn(`⚠️  WARNING: Headers don't match expected format!`);
        console.warn(`   Sheet has ${existingHeaders.length} columns`);
        console.warn(`   Column D (index 3): "${existingHeaders[3]}" (expected "Listing Title")`);
        if (existingHeaders.length > 10) {
          console.warn(`   Column K (index 10): "${existingHeaders[10]}"`);
        }
        if (existingHeaders.length > 11) {
          console.warn(`   Column L (index 11): "${existingHeaders[11]}" (expected "Auto Description")`);
          autoDescriptionColumnIndex = 11; // Use column L if it exists
        }
        needsHeaderUpdate = true;
      }
    }

    // Ensure all values are strings and not undefined/null
    const safeListingTitle = String(listingTitle || "");
    const safeAutoDescription = String(card.autoDescription || "");
    
    // Log exactly what we're writing to each column
    console.log(`📝 FINAL rowData values being written:`);
    console.log(`   [0] Year: "${card.normalized.year || ""}"`);
    console.log(`   [1] Set: "${card.normalized.set || ""}"`);
    console.log(`   [2] Card Number: "${card.normalized.cardNumber || ""}"`);
    console.log(`   [3] Listing Title: "${safeListingTitle}" (${safeListingTitle.length} chars)`);
    console.log(`   [4] Player First Name: "${card.normalized.playerFirstName || ""}"`);
    console.log(`   [5] Player Last Name: "${card.normalized.playerLastName || ""}"`);
    console.log(`   [6] Grading Company: "${card.normalized.gradingCompany || ""}"`);
    console.log(`   [7] Grade: "${card.normalized.grade || ""}"`);
    console.log(`   [8] Cert: "${card.normalized.cert || ""}"`);
    console.log(`   [9] Listing Caption: "${card.normalized.caption || ""}"`);
    console.log(`   [${autoDescriptionColumnIndex}] Auto Description: "${safeAutoDescription.substring(0, 80)}..." (${safeAutoDescription.length} chars)`);
    
    // CRITICAL: Build rowData array based on sheet format
    // If sheet has old format (12 columns), we need to add empty column for "Auto Title"
    let rowData: string[];
    
    if (autoDescriptionColumnIndex === 11) {
      // 12-column format: "Auto Title" in K and "Auto Description" in L
      const safeAutoTitle = String(card.autoTitle || safeListingTitle); // Use autoTitle if available, fallback to listingTitle
      rowData = [
        String(card.normalized.year || ""),
        String(card.normalized.set || ""),
        String(card.normalized.cardNumber || ""),
        safeListingTitle, // Listing Title - COLUMN D (index 3)
        String(card.normalized.playerFirstName || ""),
        String(card.normalized.playerLastName || ""),
        String(card.normalized.gradingCompany || ""),
        String(card.normalized.grade || ""),
        String(card.normalized.cert || ""),
        String(card.normalized.caption || ""), // Listing Caption
        safeAutoTitle, // Auto Title - COLUMN K (index 10)
        safeAutoDescription, // Auto Description - COLUMN L (index 11)
      ];
      console.log(`📝 Using 12-column format with Auto Title in column K`);
      console.log(`   Column K (Auto Title): "${safeAutoTitle.substring(0, 50)}..." (${safeAutoTitle.length} chars)`);
    } else {
      // New format: 11 columns (A-K)
      rowData = [
        String(card.normalized.year || ""),
        String(card.normalized.set || ""),
        String(card.normalized.cardNumber || ""),
        safeListingTitle, // Listing Title - COLUMN D (index 3)
        String(card.normalized.playerFirstName || ""),
        String(card.normalized.playerLastName || ""),
        String(card.normalized.gradingCompany || ""),
        String(card.normalized.grade || ""),
        String(card.normalized.cert || ""),
        String(card.normalized.caption || ""), // Listing Caption
        safeAutoDescription, // Auto Description - COLUMN K (index 10)
      ];
      console.log(`📝 Using 11-column format (new sheet structure)`);
    }
    
    // Validate rowData has correct number of elements
    const expectedLength = autoDescriptionColumnIndex === 11 ? 12 : 11;
    if (rowData.length !== expectedLength) {
      console.error(`❌ CRITICAL ERROR: rowData has ${rowData.length} elements, expected ${expectedLength}!`);
      throw new Error(`Row data array has incorrect length: ${rowData.length} instead of ${expectedLength}`);
    }
    
    // Validate that Listing Title (index 3) is NOT the description
    const autoDescIndex = autoDescriptionColumnIndex;
    if (rowData[3] && rowData[autoDescIndex] && rowData[3] === rowData[autoDescIndex]) {
      console.error(`❌ CRITICAL ERROR: Listing Title (index 3) equals Auto Description (index ${autoDescIndex})!`);
      console.error(`   Listing Title: "${rowData[3]}"`);
      console.error(`   Auto Description: "${rowData[autoDescIndex]}"`);
      throw new Error("Listing Title and Auto Description cannot be identical");
    }
    
    // Validate that Listing Title is the short title, not the long description
    if (rowData[3] && rowData[autoDescIndex] && rowData[3].length > rowData[autoDescIndex].length) {
      console.error(`❌ CRITICAL ERROR: Listing Title (${rowData[3].length} chars) is longer than Auto Description (${rowData[autoDescIndex].length} chars)!`);
      console.error(`   This suggests the fields are swapped!`);
      throw new Error("Listing Title is longer than Auto Description - fields may be swapped");
    }
    
    console.log(`✅ rowData validation passed: ${rowData.length} columns, Listing Title=${rowData[3].length} chars, Auto Description=${rowData[autoDescIndex].length} chars`);
    console.log(`   Auto Description will be written to column ${String.fromCharCode(65 + autoDescIndex)} (index ${autoDescIndex})`);

    // Add or update header row if needed
    if (nextRow === 1 || needsHeaderUpdate) {
      // Build headers array based on format
      let headers: string[];
      if (autoDescriptionColumnIndex === 11) {
        // 12-column format: include "Auto Title" in column K
        headers = [
          "Year",
          "Set",
          "Card Number",
          "Listing Title",
          "Player First Name",
          "Player Last Name",
          "Grading Company",
          "Grade",
          "Cert",
          "Listing Caption",
          "Auto Title", // Column K (index 10)
          "Auto Description", // Column L (index 11)
        ];
      } else {
        // 11-column format: only "Auto Description" in column K
        headers = [
          "Year",
          "Set",
          "Card Number",
          "Listing Title",
          "Player First Name",
          "Player Last Name",
          "Grading Company",
          "Grade",
          "Cert",
          "Listing Caption",
          "Auto Description",
        ];
      }
      
      // Determine range based on format
      const headerRange = autoDescriptionColumnIndex === 11 
        ? `${sheetName}!A1:L1` // 12 columns for old format
        : `${sheetName}!A1:K1`; // 11 columns for new format
      
      console.log(`📝 ${nextRow === 1 ? 'Creating' : 'Updating'} header row with range: ${headerRange}`);
      console.log(`   Headers: ${headers.join(", ")}`);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: headerRange,
        valueInputOption: "RAW",
        requestBody: {
          values: [headers],
        },
      });
      console.log(`✅ Headers ${nextRow === 1 ? 'created' : 'updated'} successfully`);
    }

    // Append data row using update instead of append for precise column control
    // Using update ensures exact column alignment
    const endColumn = autoDescriptionColumnIndex === 11 ? 'L' : 'K';
    const range = `${sheetName}!A${nextRow}:${endColumn}${nextRow}`;
    
    console.log(`📝 Writing row ${nextRow} to Google Sheets with ${rowData.length} columns`);
    console.log(`   Range: ${range}`);
    console.log(`   Column D (Listing Title): "${rowData[3]?.substring(0, 50) || ""}..."`);
    console.log(`   Column ${endColumn} (Auto Description, index ${autoDescriptionColumnIndex}): "${rowData[autoDescriptionColumnIndex]?.substring(0, 50) || ""}..."`);
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: range,
      valueInputOption: "RAW",
      requestBody: {
        values: [rowData],
      },
    });
    
    console.log(`✅ Successfully wrote row ${nextRow} to Google Sheets`);
    console.log(`   ✅ Listing Title written to column D: "${rowData[3]?.substring(0, 50) || ""}..."`);
    console.log(`   ✅ Auto Description written to column ${endColumn}: "${rowData[autoDescriptionColumnIndex]?.substring(0, 50) || ""}..."`);

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

