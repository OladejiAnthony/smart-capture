//smart-capture/app/page.js
"use client";
import { Suspense } from "react";
import GhanaCardScanner from "../components/GhanaCardScanner";

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GhanaCardScanner />
    </Suspense>
  );
}
