import Head from "next/head";
import { Layout } from "@/components/Layout";
import { DropZone } from "@/components/DropZone";

export default function UploadPage() {
  return (
    <Layout>
      <Head>
        <title>Upload | DocFlow</title>
        <meta name="description" content="Upload documents for async processing" />
      </Head>

      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Upload Documents</h1>
          <p className="text-sm text-gray-500 mt-1">
            Drop files below to queue them for background processing.
            You&apos;ll be redirected to the dashboard to track progress.
          </p>
        </div>

        <DropZone />

        <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 mb-2">How it works</h3>
          <ol className="text-sm text-gray-500 space-y-1.5 list-decimal list-inside">
            <li>Drop or select one or more files</li>
            <li>Files are uploaded and a background job is created</li>
            <li>A Celery worker picks up the job and processes it in stages</li>
            <li>Progress updates stream live via Server-Sent Events</li>
            <li>Review extracted output, edit fields, and finalize</li>
            <li>Export finalized results as JSON or CSV</li>
          </ol>
        </div>
      </div>
    </Layout>
  );
}
