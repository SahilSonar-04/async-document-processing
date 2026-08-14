import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/StatusBadge";

describe("StatusBadge", () => {
  it("renders the label for a completed job", () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("renders the label for a failed job", () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders the label for a queued job", () => {
    render(<StatusBadge status="queued" />);
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });
});
