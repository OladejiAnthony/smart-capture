//smart-capture/src/app/components/GhanaCardScanner.jsx
"use client";
import { useState, useEffect, useRef } from "react";
import { captureCard } from "@/utilities/captureUtilities";
import { preprocessFrame, processYoloOutput } from "@/utilities/tfUtilities";
import { drawDetections } from "@/utilities/drawUtilities";
import "../style/style.css";

export default function GhanaCardScanner() {
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
  const confidenceThreshold = 0.5; // Lowered from 0.65
  const minConsecutiveDetections = 3; // Keep this but adjust scoring
  const minDetectionAreaRatio = 0.02; // New - minimum area of card in frame
  const maxDetectionAreaRatio = 0.8; // New - maximum area of card in frame

  // Loading and Initializing TensorFlow
  useEffect(() => {
    console.log("Initializing TensorFlow.js...");
    const init = async () => {
      setStatus("Checking TensorFlow.js...");
      if (!window.tf || !window.tflite) {
        console.error("TensorFlow.js or TFLite not found");
        setStatus("TensorFlow.js or TFLite not found");
        return;
      }

      console.log("TensorFlow.js detected, waiting for ready state...");
      await tf.ready();
      setStatus("Loading model...");
      console.log("TensorFlow.js ready, loading model...");

      try {
        console.log("Loading TFLite model from /model/autocapture.tflite");
        const loadedModel = await tflite.loadTFLiteModel(
          "/model/autocapture.tflite"
        );
        modelRef.current = loadedModel;

        console.log("Model loaded successfully");
        setStatus("Model loaded successfully");
        setModelStatus(
          "Model loaded: YOLOv8 TFLite (model/autocapture.tflite)"
        );

        await startCamera();
      } catch (err) {
        console.error("Error loading model:", err);
        setStatus("Error loading model: " + err.message);
      }
    };
    init();

    return () => {
      console.log("Component unmounting, cleaning up...");
      stopCamera();
    };
  }, []);

  // Function to start the camera
  const startCamera = async () => {
    console.log("Attempting to start camera...");
    try {
      setStatus("Requesting camera access...");
      const constraints = {
        video: {
          facingMode: "environment",
          width: { ideal: 1920 }, // Increased from 1080
          height: { ideal: 1080 }, // Increased from 720
        },
      };

      console.log("Requesting media stream with constraints:", constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      const video = videoRef.current;
      video.srcObject = stream;

      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          console.log(
            "Video metadata loaded, dimensions:",
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
        "Canvas dimensions set to:",
        canvas.width,
        "x",
        canvas.height
      );

      cameraRef.current = stream;
      setCameraStatus(true);

      console.log("Camera started successfully");
      setStatus("Camera active. Position a Ghana Card in the frame.");

      isDetectionActiveRef.current = true;
      startDetectionLoop();
    } catch (err) {
      console.error("Error starting camera:", err);
      setStatus("Error starting camera: " + err.message);
    }
  };

  // Function to stop the camera
  const stopCamera = () => {
    console.log("Stopping camera...");
    const stream = videoRef.current?.srcObject;

    if (stream) {
      console.log("Stopping all media tracks");
      stream.getTracks().forEach((track) => {
        console.log("Stopping track:", track.kind);
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
      console.log("Cancelling animation frame");
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    cameraRef.current = null;
    processingRef.current = false;
    isDetectionActiveRef.current = false;
    console.log("Camera stopped and resources cleaned up");
  };

  // Function to start the detection loop
  const startDetectionLoop = () => {
    if (!isDetectionActiveRef.current) {
      console.log("Detection loop inactive, exiting");
      return;
    }

    if (
      !videoRef.current ||
      !canvasRef.current ||
      !cameraRef.current ||
      !modelRef.current
    ) {
      console.log("Waiting for required refs to be ready...");
      animationFrameRef.current = requestAnimationFrame(startDetectionLoop);
      return;
    }

    if (
      videoRef.current.videoWidth === 0 ||
      videoRef.current.videoHeight === 0
    ) {
      console.log("Waiting for valid video dimensions...");
      animationFrameRef.current = requestAnimationFrame(startDetectionLoop);
      return;
    }

    if (!processingRef.current) {
      try {
        console.log("Starting detection...");
        detectCard();
      } catch (error) {
        console.error("Detection error:", error);
        stopCamera();
      }
    }

    animationFrameRef.current = requestAnimationFrame(startDetectionLoop);
  };

  // Function to handle camera toggle
  const handleCameraAction = () => {
    console.log("Camera toggle requested");
    if (cameraStatus) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  // Function to detect card
  const detectCard = async () => {
    if (
      !videoRef.current ||
      !canvasRef.current ||
      !cameraRef.current ||
      !modelRef.current
    ) {
      console.log("Skipping detection - required refs not ready");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.log("Skipping detection - invalid video dimensions");
      return;
    }

    if (processingRef.current) {
      console.log("Skipping detection - already processing");
      return;
    }

    processingRef.current = true;
    console.log("Starting frame processing...");

    try {
      console.log("Preprocessing frame...");
      const { tensor, imageDims } = await preprocessFrame(videoRef);

      console.log("Running model prediction...");
      const predictions = await modelRef.current.predict(tensor);

      console.log("Processing YOLO output...");
      const detections = await processYoloOutput(predictions, imageDims);
      detectionRef.current = detections;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (detections.length > 0) {
        console.log(`Detected ${detections.length} objects`);
        drawDetections(detections, canvasRef, invalidCardDetected);
        checkForAutoCapture(detections);
      } else {
        console.log("No objects detected");
        setConsecutiveDetections(0);
        setInvalidCardDetected(false);
      }

      // Clean up memory
      console.log("Cleaning up tensor memory...");
      tensor.dispose();
      if (Array.isArray(predictions)) {
        predictions.forEach((p) => p?.dispose?.());
      } else {
        predictions?.dispose?.();
      }
    } catch (err) {
      console.error("Detection error:", err);
      setStatus("Error detecting card: " + err.message);
    } finally {
      processingRef.current = false;
      console.log("Frame processing completed");
    }
  };

  // Auto-capture logic
  const checkForAutoCapture = (detections) => {
    if (!detections || detections.length === 0) {
      console.log("No detections to process");
      setConsecutiveDetections(0);
      setInvalidCardDetected(false);
      return;
    }

    const detection = detections[0];
    console.log(
      `Processing detection - Confidence: ${detection.confidence}, Aspect Ratio: ${detection.aspectRatio}`
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
      console.log("Invalid card detected");
      setInvalidCardDetected(true);
      setStatus("Invalid card detected - Please use a Ghana Card");
      setConsecutiveDetections(0);
      return;
    }

    setInvalidCardDetected(false);
    console.log("Valid Ghana Card detected");

    // Enhanced alignment scoring that works at different distances
    const distanceAdjustedScore = Math.min(
      1,
      detection.alignmentScore * (0.5 + 0.5 * (areaRatio / 0.3))
    );

    if (distanceAdjustedScore > 0.4) {
      // Lowered from 0.5
      console.log("Good detection with adjusted alignment");
      setConsecutiveDetections((prev) => {
        const next = prev + 1;
        console.log(
          `Consecutive detections: ${next}/${minConsecutiveDetections}`
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
      console.log("Detection doesn't meet adjusted thresholds");
      setConsecutiveDetections((prev) => Math.max(0, prev - 1));
      setStatus("Position Ghana Card properly in the frame");
    }
  };

  // Canvas setup
  useEffect(() => {
    console.log("Initializing capture canvas...");
    const capturedCanvas = captureRef.current;
    const capturedCtx = capturedCanvas.getContext("2d");

    capturedCanvas.width = 640;
    capturedCanvas.height = 400;

    capturedCtx.fillStyle = "#f0f0f0";
    capturedCtx.fillRect(0, 0, capturedCanvas.width, capturedCanvas.height);

    const text = "No card captured yet";
    capturedCtx.font = "16px Arial";
    capturedCtx.fillStyle = "#6c757d";
    capturedCtx.textAlign = "center";
    capturedCtx.textBaseline = "middle";
    capturedCtx.fillText(
      text,
      capturedCanvas.width / 2,
      capturedCanvas.height / 2
    );
  }, []);

  // Send card to backend
  const sendToBackend = () => {
    console.log("Preparing to send captured card to backend...");
    if (!captureRef.current) {
      console.log("No card captured - cannot send to backend");
      setStatus("No card captured yet");
      return;
    }

    setStatus("Sending card to backend for verification...");
    console.log("Converting canvas to blob...");

    captureRef.current.toBlob(
      async (blob) => {
        if (!blob) {
          console.log("Failed to create image blob");
          setStatus("Failed to create image blob");
          return;
        }

        try {
          const formData = new FormData();
          formData.append("card_image", blob, "ghana_card.jpg");
          console.log("FormData created with card image");

          const apiUrl = "https://backend-api.com/verify";
          console.log(`Sending to backend API: ${apiUrl}`);

          const response = await fetch(apiUrl, {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }

          const data = await response.json();
          console.log("Backend response:", data);

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
          console.error("Error sending to backend:", error);
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

        {/* <div className="controls">
          <button className="btn" onClick={handleCameraAction}>
            {cameraStatus ? "Stop Camera" : "Start Camera"}
          </button>
        </div> */}
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
