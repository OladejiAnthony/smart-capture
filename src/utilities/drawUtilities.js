//drawUtilities.js
export const drawDetections = (detections, canvasRef, isInvalid = false) => {
  const ctx = canvasRef.current.getContext("2d");
  if (!detections || detections.length === 0) return;

  const detection = detections[0];
  const { box, confidence, alignmentScore } = detection;

  // Determine color based on validity
  let color;
  if (isInvalid) {
    color = "red"; // Invalid card
  } else if (alignmentScore > 0.8) {
    color = "lime"; // Excellent alignment
  } else if (alignmentScore > 0.5) {
    color = "yellow"; // Good alignment
  } else {
    color = "orange"; // Poor alignment
  }

  // Draw bounding box
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  // Draw label background
  const text = isInvalid
    ? "Invalid Card"
    : `Ghana Card: ${Math.round(confidence * 100)}% (Align: ${Math.round(
        alignmentScore * 100
      )}%)`;

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
