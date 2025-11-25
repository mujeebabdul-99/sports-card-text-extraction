"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, AlertCircle, Download, FileSpreadsheet } from "lucide-react";
import { getExportPreference, saveExportPreference, type ExportType } from "@/lib/exportPreferences";
import api, { getCard } from "@/lib/api";
import ExportSuccessModal from "@/components/ExportSuccessModal";

// Confidence threshold for low confidence warning
const LOW_CONFIDENCE_THRESHOLD = 0.7;

// Field label mapping
const fieldLabels: Record<string, string> = {
  year: "Year",
  set: "Set",
  cardNumber: "Card Number",
  title: "Listing Title",
  playerFirstName: "Player First Name",
  playerLastName: "Player Last Name",
  gradingCompany: "Grading Company",
  grade: "Grade",
  cert: "Cert",
  caption: "Listing Caption",
};

export default function ReviewPage() {
  const router = useRouter();
  const [fields, setFields] = useState({
    year: "",
    set: "",
    cardNumber: "",
    title: "",
    playerFirstName: "",
    playerLastName: "",
    gradingCompany: "",
    grade: "",
    cert: "",
    caption: "",
  });
  const [autoTitle, setAutoTitle] = useState<string>("");
  const [confidenceByField, setConfidenceByField] = useState<Record<string, number>>({});
  const [savedPreference, setSavedPreference] = useState<ExportType | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const hasAutoTitleRef = useRef(false);

  // Load card data and poll for autoTitle updates
  useEffect(() => {
    const loadCardData = () => {
      const cardDataStr = sessionStorage.getItem("cardData");
      if (cardDataStr) {
        try {
          const cardData = JSON.parse(cardDataStr);
          if (cardData.normalized) {
            const normalizedFields = { ...cardData.normalized };
            
            // Use autoTitle for Listing Title if available, otherwise use normalized title
            if (cardData.autoTitle && cardData.autoTitle.trim() !== "") {
              console.log("   ✅ Loading autoTitle into Listing Title field:", cardData.autoTitle);
              normalizedFields.title = cardData.autoTitle;
              setAutoTitle(cardData.autoTitle);
              hasAutoTitleRef.current = true;
            } else {
              console.log("   ⚠️  autoTitle not available yet, using normalized title:", normalizedFields.title);
            }
            
            setFields(normalizedFields);
          }
          
          // Load confidence scores
          if (cardData.confidenceByField) {
            setConfidenceByField(cardData.confidenceByField);
          }
          
          // Load autoTitle separately to track updates
          if (cardData.autoTitle && cardData.autoTitle.trim() !== "") {
            setAutoTitle(cardData.autoTitle);
            hasAutoTitleRef.current = true;
          }
        } catch (error) {
          console.error("Error parsing card data:", error);
        }
      } else {
        // No card data, redirect to upload
        router.push("/upload");
      }
    };

    loadCardData();
    
    // Poll for autoTitle updates (since it's generated in background)
    // Check every 2 seconds for up to 30 seconds
    let pollCount = 0;
    const maxPolls = 15; // 15 * 2s = 30 seconds max
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      
      // Stop polling after max attempts or if we already have autoTitle
      if (pollCount >= maxPolls || hasAutoTitleRef.current) {
        clearInterval(pollInterval);
        return;
      }
      
      // Try to fetch updated card data from backend
      const cardId = sessionStorage.getItem("currentCardId");
      if (cardId) {
        try {
          const card = await getCard(cardId);
          // Check if we have new data (autoTitle or autoDescription)
          const hasNewTitle = card.autoTitle && card.autoTitle.trim() !== "";
          const hasNewDescription = card.autoDescription && card.autoDescription.trim() !== "";
          
          if (hasNewTitle) {
            setAutoTitle(card.autoTitle);
            hasAutoTitleRef.current = true;
            
            // Always update title field with autoTitle (it's the generated title)
            setFields((prev) => {
              // Only preserve if user has significantly edited it (more than just the normalized title)
              const cardDataStr = sessionStorage.getItem("cardData");
              let shouldUpdate = true;
              
              if (cardDataStr) {
                try {
                  const cardData = JSON.parse(cardDataStr);
                  const normalizedTitle = cardData.normalized?.title || "";
                  const currentTitle = prev.title;
                  
                  // If current title is significantly different from both normalized and autoTitle, user might have edited it
                  // But since autoTitle is the "correct" generated title, we should update it
                  // Only skip if it's clearly a user edit (very different and not empty)
                  if (currentTitle && 
                      currentTitle !== normalizedTitle && 
                      currentTitle !== card.autoTitle &&
                      currentTitle.length > 50) {
                    // Might be a user edit, but still update with autoTitle as it's the generated one
                    console.log("   ℹ️  Updating title field with autoTitle:", card.autoTitle);
                  }
                } catch (e) {
                  // Ignore parsing errors
                }
              }
              
              console.log("   ✅ Updating Listing Title field with autoTitle:", card.autoTitle);
              return {
                ...prev,
                title: card.autoTitle, // Always use autoTitle when available
              };
            });
          }
          
          // Update sessionStorage with both autoTitle and autoDescription
          const cardDataStr = sessionStorage.getItem("cardData");
          if (cardDataStr) {
            const cardData = JSON.parse(cardDataStr);
            if (hasNewTitle) {
              cardData.autoTitle = card.autoTitle;
            }
            if (hasNewDescription) {
              cardData.autoDescription = card.autoDescription;
              console.log("   ✅ autoDescription updated:", card.autoDescription.substring(0, 50) + "...");
            } else {
              console.warn("   ⚠️  autoDescription is still empty");
            }
            sessionStorage.setItem("cardData", JSON.stringify(cardData));
          }
          
          // Stop polling once we have autoTitle
          if (hasNewTitle) {
            clearInterval(pollInterval);
          }
        } catch (error) {
          // Silently fail - card might not be ready yet
          console.debug("Polling for autoTitle:", error);
        }
      }
    }, 2000);
    
    // Load saved export preference
    setSavedPreference(getExportPreference());
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [router]);

  const handleFieldChange = (field: string, value: string) => {
    setFields((prev) => ({ ...prev, [field]: value }));
  };

  // Get confidence score for a field
  const getConfidenceScore = (field: string): number | null => {
    return confidenceByField[field] ?? null;
  };

  // Get confidence level for styling
  const getConfidenceLevel = (field: string): "high" | "medium" | "low" | null => {
    const confidence = getConfidenceScore(field);
    if (confidence === null) return null;
    if (confidence >= 0.9) return "high"; // Green
    if (confidence >= 0.7) return "medium"; // Yellow
    return "low"; // Red
  };

  // Check if field has low confidence
  const hasLowConfidence = (field: string): boolean => {
    const confidence = getConfidenceScore(field);
    return confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD;
  };

  // Get field label
  const getFieldLabel = (key: string): string => {
    return fieldLabels[key] || key.replace(/([A-Z])/g, " $1").trim();
  };

  // Get confidence badge styling
  const getConfidenceBadgeStyle = (level: "high" | "medium" | "low" | null) => {
    switch (level) {
      case "high":
        return "text-green-700 bg-green-50 border-green-200";
      case "medium":
        return "text-yellow-700 bg-yellow-50 border-yellow-200";
      case "low":
        return "text-red-700 bg-red-50 border-red-200";
      default:
        return "text-gray-500 bg-gray-50 border-gray-200";
    }
  };

  // Get input field styling based on confidence (only border, no background)
  const getInputFieldStyle = (level: "high" | "medium" | "low" | null) => {
    switch (level) {
      case "high":
        return "border-green-300 focus:ring-green-500";
      case "medium":
        return "border-yellow-300 focus:ring-yellow-500";
      case "low":
        return "border-red-300 focus:ring-red-500";
      default:
        return "border-gray-300";
    }
  };

  // Get confidence badge text
  const getConfidenceBadgeText = (level: "high" | "medium" | "low" | null, confidence: number | null) => {
    if (confidence === null) return "N/A";
    const percentage = Math.round(confidence * 100);
    switch (level) {
      case "high":
        return `${percentage}% ✓`;
      case "medium":
        return `${percentage}% ⚠`;
      case "low":
        return `${percentage}% ✗`;
      default:
        return `${percentage}%`;
    }
  };

  // Separate fields into regular and bottom fields
  const regularFields = Object.entries(fields).filter(([key]) => key !== "title" && key !== "caption");
  const bottomFields = Object.entries(fields).filter(([key]) => key === "title" || key === "caption");

  const handleQuickExport = async () => {
    if (!savedPreference) {
      // No preference saved, go to export page
      router.push("/export");
      return;
    }

    const cardId = sessionStorage.getItem("currentCardId");
    if (!cardId) {
      alert("No card data found. Please upload an image first.");
      router.push("/upload");
      return;
    }

    setIsExporting(true);
    try {
      if (savedPreference === "csv") {
        const response = await api.post(
          "/api/export/csv",
          { cardId },
          {
            responseType: "blob",
          }
        );

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `card-${cardId}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        setIsModalOpen(true);
        
        // Auto-redirect to upload page after 1.5 seconds
        setTimeout(() => {
          setIsModalOpen(false);
          router.push("/upload");
        }, 1500);
      } else {
        const response = await api.post("/api/export/sheets", { cardId });
        
        if (response.data.sheetUrl) {
          setIsModalOpen(true);
          sessionStorage.setItem("sheetUrl", response.data.sheetUrl);
          
          // Auto-redirect to upload page after 1.5 seconds
          setTimeout(() => {
            setIsModalOpen(false);
            router.push("/upload");
          }, 1500);
        } else {
          // Auto-redirect immediately if no sheet URL
          setTimeout(() => {
            router.push("/upload");
          }, 500);
        }
      }
    } catch (error: any) {
      console.error("Export error:", error);
      const errorMessage = error.response?.data?.error || "Failed to export. Please try again.";
      alert(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    const cardId = sessionStorage.getItem("currentCardId");
    if (!cardId) {
      alert("No card data found. Please upload an image first.");
      router.push("/upload");
      return;
    }

    setIsExporting(true);
    try {
      const response = await api.post(
        "/api/export/csv",
        { cardId },
        {
          responseType: "blob",
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `card-${cardId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      // Save preference
      saveExportPreference("csv");
      setSavedPreference("csv");
      setIsModalOpen(true);
      
      // Auto-redirect to upload page after 1.5 seconds
      setTimeout(() => {
        setIsModalOpen(false);
        router.push("/upload");
      }, 1500);
    } catch (error) {
      console.error("CSV export error:", error);
      alert("Failed to export CSV. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSheets = async () => {
    const cardId = sessionStorage.getItem("currentCardId");
    if (!cardId) {
      alert("No card data found. Please upload an image first.");
      router.push("/upload");
      return;
    }

    setIsExporting(true);
    try {
      const response = await api.post("/api/export/sheets", { cardId });
      
      // Save preference
      saveExportPreference("sheets");
      setSavedPreference("sheets");
      
      if (response.data.sheetUrl) {
        // Open Google Sheet in new tab
        window.open(response.data.sheetUrl, "_blank");
        setIsModalOpen(true);
        sessionStorage.setItem("sheetUrl", response.data.sheetUrl);
        
        // Auto-redirect to upload page after 1.5 seconds
        setTimeout(() => {
          setIsModalOpen(false);
          router.push("/upload");
        }, 1500);
      } else {
        setIsModalOpen(true);
        // Auto-redirect immediately if no sheet URL
        setTimeout(() => {
          setIsModalOpen(false);
          router.push("/upload");
        }, 500);
      }
    } catch (error: any) {
      console.error("Google Sheets export error:", error);
      const errorMessage = error.response?.data?.error || "Failed to export to Google Sheets. Please try again.";
      alert(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = () => {
    router.push("/export");
  };

  return (
    <div className="container mx-auto px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Review & Edit</h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          {/* Regular fields (excluding title and caption) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {regularFields.map(([key, value]) => {
              const confidence = getConfidenceScore(key);
              const confidenceLevel = getConfidenceLevel(key);
              
              return (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    {getFieldLabel(key)}
                    {confidence !== null && (
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${getConfidenceBadgeStyle(confidenceLevel)}`}>
                        {getConfidenceBadgeText(confidenceLevel, confidence)}
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent text-gray-900 bg-white ${
                      confidenceLevel ? getInputFieldStyle(confidenceLevel) : "border-gray-300 focus:ring-blue-500"
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 my-6"></div>

          {/* Bottom fields (Listing Title and Listing Caption) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {bottomFields.map(([key, value]) => {
              const confidence = getConfidenceScore(key);
              const confidenceLevel = getConfidenceLevel(key);
              
              return (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    {getFieldLabel(key)}
                    {confidence !== null && (
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${getConfidenceBadgeStyle(confidenceLevel)}`}>
                        {getConfidenceBadgeText(confidenceLevel, confidence)}
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:border-transparent text-gray-900 bg-white ${
                      confidenceLevel ? getInputFieldStyle(confidenceLevel) : "border-gray-300 focus:ring-blue-500"
                    }`}
                    placeholder={key === "title" && !autoTitle ? "Generating title..." : ""}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-4 flex-wrap">
          <button
            onClick={() => router.push("/upload")}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            Cancel
          </button>
          
          {/* Direct Export Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleExportCSV}
              disabled={isExporting}
              className="px-6 py-2 bg-[#1e3a5f] text-white rounded-lg hover:bg-[#2a4f7a] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {isExporting ? "Exporting..." : "Download CSV"}
            </button>
            <button
              onClick={handleExportSheets}
              disabled={isExporting}
              className="px-6 py-2 bg-[#1e3a5f] text-white rounded-lg hover:bg-[#2a4f7a] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {isExporting ? "Exporting..." : "Download Sheet"}
            </button>
          </div>
          
          {/* Optional: Keep export page link for changing preferences */}
          <button
            onClick={handleExport}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm underline"
          >
            Change Export Settings
          </button>
        </div>

        <ExportSuccessModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onDownloadCSV={handleExportCSV}
          onOpenGoogleSheet={handleExportSheets}
        />
      </div>
    </div>
  );
}

