import type { AppProps } from "next/app";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { AuthGuard } from "@/components/AuthGuard";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${inter.variable} ${mono.variable}`}>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            fontSize: "14px",
            borderRadius: "8px",
            padding: "12px 16px",
            background: "rgb(24 24 27)",
            color: "rgb(237 237 239)",
            border: "1px solid rgb(38 38 42)",
          },
          success: { iconTheme: { primary: "#3FB950", secondary: "#0A0A0B" } },
          error: { iconTheme: { primary: "#F85149", secondary: "#0A0A0B" } },
        }}
      />
      <AuthGuard>
        <Component {...pageProps} />
      </AuthGuard>
    </div>
  );
}
