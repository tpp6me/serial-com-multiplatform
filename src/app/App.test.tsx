import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders disconnected empty state", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "MultiSerial" })).toBeInTheDocument();
    expect(screen.getByText(/No port connected/)).toBeInTheDocument();
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });
});
