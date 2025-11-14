"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { processImage } from "@/lib/api";

export default function ProcessingPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Processing image...");

  useEffect(() => {
    const processCard = async () => {
      try {
        const sourceImageId = sessionStorage.getItem("currentImageId");
        const filename = sessionStorage.getItem("imageFilename");
        const url = sessionStorage.getItem("imageUrl");

        if (!sourceImageId || !filename || !url) {
          router.push("/upload");
          return;
        }

        setStatus("Running OCR...");
        const result = await processImage(filename, sourceImageId, url);
        
        // Store card data
        sessionStorage.setItem("currentCardId", result.cardId);
        sessionStorage.setItem("cardData", JSON.stringify(result.card));
        
        setStatus("Complete!");
        setTimeout(() => {
          router.push("/review");
        }, 500);
      } catch (error: any) {
        console.error("Processing error:", error);
        
        // Provide user-friendly error messages based on error type
        let errorMessage = "Processing failed. Please try again.";
        
        if (error.response) {
          const status = error.response.status;
          const data = error.response.data;
          
          if (status === 404 && data.error?.includes("Image file not found")) {
            errorMessage = "Image file not found. Please upload the image again.";
          } else if (data.step === "ocr" || data.message?.includes("OCR")) {
            errorMessage = "Unable to extract text from this image. Please ensure:\n• The image is clear and in focus\n• The card text is visible\n• The image is not corrupted\n• Try a different image format (JPG or PNG)";
          } else if (data.step === "normalization" || data.message?.includes("Normalization") || data.message?.includes("AI service")) {
            // Use the backend's user-friendly message if available
            errorMessage = data.message || "Unable to process the extracted text. The AI service may be temporarily unavailable. Please try again.";
          } else if (data.error || data.message) {
            errorMessage = data.message || data.error;
          }
        } else if (error.message) {
          if (error.message.includes("Network Error") || error.message.includes("ERR_CONNECTION_REFUSED")) {
            errorMessage = "Cannot connect to server. Please check your connection and try again.";
          } else {
            errorMessage = error.message;
          }
        }
        
        setStatus(errorMessage);
        setTimeout(() => {
          router.push("/upload");
        }, 5000); // Give user more time to read the error message
      }
    };

    processCard();
  }, [router]);

  const isError = status.includes("failed") || status.includes("Unable") || status.includes("error") || status.includes("not found") || status.includes("corrupted");
  
  return (
    <div className="container mx-auto px-6 py-12">
      <div className="max-w-2xl mx-auto text-center">
        <div className="mb-8">
          {!isError && (
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          )}
          {isError && (
            <div className="w-16 h-16 border-4 border-red-500 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-4xl">⚠️</span>
            </div>
          )}
          <h2 className={`text-2xl font-semibold mb-2 ${isError ? "text-red-400" : "text-white"}`}>
            {status.split('\n')[0]}
          </h2>
          {status.includes('\n') && (
            <div className="mt-4 text-left bg-red-900/20 border border-red-500/30 rounded-lg p-4 max-w-lg mx-auto">
              <p className="text-red-300 text-sm whitespace-pre-line">
                {status.split('\n').slice(1).join('\n')}
              </p>
            </div>
          )}
          {!isError && (
            <p className="text-gray-300">
              Please wait while we extract and process your card information...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

