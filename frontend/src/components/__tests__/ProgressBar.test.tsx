import { render, screen } from "@testing-library/react";
import { ProgressBar } from "@/components/ProgressBar";

describe("ProgressBar", () => {
  it("shows the percentage label when requested", () => {
    render(<ProgressBar progress={42} status="processing" showLabel />);
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("clamps progress above 100", () => {
    const { container } = render(<ProgressBar progress={150} status="processing" showLabel />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: "100%" });
  });

  it("clamps negative progress to zero", () => {
    render(<ProgressBar progress={-10} status="queued" showLabel />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});
