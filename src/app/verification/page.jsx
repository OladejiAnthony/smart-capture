//smart-capture/src/app/verification/page.jsx
"use client";
import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import GhanaCardScanner from "@/components/GhanaCardScanner";
import SelfieCapture from "@/components/SelfieCapture";
import Image from "next/image";
import Autheo from "../../assest/Autheo_this.png";

const VerificationPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verification_id = searchParams.get("verification_id");
  const verification_type = searchParams.get("verification_type");

  const [currentStep, setCurrentStep] = useState(1); // 1: Ghana Card, 2: Selfie, 3: Processing
  const [ghanaCardData, setGhanaCardData] = useState(null);
  const [selfieData, setSelfieData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === "GHANA_CARD_CAPTURE_SUCCESS") {
        console.log("Ghana Card captured successfully");
        setGhanaCardData(event.data.data);
        setCurrentStep(2); // Move to selfie capture
      } else if (event.data.type === "SELFIE_CAPTURE_SUCCESS") {
        console.log("Selfie captured successfully");
        setSelfieData(event.data.data);
        setCurrentStep(3); // Move to processing
        handleSubmit(event.data.data.selfie_image, ghanaCardData.card_image);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [ghanaCardData]);

  const handleSubmit = async (selfieImage, cardImage) => {
    setIsProcessing(true);
    try {
      const response = await fetch("https://your-backend-api.com/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          verification_id,
          verification_type,
          ghana_card: cardImage,
          selfie: selfieImage,
        }),
      });

      const data = await response.json();

      if (data.success) {
        router.push(`/verification-success?verification_id=${verification_id}`);
      } else {
        console.error("Verification failed:", data.message);
        // Handle error
      }
    } catch (error) {
      console.error("Error submitting verification:", error);
      // Handle error
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Timeline Header */}
      <div className="w-full bg-gray-50 py-6 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">
            Document Verification
          </h1>
          <div className="flex items-center justify-between relative">
            {/* Stage 1 - Ghana Card Capture */}
            <div className="flex flex-col items-center z-10">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white mb-2 ${
                  currentStep === 1
                    ? "bg-blue-600"
                    : currentStep > 1
                    ? "bg-green-500"
                    : "bg-gray-300"
                }`}
              >
                {currentStep > 1 ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <span>1</span>
                )}
              </div>
              <span
                className={`text-sm font-medium ${
                  currentStep === 1
                    ? "text-blue-600"
                    : currentStep > 1
                    ? "text-green-500"
                    : "text-gray-500"
                }`}
              >
                Ghana Card Capture
              </span>
            </div>

            {/* Stage 2 - Selfie Capture */}
            <div className="flex flex-col items-center z-10">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white mb-2 ${
                  currentStep === 2
                    ? "bg-blue-600"
                    : currentStep > 2
                    ? "bg-green-500"
                    : "bg-gray-300"
                }`}
              >
                {currentStep > 2 ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <span>2</span>
                )}
              </div>
              <span
                className={`text-sm font-medium ${
                  currentStep === 2
                    ? "text-blue-600"
                    : currentStep > 2
                    ? "text-green-500"
                    : "text-gray-500"
                }`}
              >
                Selfie Capture
              </span>
            </div>

            {/* Stage 3 - Processing */}
            <div className="flex flex-col items-center z-10">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white mb-2 ${
                  currentStep === 3 ? "bg-blue-600" : "bg-gray-300"
                }`}
              >
                <span>3</span>
              </div>
              <span
                className={`text-sm font-medium ${
                  currentStep === 3 ? "text-blue-600" : "text-gray-500"
                }`}
              >
                Processing
              </span>
            </div>

            {/* Progress line */}
            <div className="absolute top-5 left-10 right-10 h-1 bg-gray-200">
              <div
                className={`h-1 bg-blue-600 ${
                  currentStep === 1
                    ? "w-1/3"
                    : currentStep === 2
                    ? "w-2/3"
                    : "w-full"
                }`}
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1">
        {currentStep === 1 && <GhanaCardScanner />}

        {currentStep === 2 && <SelfieCapture />}

        {currentStep === 3 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#245C94] border-t-transparent mx-auto mb-4"></div>
              <h1 className="text-2xl font-bold mb-2">
                Processing Verification
              </h1>
              <p className="text-[#245C94]/80">
                Please wait while we verify your documents
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerificationPage;
