"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, AlertCircle, Download, FileSpreadsheet } from "lucide-react";
import { getExportPreference, type ExportType } from "@/lib/exportPreferences";
import api from "@/lib/api";
import ExportSuccessModal from "@/components/ExportSuccessModal";

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
  const [savedPreference, setSavedPreference] = useState<ExportType | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const cardDataStr = sessionStorage.getItem("cardData");
    if (cardDataStr) {
      try {
        const cardData = JSON.parse(cardDataStr);
        if (cardData.normalized) {
          setFields(cardData.normalized);
        }
      } catch (error) {
        console.error("Error parsing card data:", error);
      }
    } else {
      // No card data, redirect to upload
      router.push("/upload");
    }
    
    // Load saved export preference
    setSavedPreference(getExportPreference());
  }, [router]);

  const handleFieldChange = (field: string, value: string) => {
    setFields((prev) => ({ ...prev, [field]: value }));
  };

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

  const handleExport = () => {
    router.push("/export");
  };

  return (
    <div className="container mx-auto px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Review & Edit</h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(fields).map(([key, value]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-2 capitalize">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button
            onClick={() => router.push("/upload")}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            Cancel
          </button>
          {savedPreference && (
            <button
              onClick={handleQuickExport}
              disabled={isExporting}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savedPreference === "csv" ? (
                <Download className="w-4 h-4" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              {isExporting ? "Exporting..." : `Quick Export (${savedPreference === "csv" ? "CSV" : "Sheets"})`}
            </button>
          )}
          <button
            onClick={handleExport}
            className="px-6 py-2 bg-[#1e3a5f] text-white rounded-lg hover:bg-[#2a4f7a]"
          >
            {savedPreference ? "Choose Export Method" : "Continue to Export"}
          </button>
        </div>

        <ExportSuccessModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onDownloadCSV={savedPreference === "csv" ? handleQuickExport : undefined}
          onOpenGoogleSheet={savedPreference === "sheets" ? handleQuickExport : undefined}
        />
      </div>
    </div>
  );
}

