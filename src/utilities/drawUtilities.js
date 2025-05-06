//smart-capture/src/app/utilities/drawUtilities.js
export const drawDetections = (detections, canvasRef, isInvalid = false) => {
  console.log("Drawing detections on canvas...");
  const ctx = canvasRef.current.getContext("2d");
  if (!detections || detections.length === 0) {
    console.log("No detections to draw");
    return;
  }

  const detection = detections[0];
  const { box, confidence, alignmentScore } = detection;
  console.log(
    `Drawing detection: confidence=${confidence}, alignment=${alignmentScore}`
  );

  // Determine color based on validity
  let color;
  if (isInvalid) {
    color = "red";
    console.log("Drawing as invalid card");
  } else if (alignmentScore > 0.8) {
    color = "lime";
    console.log("Drawing as excellent alignment");
  } else if (alignmentScore > 0.5) {
    color = "yellow";
    console.log("Drawing as good alignment");
  } else {
    color = "orange";
    console.log("Drawing as poor alignment");
  }

  // Draw bounding box
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  console.log(
    `Drawn bounding box at x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`
  );

  // Draw label background
  const text = isInvalid
    ? "Invalid Card"
    : `Ghana Card: ${Math.round(confidence * 100)}% (Align: ${Math.round(
        alignmentScore * 100
      )}%)`;

  console.log(`Drawing label: ${text}`);

  ctx.font = "bold 16px Arial";
  const textWidth = ctx.measureText(text).width + 10;
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(
    box.x > 35 ? box.x - 35 : box.x,
    box.y > 35 ? box.y - 35 : box.y + box.height,
    textWidth,
    30
  );

  // Draw label text
  ctx.fillStyle = color;
  ctx.fillText(
    text,
    box.x + 5,
    box.y > 35 ? box.y - 15 : box.y + box.height + 20
  );
};
