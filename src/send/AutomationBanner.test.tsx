import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutomationBanner } from ".";

describe("AutomationBanner", () => {
  it("shows persistent automation state and stop-all action", () => {
    const onStopAll = vi.fn();

    render(
      <AutomationBanner
        macroName="Handshake"
        intervalMs={75}
        droppedAutomatedSends={2}
        onStopAll={onStopAll}
      />
    );

    const banner = screen.getByLabelText("Automation running");

    expect(within(banner).getByText("Handshake")).toBeInTheDocument();
    expect(within(banner).getByText("75 ms")).toBeInTheDocument();
    expect(within(banner).getByText("Dropped 2")).toBeInTheDocument();

    fireEvent.click(within(banner).getByRole("button", { name: "Stop all" }));

    expect(onStopAll).toHaveBeenCalledTimes(1);
  });
});
