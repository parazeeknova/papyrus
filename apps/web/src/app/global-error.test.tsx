import { expect, mock, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";

const captureException = mock(() => undefined);
const posthogClient: {
  captureException?: typeof captureException;
} = {
  captureException,
};

mock.module("posthog-js", () => ({
  default: posthogClient,
}));

const { GlobalErrorSurface } = await import("./global-error");

test("captures the error and lets the user retry", () => {
  posthogClient.captureException = captureException;
  captureException.mockClear();

  const reset = mock(() => undefined);
  const error = Object.assign(new Error("boom"), { digest: "digest-1" });

  const view = render(<GlobalErrorSurface error={error} reset={reset} />);

  expect(captureException).toHaveBeenCalledWith(error, {
    digest: "digest-1",
    surface: "global-error-boundary",
  });

  fireEvent.click(view.getByRole("button", { name: "Retry" }));

  expect(reset).toHaveBeenCalledTimes(1);
  expect(view.getByText("Something broke.")).not.toBeNull();
});

test("renders the recovery surface when posthog exception capture is unavailable", () => {
  posthogClient.captureException = undefined;

  const reset = mock(() => undefined);
  const error = Object.assign(new Error("boom"), { digest: "digest-1" });

  const view = render(<GlobalErrorSurface error={error} reset={reset} />);

  fireEvent.click(view.getByRole("button", { name: "Retry" }));

  expect(reset).toHaveBeenCalledTimes(1);
  expect(view.getByText("Something broke.")).not.toBeNull();
});
