//smart-capture/src/app/components/GhanaCardScanner.jsx
"use client";
import { useState, useEffect, useRef } from "react";
import { captureCard } from "@/utilities/captureUtilities";
import { preprocessFrame, processYoloOutput } from "@/utilities/tfUtilities";
import { drawDetections } from "@/utilities/drawUtilities";
import { useSearchParams } from "next/navigation";
import "../style/style.css";

export default function GhanaCardScanner() {
  console.log("[Smart-Capture] Initializing GhanaCardScanner component");

  // Get URL parameters
  const searchParams = useSearchParams();
  const verification_id = searchParams.get("verification_id");
  const verification_type = searchParams.get("verification_type");

  console.log(`[Smart-Capture] Received verification_id: ${verification_id}`);
  console.log(
    `[Smart-Capture] Received verification_type: ${verification_type}`
  );

  // Camera, Video and Canvas Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const captureRef = useRef(null);
  const cameraRef = useRef(null);

  // Model and Processing Refs
  const modelRef = useRef(null);
  const processingRef = useRef(false);
  const detectionRef = useRef([]);

  // Detection Loop Control Refs
  const animationFrameRef = useRef(null);
  const isDetectionActiveRef = useRef(false);

  // App Status States
  const [status, setStatus] = useState("Initializing...");
  const [modelStatus, setModelStatus] = useState("Initializing");
  const [cameraStatus, setCameraStatus] = useState(false);
  const [invalidCardDetected, setInvalidCardDetected] = useState(false);

  // Capture and Detection States
  const [captureMessage, setCaptureMessage] = useState("No card captured yet");
  const [consecutiveDetections, setConsecutiveDetections] = useState(0);
  const [submitEnabled, setSubmitEnabled] = useState(false);

  // Model parameters
  const confidenceThreshold = 0.5;
  const minConsecutiveDetections = 3;
  const minDetectionAreaRatio = 0.02;
  const maxDetectionAreaRatio = 0.8;

  // Notify parent window when component mounts
  useEffect(() => {
    console.log(
      "[Smart-Capture] Notifying parent window that scanner is ready"
    );
    window.parent.postMessage(
      {
        type: "GHANA_CARD_SCANNER_READY",
        data: { verification_id, verification_type },
      },
      "*"
    );

    return () => {
      console.log("[Smart-Capture] Component unmounting, cleaning up...");
      stopCamera();
    };
  }, [verification_id, verification_type]);

  // Loading and Initializing TensorFlow
  useEffect(() => {
    console.log("[Smart-Capture] Initializing TensorFlow.js...");
    const init = async () => {
      setStatus("Checking TensorFlow.js...");
      if (!window.tf || !window.tflite) {
        console.error("[Smart-Capture] TensorFlow.js or TFLite not found");
        setStatus("TensorFlow.js or TFLite not found");
        return;
      }

      console.log(
        "[Smart-Capture] TensorFlow.js detected, waiting for ready state..."
      );
      await tf.ready();
      setStatus("Loading model...");
      console.log("[Smart-Capture] TensorFlow.js ready, loading model...");

      try {
        console.log(
          "[Smart-Capture] Loading TFLite model from /model/autocapture.tflite"
        );
        const loadedModel = await tflite.loadTFLiteModel(
          "/model/autocapture.tflite"
        );
        modelRef.current = loadedModel;

        console.log("[Smart-Capture] Model loaded successfully");
        setStatus("Model loaded successfully");
        setModelStatus(
          "Model loaded: YOLOv8 TFLite (model/autocapture.tflite)"
        );

        await startCamera();
      } catch (err) {
        console.error("[Smart-Capture] Error loading model:", err);
        setStatus("Error loading model: " + err.message);
      }
    };
    init();
  }, []);

  // Function to start the camera
  const startCamera = async () => {
    console.log("[Smart-Capture] Attempting to start camera...");
    try {
      setStatus("Requesting camera access...");
      const constraints = {
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      console.log(
        "[Smart-Capture] Requesting media stream with constraints:",
        constraints
      );
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      const video = videoRef.current;
      video.srcObject = stream;

      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          console.log(
            "[Smart-Capture] Video metadata loaded, dimensions:",
            video.videoWidth,
            "x",
            video.videoHeight
          );
          video.play();
          resolve();
        };
      });

      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      console.log(
        "[Smart-Capture] Canvas dimensions set to:",
        canvas.width,
        "x",
        canvas.height
      );

      cameraRef.current = stream;
      setCameraStatus(true);

      console.log("[Smart-Capture] Camera started successfully");
      setStatus("Camera active. Position a Ghana Card in the frame.");

      isDetectionActiveRef.current = true;
      startDetectionLoop();
    } catch (err) {
      console.error("[Smart-Capture] Error starting camera:", err);
      setStatus("Error starting camera: " + err.message);
    }
  };

  // Function to stop the camera
  const stopCamera = () => {
    console.log("[Smart-Capture] Stopping camera...");
    const stream = videoRef.current?.srcObject;

    if (stream) {
      console.log("[Smart-Capture] Stopping all media tracks");
      stream.getTracks().forEach((track) => {
        console.log("[Smart-Capture] Stopping track:", track.kind);
        track.stop();
      });
      videoRef.current.srcObject = null;
      setCameraStatus(false);
      setStatus("Camera stopped.");
    }

    const ctx = canvasRef.current.getContext("2d");
    const canvas = canvasRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (animationFrameRef.current) {
      console.log("[Smart-Capture] Cancelling animation frame");
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    cameraRef.current = null;
    processingRef.current = false;
    isDetectionActiveRef.current = false;
    console.log("[Smart-Capture] Camera stopped and resources cleaned up");
  };

  // Function to start the detection loop
  const startDetectionLoop = () => {
    if (!isDetectionActiveRef.current) {
      console.log("[Smart-Capture] Detection loop inactive, exiting");
      return;
    }

    if (
      !videoRef.current ||
      !canvasRef.current ||
      !cameraRef.current ||
      !modelRef.current
    ) {
      console.log("[Smart-Capture] Waiting for required refs to be ready...");
      animationFrameRef.current = requestAnimationFrame(startDetectionLoop);
      return;
    }

    if (
      videoRef.current.videoWidth === 0 ||
      videoRef.current.videoHeight === 0
    ) {
      console.log("[Smart-Capture] Waiting for valid video dimensions...");
      animationFrameRef.current = requestAnimationFrame(startDetectionLoop);
      return;
    }

    if (!processingRef.current) {
      try {
        console.log("[Smart-Capture] Starting detection...");
        detectCard();
      } catch (error) {
        console.error("[Smart-Capture] Detection error:", error);
        stopCamera();
      }
    }

    animationFrameRef.current = requestAnimationFrame(startDetectionLoop);
  };

  // Function to detect card
  const detectCard = async () => {
    if (
      !videoRef.current ||
      !canvasRef.current ||
      !cameraRef.current ||
      !modelRef.current
    ) {
      console.log(
        "[Smart-Capture] Skipping detection - required refs not ready"
      );
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.log(
        "[Smart-Capture] Skipping detection - invalid video dimensions"
      );
      return;
    }

    if (processingRef.current) {
      console.log("[Smart-Capture] Skipping detection - already processing");
      return;
    }

    processingRef.current = true;
    console.log("[Smart-Capture] Starting frame processing...");

    try {
      console.log("[Smart-Capture] Preprocessing frame...");
      const { tensor, imageDims } = await preprocessFrame(videoRef);

      console.log("[Smart-Capture] Running model prediction...");
      const predictions = await modelRef.current.predict(tensor);

      console.log("[Smart-Capture] Processing YOLO output...");
      const detections = await processYoloOutput(predictions, imageDims);
      detectionRef.current = detections;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (detections.length > 0) {
        console.log(`[Smart-Capture] Detected ${detections.length} objects`);
        drawDetections(detections, canvasRef, invalidCardDetected);
        checkForAutoCapture(detections);
      } else {
        console.log("[Smart-Capture] No objects detected");
        setConsecutiveDetections(0);
        setInvalidCardDetected(false);
      }

      // Clean up memory
      console.log("[Smart-Capture] Cleaning up tensor memory...");
      tensor.dispose();
      if (Array.isArray(predictions)) {
        predictions.forEach((p) => p?.dispose?.());
      } else {
        predictions?.dispose?.();
      }
    } catch (err) {
      console.error("[Smart-Capture] Detection error:", err);
      setStatus("Error detecting card: " + err.message);
    } finally {
      processingRef.current = false;
      console.log("[Smart-Capture] Frame processing completed");
    }
  };

  // Auto-capture logic
  const checkForAutoCapture = (detections) => {
    if (!detections || detections.length === 0) {
      console.log("[Smart-Capture] No detections to process");
      setConsecutiveDetections(0);
      setInvalidCardDetected(false);
      return;
    }

    const detection = detections[0];
    console.log(
      `[Smart-Capture] Processing detection - Confidence: ${detection.confidence}, Aspect Ratio: ${detection.aspectRatio}`
    );

    // Calculate area ratio
    const areaRatio =
      (detection.box.width * detection.box.height) /
      (videoRef.current.videoWidth * videoRef.current.videoHeight);

    // Enhanced validity checks
    const isValidCard =
      detection.confidence > confidenceThreshold &&
      detection.aspectRatio > 1.3 &&
      detection.aspectRatio < 1.9 &&
      areaRatio > minDetectionAreaRatio &&
      areaRatio < maxDetectionAreaRatio;

    if (!isValidCard) {
      console.log("[Smart-Capture] Invalid card detected");
      setInvalidCardDetected(true);
      setStatus("Invalid card detected - Please use a Ghana Card");
      setConsecutiveDetections(0);
      return;
    }

    setInvalidCardDetected(false);
    console.log("[Smart-Capture] Valid Ghana Card detected");

    // Enhanced alignment scoring that works at different distances
    const distanceAdjustedScore = Math.min(
      1,
      detection.alignmentScore * (0.5 + 0.5 * (areaRatio / 0.3))
    );

    if (distanceAdjustedScore > 0.4) {
      console.log("[Smart-Capture] Good detection with adjusted alignment");
      setConsecutiveDetections((prev) => {
        const next = prev + 1;
        console.log(
          `[Smart-Capture] Consecutive detections: ${next}/${minConsecutiveDetections}`
        );
        setStatus(
          `Ghana Card detected - Holding steady: ${next}/${minConsecutiveDetections}`
        );

        if (next >= minConsecutiveDetections) {
          captureCard(
            detection,
            videoRef,
            captureRef,
            setStatus,
            setCaptureMessage,
            setSubmitEnabled
          );
          setStatus("Ghana Card captured successfully");
          return 0;
        }
        return next;
      });
    } else {
      console.log("[Smart-Capture] Detection doesn't meet adjusted thresholds");
      setConsecutiveDetections((prev) => Math.max(0, prev - 1));
      setStatus("Position Ghana Card properly in the frame");
    }
  };

  // Send card to backend and notify parent
  const sendToBackend = () => {
    console.log(
      "[Smart-Capture] Preparing to send captured card to backend..."
    );
    if (!captureRef.current) {
      console.log("[Smart-Capture] No card captured - cannot send to backend");
      setStatus("No card captured yet");
      return;
    }

    setStatus("Sending card to backend for verification...");
    console.log("[Smart-Capture] Converting canvas to blob...");

    captureRef.current.toBlob(
      async (blob) => {
        if (!blob) {
          console.log("[Smart-Capture] Failed to create image blob");
          setStatus("Failed to create image blob");
          return;
        }

        try {
          const formData = new FormData();
          formData.append("card_image", blob, "ghana_card.jpg");
          console.log("[Smart-Capture] FormData created with card image");

          const apiUrl = "https://backend-api.com/verify";
          console.log(`[Smart-Capture] Sending to backend API: ${apiUrl}`);

          const response = await fetch(apiUrl, {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }

          const data = await response.json();
          console.log("[Smart-Capture] Backend response:", data);

          // Notify parent window of successful capture
          console.log(
            "[Smart-Capture] Notifying parent window of successful capture"
          );
          window.parent.postMessage(
            {
              type: "GHANA_CARD_CAPTURE_SUCCESS",
              data: {
                verification_id,
                verification_type,
                card_data: data,
              },
            },
            "*"
          );

          setStatus(
            `Verification successful! Card is ${
              data.valid ? "valid" : "invalid"
            }`
          );
          setCaptureMessage(
            `Verification result: ${
              data.valid ? "Valid" : "Invalid"
            } Ghana Card`
          );
          setSubmitEnabled(false);
        } catch (error) {
          console.error("[Smart-Capture] Error sending to backend:", error);
          setStatus(`Error sending to backend: ${error.message}`);
          setCaptureMessage("Error during verification");
        }
      },
      "image/jpeg",
      0.95
    );
  };

  return (
    <div className="container">
      <h1>Ghana Card Auto-Capture</h1>

      <div className="status-container">
        <div className="status" id="status">
          {status}
        </div>
        <div className="model-status" id="model-status">
          {modelStatus}
        </div>
      </div>

      <div className="camera-container">
        <div id="video-container">
          <video id="webcam" ref={videoRef} />
          <canvas id="detection-canvas" ref={canvasRef} />
          <div className="guide-overlay">
            <div className="card-guide"></div>
          </div>
        </div>

        {invalidCardDetected && (
          <div className="invalid-card-warning">
            Invalid card detected. Please use a Ghana Card.
          </div>
        )}
      </div>

      <div className="result-container">
        <h2>Captured Card</h2>
        <canvas id="captured-card" ref={captureRef} />

        <div className="capture-info">
          <div id="capture-status">{captureMessage}</div>
          <button
            className="btn send-btn"
            disabled={!submitEnabled}
            onClick={sendToBackend}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
