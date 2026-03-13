import { expect, mock, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";

const captureException = mock(() => undefined);

mock.module("posthog-js", () => ({
  default: {
    captureException,
  },
}));

const { default: GlobalError } = await import("./global-error");

test("captures the error and lets the user retry", () => {
  const reset = mock(() => undefined);
  const error = Object.assign(new Error("boom"), { digest: "digest-1" });

  const view = render(<GlobalError error={error} reset={reset} />);

  expect(captureException).toHaveBeenCalledWith(error, {
    digest: "digest-1",
    surface: "global-error-boundary",
  });

  fireEvent.click(view.getByRole("button", { name: "Retry" }));

  expect(reset).toHaveBeenCalledTimes(1);
  expect(view.getByText("Something broke.")).not.toBeNull();
});
