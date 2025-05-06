//smart-capture/src/app/utilities/tfUtilities.js
export const preprocessFrame = async (videoRef) => {
  console.log("Preprocessing video frame...");
  const video = videoRef.current;

  if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
    console.warn("preprocessFrame: video size is 0x0", {
      videoWidth: video?.videoWidth,
      videoHeight: video?.videoHeight,
    });
    throw new Error("Video not ready or has invalid dimensions.");
  }

  console.log(
    `Original video dimensions: ${video.videoWidth}x${video.videoHeight}`
  );

  return tf.tidy(() => {
    console.log("Converting video to tensor...");
    const videoTensor = tf.browser.fromPixels(videoRef.current);

    const [h, w] = videoTensor.shape.slice(0, 2);
    console.log(`Tensor dimensions: ${w}x${h}`);

    const inputSize = 640;
    const scale = Math.min(inputSize / w, inputSize / h);
    const scaledWidth = Math.round(w * scale);
    const scaledHeight = Math.round(h * scale);
    console.log(
      `Scaled dimensions: ${scaledWidth}x${scaledHeight}, scale=${scale}`
    );

    console.log("Resizing tensor...");
    const resized = tf.image.resizeBilinear(videoTensor, [
      scaledHeight,
      scaledWidth,
    ]);

    const paddingHeight = inputSize - scaledHeight;
    const paddingWidth = inputSize - scaledWidth;
    const topPadding = Math.floor(paddingHeight / 2);
    const leftPadding = Math.floor(paddingWidth / 2);
    console.log(`Padding - top: ${topPadding}, left: ${leftPadding}`);

    console.log("Padding tensor...");
    const padded = tf.pad(resized, [
      [topPadding, paddingHeight - topPadding],
      [leftPadding, paddingWidth - leftPadding],
      [0, 0],
    ]);

    console.log("Normalizing tensor values...");
    const normalized = padded.div(tf.scalar(255));

    console.log("Adding batch dimension...");
    const batched = normalized.expandDims(0);

    const imageDims = {
      inputSize,
      originalWidth: w,
      originalHeight: h,
      scale,
      topPadding,
      leftPadding,
    };

    console.log("Preprocessing complete");
    return { tensor: batched, imageDims };
  });
};

export const calculateAlignmentScore = (aspectRatio, area, imageDims) => {
  console.log("Calculating alignment score...");
  const idealAspectRatio = 1.585;
  const aspectRatioTolerance = 0.3; // Increased tolerance from 0.2

  if (!aspectRatio || !area || area <= 0 || aspectRatio <= 0) {
    console.log("Invalid inputs for alignment calculation");
    return 0;
  }

  // More lenient aspect ratio scoring
  const aspectRatioError = Math.abs(aspectRatio - idealAspectRatio);
  const aspectRatioScore = Math.max(
    0,
    1 - aspectRatioError / aspectRatioTolerance
  );
  console.log(`Aspect ratio score: ${aspectRatioScore}`);

  // Improved area scoring that works at different distances
  const totalArea = imageDims.originalWidth * imageDims.originalHeight;
  const areaRatio = area / totalArea;
  console.log(`Area ratio: ${areaRatio}`);

  let areaScore = 0;
  // More generous area scoring
  if (areaRatio > 0.02) {
    // Lowered from 0.03
    if (areaRatio > 0.05 && areaRatio < 0.8) {
      // Wider range
      areaScore = 1.0;
    } else {
      areaScore = 0.5 + 0.5 * Math.min(1, areaRatio / 0.05);
    }
  }
  console.log(`Area score: ${areaScore}`);

  // Weighted scoring favoring aspect ratio slightly less
  const combinedScore = aspectRatioScore * 0.5 + areaScore * 0.5;
  console.log(`Combined alignment score: ${combinedScore}`);
  return combinedScore;
};

export const processYoloOutput = async (predictions, imageDims) => {
  console.log("Processing YOLO output...");
  const detections = [];

  try {
    let outputArray;
    console.log("Determining output format...");

    if (Array.isArray(predictions)) {
      console.log("Array output format detected");
      outputArray = await predictions[0].array();
    } else {
      console.log("Single output format detected");
      outputArray = await predictions.array();
    }

    if (outputArray[0].length > outputArray[0][0].length) {
      console.log("Processing format 1: [batch, predictions, outputs]");
      const numDetections = outputArray[0].length;
      console.log(`Number of detections: ${numDetections}`);

      for (let i = 0; i < numDetections; i++) {
        const conf = outputArray[0][i][4];
        if (conf > 0.5) {
          // Lowered from 0.85
          console.log(`Processing detection ${i} with confidence ${conf}`);
          const x = outputArray[0][i][0];
          const y = outputArray[0][i][1];
          const w = outputArray[0][i][2];
          const h = outputArray[0][i][3];

          const boxX = (x - w / 2) * imageDims.inputSize;
          const boxY = (y - h / 2) * imageDims.inputSize;
          const boxWidth = w * imageDims.inputSize;
          const boxHeight = h * imageDims.inputSize;

          const originalX = (boxX - imageDims.leftPadding) / imageDims.scale;
          const originalY = (boxY - imageDims.topPadding) / imageDims.scale;
          const originalWidth = boxWidth / imageDims.scale;
          const originalHeight = boxHeight / imageDims.scale;

          const aspectRatio = originalWidth / originalHeight;
          console.log(
            `Processed detection - x: ${originalX}, y: ${originalY}, width: ${originalWidth}, height: ${originalHeight}, aspect: ${aspectRatio}`
          );

          detections.push({
            box: {
              x: originalX,
              y: originalY,
              width: originalWidth,
              height: originalHeight,
            },
            confidence: conf,
            aspectRatio: aspectRatio,
            alignmentScore: calculateAlignmentScore(
              aspectRatio,
              originalHeight * originalWidth,
              {
                originalHeight: imageDims.originalHeight,
                originalWidth: imageDims.originalWidth,
              }
            ),
          });
        }
      }
    } else {
      console.log("Processing format 2: [batch, outputs, predictions]");
      const numDetections = outputArray[0][0].length;
      console.log(`Number of detections: ${numDetections}`);

      for (let i = 0; i < numDetections; i++) {
        const conf = outputArray[0][4][i];
        if (conf > 0.5) {
          console.log(`Processing detection ${i} with confidence ${conf}`);
          const x = outputArray[0][0][i];
          const y = outputArray[0][1][i];
          const w = outputArray[0][2][i];
          const h = outputArray[0][3][i];

          const boxX = (x - w / 2) * imageDims.inputSize;
          const boxY = (y - h / 2) * imageDims.inputSize;
          const boxWidth = w * imageDims.inputSize;
          const boxHeight = h * imageDims.inputSize;

          const originalX = (boxX - imageDims.leftPadding) / imageDims.scale;
          const originalY = (boxY - imageDims.topPadding) / imageDims.scale;
          const originalWidth = boxWidth / imageDims.scale;
          const originalHeight = boxHeight / imageDims.scale;

          const aspectRatio = originalWidth / originalHeight;
          console.log(
            `Processed detection - x: ${originalX}, y: ${originalY}, width: ${originalWidth}, height: ${originalHeight}, aspect: ${aspectRatio}`
          );

          detections.push({
            box: {
              x: originalX,
              y: originalY,
              width: originalWidth,
              height: originalHeight,
            },
            confidence: conf,
            aspectRatio: aspectRatio,
            alignmentScore: calculateAlignmentScore(
              aspectRatio,
              originalHeight * originalWidth,
              {
                originalHeight: imageDims.originalHeight,
                originalWidth: imageDims.originalWidth,
              }
            ),
          });
        }
      }
    }
  } catch (err) {
    console.error("Error processing predictions:", err);
    setStatus("Error processing predictions: " + err.message);
  }

  console.log(`Found ${detections.length} valid detections`);
  return detections.sort((a, b) => b.confidence - a.confidence);
};
