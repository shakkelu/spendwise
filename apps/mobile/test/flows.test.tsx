import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { AuthView } from "../src/AuthView";
import { SettingsForm, EntryForm } from "../src/forms";
import { decimal, request } from "../src/api";
jest.mock("../src/storage", () => ({
  emptyDevice: () => ({
    schema: 1,
    revision: 0,
    guest: false,
    ledger: null,
    signup: null,
  }),
  readDevice: jest.fn(async () => ({
    schema: 1,
    revision: 0,
    guest: false,
    ledger: null,
    signup: null,
  })),
  writeDevice: jest.fn(async (previous: object, changes: object) => ({
    ...previous,
    ...changes,
  })),
  readAppearance: jest.fn(async () => "system"),
  writeAppearance: jest.fn(async () => {}),
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000001",
}));
jest.mock("../src/api", () => ({
  ...jest.requireActual<object>("../src/api"),
  request: jest.fn(),
}));
const mockedRequest = jest.mocked(request);
beforeEach(() => {
  jest.clearAllMocks();
});
describe("mobile account flows", () => {
  test("sign in sends credentials and surfaces server errors", async () => {
    mockedRequest.mockRejectedValueOnce(new Error("Unable to sign in."));
    const onLogin = jest
      .fn<(token: string) => Promise<void>>()
      .mockResolvedValue();
    render(<AuthView onLogin={onLogin} />);
    fireEvent.changeText(screen.getByLabelText("Email"), "sample@example.test");
    fireEvent.changeText(
      screen.getByLabelText("Password (15–128 characters)"),
      "synthetic password 123",
    );
    fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Unable to sign in.");
    expect(onLogin).not.toHaveBeenCalled();
    mockedRequest.mockResolvedValueOnce({ token: "synthetic-session" });
    fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(onLogin).toHaveBeenCalledWith("synthetic-session"),
    );
  });
  test("opening setup explains date boundary and submits exact decimal text", async () => {
    const save = jest
      .fn<(body: Record<string, unknown>) => Promise<void>>()
      .mockResolvedValue();
    render(<SettingsForm ledger={null} busy={false} save={save} />);
    expect(screen.getByText(/START of this date/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText(/Opening balance/), "100.29");
    fireEvent.press(screen.getByRole("button", { name: "Set up my account" }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        openingAmount: "100.29",
        currency: "USD",
        timezone: "UTC",
      }),
    );
  });
  test("expectation form labels projections and retains ID across save retries", () => {
    const save = jest
      .fn<(body: Record<string, unknown>) => Promise<void>>()
      .mockResolvedValue();
    render(
      <EntryForm
        ledger={{
          currency: "KWD",
          timezone: "UTC",
          version: 0,
          openingAmount: 0,
          openingDate: "2026-01-01",
          transactions: [],
          expectations: [],
        }}
        asOf="2026-10-26"
        busy={false}
        expected
        save={save}
        cancel={() => {}}
      />,
    );
    expect(screen.getByText(/Projected, not guaranteed/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText(/Positive amount/), "1.234");
    fireEvent.press(screen.getByRole("button", { name: "Save" }));
    fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(save.mock.calls[0]![0]).toEqual(save.mock.calls[1]![0]);
    expect(save.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        amount: "1.234",
        action: "expectation-create",
      }),
    );
  });
  test("minor-unit display preserves zero and three decimal currencies", () => {
    expect(decimal(29, "USD")).toBe("0.29");
    expect(decimal(-1234, "KWD")).toBe("-1.234");
    expect(decimal(100, "JPY")).toBe("100");
  });
});
