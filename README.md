# Ghana Card Detection App

A lightweight, real-time Ghana Card detection web application built with **Next.js** and **TensorFlow.js**.  
The app uses a trained **YOLOv8** model to detect and capture Ghana Cards directly from a webcam feed.

---

## Brief Description of the Approach

This project demonstrates a modular and efficient real-time detection system using component-based architecture.  
It preprocesses video frames, runs detection using **TensorFlow.js**, and overlays detection results on a live canvas.  
**State management** to ensure responsive, real-time feedback during detection and capture.

---

## Component Structure

```bash
app - Contains page.jsx which renders GhanaCardScanner components

components folder - Contains GhanaCardScanner components (GhanaCardScanner.jsx)

utilities folder
- tfUtilities.js 
# preprocessFrame - Resizes video frames for YOLO input
# processYoloOutput - Process model predictions
# calculateAlignmentSCore - Calculate Alignment Score

- drawUtilites.js
# drawDetections - Draws detection boxes on canvas

- captureUtilities.js
# Crop detected  card to the suitable aspect ratio

style folder - contains necessary styling for the app.
```

---

##  Getting Started

### 1. Clone the repository



### 2. Install dependencies

```bash
npm install
```

### 3. Run the development server

```bash
npm run dev
```

### 4. Open in browser

Go to [http://localhost:3000](http://localhost:3000)

Make sure your webcam permissions are allowed!

---

##  Technologies Used

- **Next.js** (App Router structure)
- **TensorFlow.js** (Real-time YOLOv8 model inference)
- **CSS Modules** (Scoped and modular CSS)
- **Custom preprocessing pipelines** for TensorFlow inputs

---

##  Challenges Faced & Solutions

### 1. High Memory Leak
**Issue:** Detection still run in background after camera has been stopped causing app to malfunction and device to overheat.

**Solution:** Created an animationFrameRef variable to store requestAnimationFrame ID, and properly canceled it using cancelAnimationFrame() when camera is stoppped. 

### 2. Single Detection
**Issue:** Initially, the model only performed a single detection after loading, meaning users had to manually trigger detection every time, leading to poor user experience.

**Solution:** Implemented a continuous detection loop using requestAnimationFrame stored in an animationFrameRef.

---

## Improvements

### 1. Manual Capture Button Captures Everything
Initially the app manually captures anything in the video frame even when no card is detected.

**Improvement:** Ensured manual capture button only captures when a card is detected.

### 2. Slow Detection Response
Detection is slow sometimes when confidence thresholds are too high.

**Improvement:** Reduced detection confidence threshold to enable faster detection.

## Features

- ✅ Real-time Ghana Card detection from webcam
- ✅ Manual capture of detected cards
- ✅ Auto-capture feature (if enabled)
- ✅ Clear detection overlays on canvas
- ✅ Error handling for model, webcam, and canvas issues
- ✅ Lightweight, fast, and mobile-responsive

---

