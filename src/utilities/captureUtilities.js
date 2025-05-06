//smart-capture/src/app/utilities/captureUtilities.js
export const captureCard = (
  detection,
  videoRef,
  captureRef,
  setStatus,
  setCaptureMessage,
  setSubmitEnabled
) => {
  console.log("[Smart-Capture] Starting high-quality card capture process...");
  const { box } = detection;
  const video = videoRef.current;
  const canvas = captureRef.current;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  // Increase the output resolution while maintaining aspect ratio
  const outputWidth = 1280; // Increased from 640
  const outputHeight = Math.round(outputWidth / 1.585); // Ghana Card aspect ratio

  // Set canvas to higher resolution
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  // Calculate crop area with more precise margins
  const margin = 0.03; // Reduced from 0.05 for less wasted space
  const marginX = box.width * margin;
  const marginY = (box.width / 1.585) * margin;

  const cropX = Math.max(0, box.x - marginX);
  const cropY = Math.max(0, box.y - marginY);
  const cropWidth = Math.min(box.width + 2 * marginX, video.videoWidth - cropX);
  const cropHeight = Math.min(
    box.width / 1.585 + 2 * marginY,
    video.videoHeight - cropY
  );

  // Draw the captured image
  context.drawImage(
    video,
    cropX,
    cropY,
    cropWidth,
    cropHeight, // source rectangle
    0,
    0,
    outputWidth,
    outputHeight // destination rectangle
  );

  // Apply sharpening filter
  sharpenCanvas(canvas, context, 0.5); // Moderate sharpening

  console.log("[Smart-Capture] High-quality card captured successfully");
  setStatus("High-quality card captured successfully.");
  setCaptureMessage("Card captured successfully.");
  setSubmitEnabled(true);

  // Automatically submit if in iframe context
  if (window.self !== window.top) {
    console.log("[Smart-Capture] In iframe context, auto-submitting...");
    setTimeout(() => {
      const event = new Event("click");
      document.querySelector(".send-btn")?.dispatchEvent(event);
    }, 1000);
  }
};

// Add this new function to apply sharpening
const sharpenCanvas = (canvas, ctx, amount = 0.5) => {
  // Create a temporary canvas for processing
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext("2d");

  // Apply sharpening using convolution
  tempCtx.drawImage(canvas, 0, 0);
  const imageData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Simple sharpening kernel
  for (let i = 0; i < data.length; i += 4) {
    if (i > 4 * canvas.width && i < data.length - 4 * canvas.width) {
      // Apply sharpening to each channel (R, G, B)
      for (let j = 0; j < 3; j++) {
        const current = data[i + j];
        const above = data[i + j - 4 * canvas.width];
        const below = data[i + j + 4 * canvas.width];
        const left = data[i + j - 4];
        const right = data[i + j + 4];

        // Sharpened value
        data[i + j] = Math.max(
          0,
          Math.min(
            255,
            current * (1 + 4 * amount) - (above + below + left + right) * amount
          )
        );
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
};
