"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ExportSuccessModal from "@/components/ExportSuccessModal";
import api from "@/lib/api";
import { saveExportPreference, getExportPreference, type ExportType } from "@/lib/exportPreferences";
import { Check } from "lucide-react";

export default function ExportPage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [savedPreference, setSavedPreference] = useState<ExportType | null>(null);

  useEffect(() => {
    // Load saved preference on mount
    setSavedPreference(getExportPreference());
  }, []);

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
        setIsModalOpen(true);
        // Store sheet URL for the modal
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
    } catch (error: any) {
      console.error("Google Sheets export error:", error);
      const errorMessage = error.response?.data?.error || "Failed to export to Google Sheets. Please try again.";
      alert(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="container mx-auto px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Export Data</h1>

        <div className="bg-white rounded-lg shadow-md p-8">
          <p className="text-gray-700 mb-6">
            Choose how you'd like to export your card data:
          </p>

          {savedPreference && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                💡 Last used: <span className="font-semibold">{savedPreference === "csv" ? "CSV" : "Google Sheets"}</span>
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <button
              onClick={handleExportCSV}
              disabled={isExporting}
              className={`w-full px-6 py-4 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed relative ${
                savedPreference === "csv"
                  ? "bg-[#1e3a5f] text-white hover:bg-[#2a4f7a] border-2 border-blue-400"
                  : "bg-[#1e3a5f] text-white hover:bg-[#2a4f7a]"
              }`}
            >
              {savedPreference === "csv" && (
                <Check className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5" />
              )}
              <span className={savedPreference === "csv" ? "ml-6" : ""}>
                {isExporting && savedPreference === "csv" ? "Exporting..." : "Export to CSV"}
              </span>
            </button>
            <button
              onClick={handleExportSheets}
              disabled={isExporting}
              className={`w-full px-6 py-4 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed relative ${
                savedPreference === "sheets"
                  ? "bg-[#1e3a5f] text-white hover:bg-[#2a4f7a] border-2 border-blue-400"
                  : "bg-[#1e3a5f] text-white hover:bg-[#2a4f7a]"
              }`}
            >
              {savedPreference === "sheets" && (
                <Check className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5" />
              )}
              <span className={savedPreference === "sheets" ? "ml-6" : ""}>
                {isExporting && savedPreference === "sheets" ? "Exporting..." : "Export to Google Sheets"}
              </span>
            </button>
          </div>
        </div>
      </div>

      <ExportSuccessModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onDownloadCSV={handleExportCSV}
        onOpenGoogleSheet={handleExportSheets}
      />
    </div>
  );
}

