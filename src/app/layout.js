export const metadata = {
  title: "Ghana Card Scanner",
  description: "Auto-capture Ghana Card using TensorFlow.js and TFLite",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script
          crossOrigin="anonymous"
          src="//unpkg.com/react-scan/dist/auto.global.js"
        />
        <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.2.0"></script>
        <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.9/dist/tf-tflite.min.js"></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
