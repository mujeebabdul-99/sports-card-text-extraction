"use client";

import { Check, X, Folder } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

export default function TipsPanel() {
  const [goodImageError, setGoodImageError] = useState(false);
  const [badImageError, setBadImageError] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-2 mb-6">
        <Folder className="w-6 h-6 text-amber-600" />
        <h3 className="text-xl font-semibold text-gray-800">Tips for Best Photo</h3>
      </div>

      <div className="flex flex-col gap-6">
        {/* Good Example - Single Column */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-green-600" />
            <span className="text-gray-700 font-medium">Good: Clear, no glare</span>
          </div>
          <div className="w-full h-48 bg-gray-100 rounded-lg overflow-hidden border-2 border-green-300 relative">
            {!goodImageError ? (
              <Image
                src="/good.png"
                alt="Good example: Clear card photo"
                fill
                className="object-cover"
                onError={() => setGoodImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-gray-400 text-sm">Place good.png in /public/</span>
              </div>
            )}
          </div>
        </div>

        {/* Bad Example - Single Column */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <X className="w-5 h-5 text-red-600" />
            <span className="text-gray-700 font-medium">Bad: Glare, blurry</span>
          </div>
          <div className="w-full h-48 bg-gray-100 rounded-lg overflow-hidden border-2 border-red-300 relative">
            {!badImageError ? (
              <Image
                src="/bad.jpg"
                alt="Bad example: Poor card photo"
                fill
                className="object-cover"
                onError={() => setBadImageError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-gray-400 text-sm">Place bad.jpg in /public/</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

