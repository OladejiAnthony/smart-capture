//Card Capture Function
export const captureCard = (detection, videoRef, captureRef, setStatus, setCaptureMessage, setSubmitEnabled) => {
    const { box } = detection;
    const video = videoRef.current;
    const canvas = captureRef.current;
    const context = canvas.getContext('2d');

    //Ghana Card Aspect Ratio
    const aspectRatio = 1.585;

    //Adjust the detected box match the Ghana Card aspect ratio
    let adjustedHeight = box.width / aspectRatio;
    let adjustedY = box.y + (box.height - adjustedHeight) / 2;

    //Clamp adjustedY safely
    adjustedY = Math.max(0, Math.min(adjustedY, video.videoHeight - adjustedHeight));

    //Add margin
    const margin = 0.05;
    const marginX = box.width * margin;
    const marginY = adjustedHeight * margin;
    const cropX = Math.max(0, box.x - marginX);
    const cropY = Math.max(0, adjustedY - marginY);
    const cropWidth = Math.min(box.width + 2 * marginX, video.videoWidth - cropX);
    const cropHeight = Math.min(adjustedHeight + 2 * marginY, video.videoHeight - cropY);

    //Resize captured canvas
    canvas.width = 640;
    canvas.height = Math.round(640 / aspectRatio);

    //Clear canvas
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    try {
        //Draw cropped image to canvas
        context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
        setStatus('Card captured successfully.');
        setCaptureMessage('Card captured successfully.');
        setSubmitEnabled(true);
    } catch (error) {
        console.error('Error capturing card:', error);
        setStatus('Error capturing card.');
        setCaptureMessage('Error capturing card.');
        setSubmitEnabled(false);
    }
};