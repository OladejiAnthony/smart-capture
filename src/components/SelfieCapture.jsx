//smart-capture/src/app/components/SelfieCapture.jsx
"use client";
import React, { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import * as faceapi from "@vladmandic/face-api";
import Autheo from "../assest/Autheo_this.png";
import Link from "next/link";

const SelfieCapture = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verification_id = searchParams.get("verification_id");
  const verification_type = searchParams.get("verification_type");

  const [selfiePreview, setSelfiePreview] = useState(null);
  const [selfieBase64, setSelfieBase64] = useState(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [guidance, setGuidance] = useState("Position your face in the center");
  const [faceDetected, setFaceDetected] = useState(false);
  const [detectionQuality, setDetectionQuality] = useState(0);
  const [isCaptured, setIsCaptured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 5;
  const detectionRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    console.log("Initializing face-api models...");

    const loadModels = async () => {
      try {
        console.log("Loading face detection models...");
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
          faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
        ]);

        if (isMounted) {
          console.log("Face detection models loaded successfully");
          setIsModelLoaded(true);
        }
      } catch (err) {
        console.error("Error loading models:", err);
        if (isMounted) {
          setGuidance("Failed to initialize. Please refresh the page.");
          setIsLoading(false);
        }
      }
    };

    loadModels();

    return () => {
      isMounted = false;
      if (detectionRef.current) {
        cancelAnimationFrame(detectionRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    if (!videoRef.current) {
      if (retryCount < maxRetries) {
        setTimeout(() => {
          setRetryCount((prev) => prev + 1);
          startCamera();
        }, 200);
        return;
      }
      setGuidance("Camera initialization failed. Please refresh the page.");
      setIsLoading(false);
      return;
    }

    try {
      if (streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        try {
          await videoRef.current.play();
          setIsLoading(false);
        } catch (playErr) {
          setGuidance("Video playback error. Please refresh the page.");
          setIsLoading(false);
        }
        return;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        streamRef.current = mediaStream;

        videoRef.current.onloadedmetadata = () => {
          videoRef.current
            .play()
            .then(() => {
              setIsLoading(false);
            })
            .catch((err) => {
              setGuidance("Failed to start camera. Please check permissions.");
              setIsLoading(false);
            });
        };

        videoRef.current.onerror = () => {
          setGuidance("Camera error occurred. Please refresh.");
          setIsLoading(false);
        };
      }
    } catch (err) {
      if (err.name === "NotAllowedError") {
        setGuidance(
          "Camera access denied. Please allow camera access in your browser settings."
        );
      } else if (err.name === "NotFoundError") {
        setGuidance("No camera found. Please connect a camera and refresh.");
      } else {
        setGuidance("Camera access error. Please check permissions.");
      }
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isModelLoaded && !isCaptured) {
      startCamera();
    }
  }, [isModelLoaded, isCaptured, startCamera]);

  useEffect(() => {
    const detectFace = async () => {
      if (
        !videoRef.current ||
        !isModelLoaded ||
        !videoRef.current.srcObject ||
        isCaptured ||
        videoRef.current.readyState < 2
      ) {
        detectionRef.current = requestAnimationFrame(detectFace);
        return;
      }

      try {
        const detections = await faceapi
          .detectAllFaces(
            videoRef.current,
            new faceapi.TinyFaceDetectorOptions({
              inputSize: 320,
              scoreThreshold: 0.3,
            })
          )
          .withFaceLandmarks();

        if (detections.length === 0) {
          setFaceDetected(false);
          setGuidance("No face detected. Please center your face");
          setDetectionQuality(0);
          detectionRef.current = requestAnimationFrame(detectFace);
          return;
        }

        const detection = detections[0];
        const videoWidth = videoRef.current.videoWidth;
        const videoHeight = videoRef.current.videoHeight;
        const faceWidth = detection.detection.box.width;
        const faceHeight = detection.detection.box.height;

        const faceRatio = (faceWidth * faceHeight) / (videoWidth * videoHeight);
        const quality = Math.min(100, Math.round(faceRatio * 300));
        setDetectionQuality(quality);

        if (faceRatio < 0.15) {
          setFaceDetected(false);
          setGuidance("Move closer to the camera");
        } else if (faceRatio > 0.65) {
          setFaceDetected(false);
          setGuidance("Move back from the camera");
        } else {
          setFaceDetected(true);
          if (quality >= 90) {
            setGuidance("Perfect! Capturing...");
            setTimeout(() => captureImage(), 500);
            return;
          } else {
            setGuidance(`Move closer (${quality}% ideal)`);
          }
        }

        detectionRef.current = requestAnimationFrame(detectFace);
      } catch (error) {
        setGuidance("Detection error. Please refresh");
        detectionRef.current = requestAnimationFrame(detectFace);
      }
    };

    if (isModelLoaded && !isCaptured && !isLoading) {
      detectionRef.current = requestAnimationFrame(detectFace);
    }

    return () => {
      if (detectionRef.current) {
        cancelAnimationFrame(detectionRef.current);
      }
    };
  }, [isModelLoaded, isCaptured, isLoading]);

  const captureImage = () => {
    if (!videoRef.current || !videoRef.current.videoWidth) return;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const base64Data = canvas.toDataURL("image/jpeg", 0.95);
        setSelfieBase64(base64Data);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const previewUrl = URL.createObjectURL(blob);
              setSelfiePreview(previewUrl);
              setIsCaptured(true);
              setGuidance("Selfie captured successfully!");

              if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
              }
            }
          },
          "image/jpeg",
          0.95
        );
      }
    } catch (error) {
      setGuidance("Error capturing image. Please try again.");
    }
  };

  const retakePhoto = async () => {
    setIsCaptured(false);
    setSelfiePreview(null);
    setSelfieBase64(null);
    setGuidance("Position your face in the center");
    setIsLoading(true);
    setRetryCount(0);

    if (selfiePreview) {
      URL.revokeObjectURL(selfiePreview);
    }
  };

  const handleContinue = async () => {
    if (!selfieBase64) {
      console.error("Please capture a selfie first");
      return;
    }

    // Notify parent window (Ghana Card capture) that selfie is ready
    window.parent.postMessage(
      {
        type: "SELFIE_CAPTURE_SUCCESS",
        data: {
          verification_id,
          verification_type,
          selfie_image: selfieBase64.split(",")[1] || selfieBase64,
        },
      },
      "*"
    );
  };

  const GuidanceItem = ({ text, icon }) => (
    <div className="flex items-center justify-center gap-2">
      <div className="text-2xl">{icon}</div>
      <span className="text-sm font-medium text-[#245C94]">{text}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-[#245C94] poppins p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-4 text-[#245C94]">
            Capture your selfie
          </h1>
          <p className="text-[#245C94]/80 text-lg">
            Ensure your face is clearly visible
          </p>
        </div>

        <div className="relative mb-8">
          {isLoading ? (
            <div className="w-full h-[400px] flex items-center justify-center bg-gray-100 rounded-full">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#245C94] border-t-transparent"></div>
            </div>
          ) : isCaptured ? (
            <div className="relative w-full h-[400px] mx-auto">
              <div className="w-full h-full rounded-full overflow-hidden bg-gray-100 border-4 border-green-500">
                {selfiePreview && (
                  <Image
                    src={selfiePreview}
                    alt="Captured selfie"
                    width={400}
                    height={400}
                    className="w-full h-full object-cover rounded-full"
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-green-500 rounded-full p-3 shadow-lg">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-8 w-8 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative w-full h-[400px] mx-auto">
              <div className="w-full h-full rounded-full overflow-hidden bg-gray-100 relative">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  style={{
                    borderRadius: "100%",
                    border: `4px solid ${
                      faceDetected
                        ? detectionQuality >= 90
                          ? "#22c55e"
                          : "#fbbf24"
                        : "#d1d5db"
                    }`,
                    transition: "border-color 0.3s ease",
                  }}
                  autoPlay
                  playsInline
                  muted
                />
                <div
                  className="absolute inset-[5%] border-2 border-dashed rounded-full pointer-events-none"
                  style={{
                    borderColor: faceDetected
                      ? detectionQuality >= 90
                        ? "#22c55e"
                        : "#fbbf24"
                      : "#d1d5db",
                  }}
                ></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-sm font-medium px-4 py-2 rounded-full bg-black bg-opacity-50 text-white">
                    {guidance}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {!isCaptured && !isLoading && (
          <div className="flex justify-around mb-8 px-4">
            <GuidanceItem
              text="Good lighting"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 w-5"
                >
                  <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
                </svg>
              }
            />
            <GuidanceItem
              text="No glasses"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 w-5"
                >
                  <path d="M3.53 2.47a.75.75 0 00-1.06 1.06l18 18a.75.75 0 101.06-1.06l-18-18zM22.676 12.553a11.249 11.249 0 01-2.631 4.31l-3.099-3.099a5.25 5.25 0 00-6.71-6.71L7.759 4.577a11.217 11.217 0 014.242-.827c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113z" />
                  <path d="M15.75 12c0 .18-.013.357-.037.53l-4.244-4.243A3.75 3.75 0 0115.75 12zM12.53 15.713l-4.243-4.244a3.75 3.75 0 004.243 4.243z" />
                  <path d="M6.75 12c0-.619.107-1.213.304-1.764l-3.1-3.1a11.25 11.25 0 00-2.63 4.31c-.12.362-.12.752 0 1.114 1.489 4.467 5.704 7.69 10.675 7.69 1.5 0 2.933-.294 4.242-.827l-2.477-2.477A5.25 5.25 0 016.75 12z" />
                </svg>
              }
            />
            <GuidanceItem
              text="No hats"
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 w-5"
                >
                  <path
                    fillRule="evenodd"
                    d="M1.5 6.375c0-1.036.84-1.875 1.875-1.875h17.25c1.035 0 1.875.84 1.875 1.875v3.026a.75.75 0 01-.375.65 2.249 2.249 0 000 3.898.75.75 0 01.375.65v3.026c0 1.035-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 011.5 17.625v-3.026a.75.75 0 01.374-.65 2.249 2.249 0 000-3.898.75.75 0 01-.374-.65V6.375zm15-1.125a.75.75 0 01.75.75v.75a.75.75 0 01-1.5 0V6a.75.75 0 01.75-.75zm.75 4.5a.75.75 0 00-1.5 0v.75a.75.75 0 001.5 0v-.75zm-.75 3a.75.75 0 01.75.75v.75a.75.75 0 01-1.5 0v-.75a.75.75 0 01.75-.75zm.75 4.5a.75.75 0 00-1.5 0V18a.75.75 0 001.5 0v-.75zM6 12a.75.75 0 01.75-.75H12a.75.75 0 010 1.5H6.75A.75.75 0 016 12zm.75 2.25a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z"
                  />
                  clipRule="evenodd"
                </svg>
              }
            />
          </div>
        )}

        {isCaptured && (
          <div className="flex flex-col gap-3 mb-8">
            <button
              onClick={handleContinue}
              className="w-full py-4 bg-[#245C94] text-white font-semibold rounded-xl hover:bg-[#1a4570] transition-colors"
            >
              Continue
            </button>
            <button
              onClick={retakePhoto}
              className="w-full py-3 border border-[#245C94] text-[#245C94] font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Retake photo
            </button>
          </div>
        )}

        <div className="mt-auto pt-12">
          <p className="text-[#245C94]/80 text-center text-sm mb-6">
            By proceeding, you consent to processing your personal data
            according to our{" "}
            <Link
              href="/consent"
              className="text-[#245C94] hover:underline font-medium"
            >
              Consent to Personal Data Processing Document
            </Link>
          </p>
          <div className="flex justify-center items-center gap-2 mt-8">
            <p className="text-center text-[#245C94]/60 text-sm">Powered by</p>
            <Image
              src={Autheo}
              alt="Autheo"
              width={100}
              height={100}
              style={{ width: "auto", height: "auto" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelfieCapture;
