import Head from "next/head";
import { Info } from "lucide-react";
import { Layout } from "@/components/Layout";
import { DropZone } from "@/components/DropZone";

export default function UploadPage() {
  return (
    <Layout>
      <Head>
        <title>Upload | DocFlow</title>
        <meta name="description" content="Upload documents for async processing" />
      </Head>

      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-primary">Upload documents</h1>
          <p className="mt-1 text-sm text-secondary">
            Drop files below to queue them for background processing. You&apos;ll be
            redirected to the dashboard to track progress.
          </p>
        </div>

        <DropZone />

        <div className="mt-6 flex gap-2 rounded-lg border border-subtle p-4">
          <Info size={15} className="mt-0.5 flex-shrink-0 text-tertiary" />
          <div>
            <h3 className="text-sm font-medium text-secondary">How it works</h3>
            <ol className="mt-1.5 space-y-1 text-sm text-tertiary">
              <li>1. Drop or select one or more files</li>
              <li>2. A background job is created and queued</li>
              <li>3. A worker processes it in stages, streaming live progress</li>
              <li>4. Review the extracted output, edit fields, and finalize</li>
              <li>5. Export finalized results as JSON or CSV</li>
            </ol>
          </div>
        </div>
      </div>
    </Layout>
  );
}
