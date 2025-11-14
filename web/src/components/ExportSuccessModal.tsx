"use client";

import { FileSpreadsheet, Download, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface ExportSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownloadCSV?: () => void;
  onOpenGoogleSheet?: () => void;
}

export default function ExportSuccessModal({
  isOpen,
  onClose,
  onDownloadCSV,
  onOpenGoogleSheet,
}: ExportSuccessModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleProcessAnother = () => {
    onClose();
    router.push("/upload");
  };

  const handleOpenGoogleSheet = () => {
    const sheetUrl = sessionStorage.getItem("sheetUrl");
    if (sheetUrl) {
      window.open(sheetUrl, "_blank");
    } else if (onOpenGoogleSheet) {
      onOpenGoogleSheet();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
        {/* Top Section - Celebration Icon */}
        <div className="flex flex-col items-center mb-6">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800">Export Successful!</h2>
          <p className="text-sm text-gray-500 mt-2">Redirecting to upload page...</p>
        </div>

        {/* Middle Section - Export Options */}
        <div className="mb-6">
          <p className="text-gray-600 mb-4 text-center">
            Your data has been exported to:
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={onDownloadCSV}
              className="flex items-center gap-3 text-blue-600 hover:text-blue-800 transition-colors"
            >
              <FileSpreadsheet className="w-5 h-5" />
              <span>Download CSV</span>
            </button>
            <p className="text-gray-500 text-center">or</p>
            <button
              onClick={handleOpenGoogleSheet}
              className="flex items-center gap-3 text-blue-600 hover:text-blue-800 transition-colors"
            >
              <div className="w-5 h-5 bg-green-500 rounded flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4 text-white" />
              </div>
              <span>Open Google Sheet</span>
            </button>
          </div>
        </div>

        {/* Bottom Section - Process Another Button */}
        <button
          onClick={handleProcessAnother}
          className="w-full bg-[#1e3a5f] text-white py-3 rounded-lg hover:bg-[#2a4f7a] transition-colors font-medium"
        >
          Process Another Card
        </button>
      </div>
    </div>
  );
}

