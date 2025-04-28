export const preprocessFrame = async (videoRef) => {
    const video = videoRef.current;

     // Guard against invalid video dimensions
     if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
        console.warn("preprocessFrame: video size is 0x0", {
            videoWidth: video?.videoWidth,
            videoHeight: video?.videoHeight
        });
        throw new Error("Video not ready or has invalid dimensions.");
    }

    return tf.tidy(() => {
        //Convert video to tensor
        const videoTensor = tf.browser.fromPixels(videoRef.current);
    
        //Get Dimensions
        const [h, w] = videoTensor.shape.slice(0, 2);
    
        //YOLOv8 needs 640x640 square input
        const inputSize = 640;
    
        //calculate scale to maintain aspect ratio
        const scale = Math.min(inputSize / w, inputSize / h);
        const scaledWidth = Math.round(w * scale);
        const scaledHeight = Math.round(h * scale);
    
        //Reisize while maintaining aspect ratio
        const resized = tf.image.resizeBilinear(videoTensor, [scaledHeight, scaledWidth]);
    
        //Create black padding
        const paddingHeight = inputSize - scaledHeight;
        const paddingWidth = inputSize - scaledWidth;
        const topPadding = Math.floor(paddingHeight / 2);
        const leftPadding = Math.floor(paddingWidth / 2);
    
        //Pad the image to get a square inout of 640x640
        const padded = tf.pad(
            resized,
            [
                [topPadding, paddingHeight - topPadding],
                [leftPadding, paddingWidth - leftPadding],
                [0, 0],
            ]
        )
    
        //Normalize values to [0, 1]
        const normalized = padded.div(tf.scalar(255));
    
        // Add batch dimension
        const batched = normalized.expandDims(0);
    
        // Store original dimensions for mapping back
        const imageDims = {
            inputSize,
            originalWidth: w,
            originalHeight: h,
            scale,
            topPadding,
            leftPadding
        }
        return {tensor: batched, imageDims}
    })
}

export const calculateAlignmentScore = (aspectRatio, area, imageDims) => {
    // Ideal aspect ratio for Ghana Card (85.6mm × 54mm)
    const idealAspectRatio = 1.585;
    const aspectRatioTolerance = 0.2;
    
    // Validate inputs to avoid NaN or infinite values
    if (!aspectRatio || !area || area <= 0 || aspectRatio <= 0) {
        return 0;
    }
    
    // Calculate aspect ratio score (how close to ideal)
    const aspectRatioError = Math.abs(aspectRatio - idealAspectRatio) / idealAspectRatio;
    const aspectRatioScore = Math.max(0, 1 - aspectRatioError / aspectRatioTolerance);
    
    // Calculate area score (card should take up a reasonable portion of the frame)
    const totalArea = imageDims.originalWidth * imageDims.originalHeight;
    const areaRatio = area / totalArea;
    
    let areaScore = 0;
    if (areaRatio > 0.03 && areaRatio < 0.9) {
        // Prefer cards that take up some reasonable portion of the frame
        if (areaRatio > 0.08 && areaRatio < 0.7) {
            areaScore = 1.0;
        } else {
            areaScore = 0.7;
        }
    }
    
    // Combined score (weighted 60% aspect ratio, 40% area)
    return aspectRatioScore * 0.6 + areaScore * 0.4;
}

export const processYoloOutput = async (predictions, imageDims) => {
    const detections = [];

    try {

        //
        let outputArray;

        //Handle different output formats
        if(Array.isArray(predictions)){
            
            //If model returns multiple outputa, use the first one
            outputArray = await predictions[0].array();
        }
        else {
            outputArray = await predictions.array();
        }

        //Determine YOLOv8 output format (usually [1, 8400, 6] or [1, 6, 8400])
        //Format 1: [batch, predictions, outputs] - each row is a detection with [x, y, w, h, conf, class]
        if(outputArray[0].length > outputArray[0][0].length) {
            // Number of detections
            const numDetections = outputArray[0].length;

            for (let i = 0; i < numDetections; i++) {
                //YOLOv8 outputs normalized coordinates
                const x = outputArray[0][i][0];
                const y = outputArray[0][i][1];
                const w = outputArray[0][i][2];
                const h = outputArray[0][i][3];
                const conf = outputArray[0][i][4];

                //Skip low confidence detections
                if(conf > 0.85){
                    //COnvert normalized coordinates to pixels
                    //Yolov8 outputs center coordinates, convert to top-left
                    const boxX = (x - w/2) * imageDims.inputSize;
                    const boxY = (y - h/2) * imageDims.inputSize;
                    const boxWidth = w * imageDims.inputSize;
                    const boxHeight = h * imageDims.inputSize;

                    //Convet from padded image back to original video coordinates
                    const originalX = (boxX - imageDims.leftPadding) / imageDims.scale;
                    const originalY = (boxY - imageDims.topPadding) / imageDims.scale;
                    const originalWidth = boxWidth / imageDims.scale;
                    const originalHeight = boxHeight / imageDims.scale;

                    //Calculate aspect ratio
                    const aspectRatio = originalWidth / originalHeight;

                    //Add to detections array
                    detections.push({
                        box: {
                            x: originalX,
                            y: originalY,
                            width: originalWidth,
                            height: originalHeight
                        },
                        confidence: conf,
                        aspectRatio: aspectRatio,
                        alignmentScore: calculateAlignmentScore(aspectRatio, originalHeight * originalWidth, {
                            originalHeight: imageDims.originalHeight,
                            originalWidth: imageDims.originalWidth
                        })
                    })
                }
            }
        }
        //Format 2: [batch, outputs, predictions] - outputs are arranged by feature
        else {

            //Number of Detections
            const numDetections = outputArray[0][0].length;

            for(let i = 0; i < numDetections; i++) {
                //YOLOv8 outputs normalized coordinates [0-1]
                const x = outputArray[0][0][i]; // Center x
                const y = outputArray[0][1][i]; // Center y
                const w = outputArray[0][2][i]; // Width
                const h = outputArray[0][3][i]; // Height
                const conf = outputArray[0][4][i]; // Confidence

                //Skip low confidence detections
                if(conf > 0.85){
                    //oOnvert normalized coordinates to pixels
                    //Yolov8 outputs center coordinates, convert to top-left
                    const boxX = (x - w/2) * imageDims.inputSize;
                    const boxY = (y - h/2) * imageDims.inputSize;
                    const boxWidth = w * imageDims.inputSize;
                    const boxHeight = h * imageDims.inputSize;

                    //Convert from padded image back to original video coordinates
                    const originalX = (boxX - imageDims.leftPadding) / imageDims.scale;
                    const originalY = (boxY - imageDims.topPadding) / imageDims.scale;
                    const originalWidth = boxWidth / imageDims.scale;
                    const originalHeight = boxHeight / imageDims.scale;

                    //Calculate aspect ratio
                    const aspectRatio = originalWidth / originalHeight;

                    //Add to detections array
                    detections.push({
                        box: {
                            x: originalX,
                            y: originalY,
                            width: originalWidth,
                            height: originalHeight
                        },
                        confidence: conf,
                        aspectRatio: aspectRatio,
                        alignmentScore: calculateAlignmentScore(aspectRatio, originalHeight * originalWidth, {
                            originalHeight: imageDims.originalHeight,
                            originalWidth: imageDims.originalWidth
                        })
                    })
                }
            }
        }

    } catch (err) {
        setStatus('Error processing predictions: ' + err.message);
    }

    //Sort by confidence(highest first)
    return detections.sort((a, b) => b.confidence - a.confidence);
}