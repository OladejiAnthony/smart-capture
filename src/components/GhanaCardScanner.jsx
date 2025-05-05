//components/GhanaCardScanner.jsx -
"use client";
import { useState, useEffect, useRef } from "react";
import { captureCard } from "@/utilities/captureUtilities";
import { preprocessFrame, processYoloOutput } from "@/utilities/tfUtilities";
import { drawDetections } from "@/utilities/drawUtilities";

import "../style/style.css";

export default function GhanaCardScanner() {
  // Camera, Video and Canvas Refs
  const videoRef = useRef(null); // Reference to the webcam video element
  const canvasRef = useRef(null); // Reference to the detection canvas element
  const captureRef = useRef(null); // Reference to the captured card canvas
  const cameraRef = useRef(null); // Reference to the camera stream object

  // Model and Processing Refs
  const modelRef = useRef(null); // Reference to the loaded YOLOv8 model
  const processingRef = useRef(false); // Flag to indicate if a frame is currently being processed
  const detectionRef = useRef([]); // Stores the latest detection results

  // Detection Loop Control Refs
  const animationFrameRef = useRef(null); // Stores the requestAnimationFrame ID
  const isDetectionActiveRef = useRef(false); // Flag to indicate if detection loop is active
  const autoCaptureRef = useRef(true); // Auto-capture always enabled

  // App Status States
  const [status, setStatus] = useState("Initializing..."); // General status message
  const [modelStatus, setModelStatus] = useState("Initializing"); // Model loading status
  const [cameraStatus, setCameraStatus] = useState(false); // Camera status
  const [invalidCardDetected, setInvalidCardDetected] = useState(false);

  // Capture and Detection States
  const [captureMessage, setCaptureMessage] = useState("No card captured yet"); // Capture feedback
  const [consecutiveDetections, setConsecutiveDetections] = useState(0); // Counter for stable detection

  // Submit Controls
  const [submitEnabled, setSubmitEnabled] = useState(false); // Enables or disables the submit button

  //Model parameters
  const confidenceThreshold = 0.65;
  const minConsecutiveDetections = 3;

  //Loading and Initializing TensorFlow
  useEffect(() => {
    const init = async () => {
      setStatus("Checking TensorFlow.js...");
      if (!window.tf || !window.tflite) {
        setStatus("TensorFlow.js or TFLite not found");
        return;
      }
      await tf.ready();
      setStatus("Loading model...");

      try {
        const loadedModel = await tflite.loadTFLiteModel(
          "/model/autocapture.tflite"
        );

        modelRef.current = loadedModel;
        setStatus("Model loaded successfully");
        setModelStatus(
          "Model loaded: YOLOv8 TFLite (model/autocapture.tflite)"
        );
        await startCamera();
      } catch (err) {
        setStatus("Error loading model: " + err.message);
      }
    };
    init();
  }, []);

  //Function to start the camera
  const startCamera = async () => {
    try {
      setStatus("Requesting camera access...");
      //Set camera constraints
      const constraints = {
        video: {
          facingMode: "environment",
          width: { ideal: 1080 },
          height: { ideal: 720 },
        },
      };

      //Get video stream
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      //Set video source
      const video = videoRef.current;
      video.srcObject = stream;

      //Wait for video to load
      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });

      //Set canvas dimensions
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      cameraRef.current = stream;
      setCameraStatus(true);

      setStatus("Camera active. Position a Ghana Card in the frame.");

      //Start detection loop
      isDetectionActiveRef.current = true;
      startDetectionLoop();
    } catch (err) {
      setStatus("Error starting camera: " + err.message);
    }
  };

  //Function to stop the camera
  const stopCamera = () => {
    //Get current video stream
    const stream = videoRef.current?.srcObject;

    //Stop video stream
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;

      setCameraStatus(false);
      setStatus("Camera stopped.");
    }

    const ctx = canvasRef.current.getContext("2d");
    const canvas = canvasRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    //Stop detection loop
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Clear Camera Ref
    cameraRef.current = null;

    //Reset processing
    processingRef.current = false;

    //Stop detection loop
    isDetectionActiveRef.current = false;
  };

  //Function to start the detection loop
  const startDetectionLoop = () => {
    if (
      !videoRef.current ||
      !canvasRef.current ||
      !cameraRef.current ||
      !modelRef.current
    ) {
      console.warn("Some refs not ready yet, waiting...");
      animationFrameRef.current = requestAnimationFrame(startDetectionLoop);
      return;
    }

    //Check video dimensions
    if (
      videoRef.current.videoWidth === 0 ||
      videoRef.current.videoHeight === 0
    ) {
      console.warn("Video dimensions not ready yet, waiting...");
      if (isDetectionActiveRef.current) {
        animationFrameRef.current = requestAnimationFrame(startDetectionLoop);
      }
      return;
    }

    //Start detection if no frame is currently being processed
    if (!processingRef.current) {
      try {
        detectCard();
      } catch (error) {
        stopCamera();
      }
    }

    //Continue detection loop
    if (isDetectionActiveRef.current) {
      animationFrameRef.current = requestAnimationFrame(startDetectionLoop);
    }
  };

  //Function to handle camera state (start/stop)
  const handleCameraAction = () => {
    if (cameraStatus) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  //Function to detect card
  const detectCard = async () => {
    if (
      !videoRef.current ||
      !canvasRef.current ||
      !cameraRef.current ||
      !modelRef.current
    ) {
      return;
    }

    //Get video and canvas
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn("Video dimensions are 0 — skipping detection");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    if (processingRef.current) return;
    processingRef.current = true;

    //Detect card
    try {
      const { tensor, imageDims } = await preprocessFrame(videoRef);
      const predictions = await modelRef.current.predict(tensor);
      const detections = await processYoloOutput(predictions, imageDims);

      //Store detections to detectionRef array
      detectionRef.current = detections;

      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      if (detections.length > 0) {
        drawDetections(detections, canvasRef, invalidCardDetected);
        checkForAutoCapture(detections);
      } else {
        setConsecutiveDetections(0);
        setInvalidCardDetected(false);
      }

      //Clean up memory
      tensor.dispose();
      if (Array.isArray(predictions)) {
        predictions.forEach((p) => p?.dispose?.());
      } else {
        predictions?.dispose?.();
      }
    } catch (err) {
      setStatus("Error detecting card: " + err.message);
    }
    processingRef.current = false;
  };

  // Captured Card Setup
  const checkForAutoCapture = (detections) => {
    if (!detections || detections.length === 0) {
      setConsecutiveDetections(0);
      setInvalidCardDetected(false);
      return;
    }

    const detection = detections[0];
    // Check if detected object is not a Ghana Card (low confidence or wrong aspect ratio)
    if (
      detection.confidence < 0.4 ||
      detection.aspectRatio < 1.3 ||
      detection.aspectRatio > 1.9
    ) {
      setInvalidCardDetected(true);
      setStatus("Invalid card detected - Please use a Ghana Card");
      setConsecutiveDetections(0);
      return;
    } // If we get here, it's likely a Ghana Card
    setInvalidCardDetected(false);

    if (
      detection.confidence > confidenceThreshold &&
      detection.alignmentScore > 0.5
    ) {
      setConsecutiveDetections((prev) => {
        const next = prev + 1;
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
      setConsecutiveDetections((prev) => Math.max(0, prev - 1));
      setStatus("Position Ghana Card properly in the frame");
    }
  };

  // Canvas setup
  useEffect(() => {
    const capturedCanvas = captureRef.current;
    const capturedCtx = capturedCanvas.getContext("2d");

    capturedCanvas.width = 640;
    capturedCanvas.height = 400;

    //Canvas background
    capturedCtx.fillStyle = "#f0f0f0";
    capturedCtx.fillRect(0, 0, capturedCanvas.width, capturedCanvas.height);

    //canvas text
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

  //Send card to backend
  const sendToBackend = () => {
    if (!captureRef.current) {
      setStatus("No card captured yet");
      return;
    }

    setStatus("Sending card to backend for verification...");

    // Convert captured canvas to blob
    captureRef.current.toBlob(
      async (blob) => {
        if (!blob) {
          setStatus("Failed to create image blob");
          return;
        }

        try {
          const formData = new FormData();
          formData.append("card_image", blob, "ghana_card.jpg");

          // Replace with your actual backend API endpoint
          const apiUrl = "https://backend-api.com/verify";

          const response = await fetch(apiUrl, {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }

          const data = await response.json();

          // Handle successful response
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
          setSubmitEnabled(false); // (optional) maybe disable submit after success
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

        <div className="controls">
          <button className="btn" onClick={handleCameraAction}>
            {cameraStatus ? "Stop Camera" : "Start Camera"}
          </button>
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
