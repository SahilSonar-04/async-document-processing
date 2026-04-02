import type { AppProps } from "next/app";
import { Toaster } from "react-hot-toast";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            fontSize: "14px",
            borderRadius: "10px",
            padding: "12px 16px",
          },
          success: {
            iconTheme: { primary: "#22c55e", secondary: "#fff" },
          },
          error: {
            iconTheme: { primary: "#ef4444", secondary: "#fff" },
          },
        }}
      />
      <Component {...pageProps} />
    </>
  );
}
