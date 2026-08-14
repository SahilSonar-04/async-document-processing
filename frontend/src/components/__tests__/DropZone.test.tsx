import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropZone } from "@/components/DropZone";

jest.mock("@/lib/api", () => ({
  uploadDocuments: jest.fn(),
}));

jest.mock("next/router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe("DropZone", () => {
  it("flags a disallowed file extension in the queue", async () => {
    const user = userEvent.setup();
    const { container } = render(<DropZone />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = new File(["binary"], "malware.exe", { type: "application/octet-stream" });

    await user.upload(input, badFile);

    await waitFor(() => {
      expect(screen.getByText(/not supported/i)).toBeInTheDocument();
    });
  });

  it("accepts a valid file without an error", async () => {
    const user = userEvent.setup();
    const { container } = render(<DropZone />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const goodFile = new File(["hello world"], "notes.txt", { type: "text/plain" });

    await user.upload(input, goodFile);

    await waitFor(() => {
      expect(screen.getByText("notes.txt")).toBeInTheDocument();
    });
    expect(screen.queryByText(/not supported/i)).not.toBeInTheDocument();
  });
});
