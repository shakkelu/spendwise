import { test, expect, jest, beforeEach } from "@jest/globals";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react-native";
import { Alert } from "react-native";
import App from "../App";
import * as SecureStore from "expo-secure-store";
import { request } from "../src/api";
import {
  readDevice,
  writeDevice,
  emptyDevice,
  writeAppearance,
  type DeviceState,
} from "../src/storage";
import {
  createLedger,
  mutateLedger,
  overview,
} from "../../../services/api/src/finance";
import { spendingData } from "../src/Monitor";
jest.mock(
  "react-native-safe-area-context",
  () =>
    jest.requireActual<{ default: object }>(
      "react-native-safe-area-context/jest/mock",
    ).default,
);
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000001",
}));
jest.mock("../src/api", () => ({
  ...jest.requireActual<object>("../src/api"),
  request: jest.fn(),
}));
jest.mock("../src/storage", () => ({
  emptyDevice: () => ({
    schema: 1,
    revision: 0,
    guest: false,
    ledger: null,
    signup: null,
  }),
  readDevice: jest.fn(),
  writeDevice: jest.fn(),
  readAppearance: jest.fn(async () => "system"),
  writeAppearance: jest.fn(async () => {}),
}));
const ledger = createLedger({
  currency: "USD",
  timezone: "UTC",
  openingAmount: "100",
  openingDate: "2026-01-01",
});
let state: DeviceState;
beforeEach(() => {
  jest.clearAllMocks();
  state = { ...emptyDevice(), guest: true, ledger };
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue();
  jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue();
  jest.mocked(readDevice).mockImplementation(async () => state);
  jest.mocked(writeDevice).mockImplementation(async (prev, changes) => {
    state = { ...prev, ...changes, revision: prev.revision + 1 };
    return state;
  });
});
async function connect() {
  await screen.findByText("RECORDED BALANCE");
  fireEvent.press(screen.getByRole("button", { name: "☰ Menu" }));
  fireEvent.press(
    screen.getByRole("button", { name: "Create account or sign in" }),
  );
}
function credentials() {
  fireEvent.changeText(screen.getByLabelText("Email"), "new@example.test");
  fireEvent.changeText(
    screen.getByLabelText("Password (15–128 characters)"),
    "synthetic password 123",
  );
}
test("local records load offline, bottom tabs and drawer work, and theme persists", async () => {
  render(<App />);
  await screen.findByText("RECORDED BALANCE");
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  fireEvent.press(screen.getByRole("tab", { name: "Monitor" }));
  await screen.findByText("MONTHLY EXPENDITURE");
  fireEvent.press(screen.getByRole("button", { name: "☰ Menu" }));
  fireEvent.press(screen.getByRole("button", { name: "Dark mode" }));
  await waitFor(() => expect(writeAppearance).toHaveBeenCalledWith("dark"));
  await screen.findByRole("button", { name: "✓ Dark mode" });
  fireEvent.press(screen.getByRole("button", { name: "Follow device" }));
  await waitFor(() => expect(writeAppearance).toHaveBeenCalledWith("system"));
});
test("device transactions save without network requests and survive a component restart", async () => {
  const app = render(<App />);
  await screen.findByText("RECORDED BALANCE");
  fireEvent.press(screen.getByRole("button", { name: "Record transaction" }));
  fireEvent.changeText(screen.getByLabelText("Positive amount (USD)"), "10.25");
  fireEvent.press(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("USD 89.75");
  expect(state.ledger!.transactions).toHaveLength(1);
  expect(request).not.toHaveBeenCalled();
  app.unmount();
  render(<App />);
  await screen.findByText("USD 89.75");
});
test("cancelled existing-account replacement never authenticates or erases local data", async () => {
  const alert = jest
    .spyOn(Alert, "alert")
    .mockImplementation((_title, _message, buttons) =>
      buttons?.find((x) => x.text === "Cancel")?.onPress?.(),
    );
  render(<App />);
  await connect();
  credentials();
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(alert).toHaveBeenCalled());
  expect(request).not.toHaveBeenCalled();
  expect(writeDevice).not.toHaveBeenCalled();
  expect(state.ledger).toEqual(ledger);
  alert.mockRestore();
});
test("confirmed existing login retains local data if cloud loading fails", async () => {
  const alert = jest
    .spyOn(Alert, "alert")
    .mockImplementation((_title, _message, buttons) =>
      buttons?.find((x) => x.text === "Replace and sign in")?.onPress?.(),
    );
  jest
    .mocked(request)
    .mockResolvedValueOnce({ token: "new-session" })
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce(null);
  render(<App />);
  await connect();
  credentials();
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Offline");
  expect(state.ledger).toEqual(ledger);
  expect(writeDevice).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  alert.mockRestore();
});
test("successful confirmed replacement clears device records only after cloud load", async () => {
  const alert = jest
    .spyOn(Alert, "alert")
    .mockImplementation((_title, _message, buttons) =>
      buttons?.find((x) => x.text === "Replace and sign in")?.onPress?.(),
    );
  jest
    .mocked(request)
    .mockResolvedValueOnce({ token: "new-session" })
    .mockResolvedValueOnce({
      email: "cloud@example.test",
      ledger,
      overview: overview(ledger, "2026-10"),
    });
  render(<App />);
  await connect();
  credentials();
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("CLOUD ACCOUNT");
  expect(state.ledger).toBeNull();
  expect(state.guest).toBe(false);
  expect(request).not.toHaveBeenCalledWith(
    "/account/import",
    expect.anything(),
    expect.anything(),
  );
  alert.mockRestore();
});
test("new-account transfer survives failed response and retries the identical frozen ledger", async () => {
  state.signup = {
    email: "new@example.test",
    key: "a".repeat(64),
    upload: null,
  };
  jest
    .mocked(request)
    .mockResolvedValueOnce({ token: "session-one" })
    .mockRejectedValueOnce(new Error("Transfer interrupted"))
    .mockResolvedValueOnce(null);
  render(<App />);
  await connect();
  credentials();
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Transfer interrupted");
  expect(state.ledger).toEqual(ledger);
  expect(state.signup!.upload).toEqual(ledger);
  const first = jest
    .mocked(request)
    .mock.calls.find((x) => x[0] === "/account/import")![2];
  jest
    .mocked(request)
    .mockResolvedValueOnce({ token: "session-two" })
    .mockResolvedValueOnce({ imported: true })
    .mockResolvedValueOnce({
      email: "new@example.test",
      ledger,
      overview: overview(ledger, "2026-10"),
    });
  credentials();
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("CLOUD ACCOUNT");
  const calls = jest
    .mocked(request)
    .mock.calls.filter((x) => x[0] === "/account/import");
  expect(calls[1]![2]).toEqual(first);
  expect(state.ledger).toBeNull();
  expect(state.signup).toBeNull();
});
test("corrupt storage never silently resets user records", async () => {
  jest.mocked(readDevice).mockRejectedValueOnce(new Error("corrupt"));
  render(<App />);
  await screen.findByText(/Device storage could not be read/);
  expect(writeDevice).not.toHaveBeenCalled();
});
test("monitor aggregates actual spending, excludes projections, and includes zero months", () => {
  const actual = mutateLedger(ledger, {
    action: "transaction-create",
    id: "00000000-0000-4000-8000-000000000002",
    type: "expense",
    amount: "0.29",
    date: "2026-01-02",
    category: "Food",
    description: "",
  });
  const projected = mutateLedger(actual, {
    action: "expectation-create",
    id: "00000000-0000-4000-8000-000000000003",
    type: "expense",
    amount: "100",
    date: "2026-01-03",
    category: "Food",
    description: "",
  });
  const data = spendingData(projected, "2026-01-31", "2026-01");
  expect(data.categories).toEqual([{ name: "Food", amount: 29 }]);
  expect(data.months).toHaveLength(6);
  expect(data.months[5]!.expense).toBe(29);
  expect(data.months[0]!.expense).toBe(0);
});
test("new guest choice creates durable local mode without any API request", async () => {
  state = emptyDevice();
  render(<App />);
  await screen.findByText("Welcome back");
  await act(async () =>
    fireEvent.press(
      screen.getByRole("button", { name: "Continue without an account" }),
    ),
  );
  await screen.findByText("Opening balance & account");
  expect(state.guest).toBe(true);
  expect(request).not.toHaveBeenCalled();
});

test("credential persistence failure never deletes guest records", async () => {
  const alert = jest
    .spyOn(Alert, "alert")
    .mockImplementation((_title, _message, buttons) =>
      buttons?.find((x) => x.text === "Replace and sign in")?.onPress?.(),
    );
  jest
    .mocked(request)
    .mockResolvedValueOnce({ token: "new-session" })
    .mockResolvedValueOnce({
      email: "cloud@example.test",
      ledger,
      overview: overview(ledger, "2026-10"),
    })
    .mockResolvedValueOnce(null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockRejectedValueOnce(new Error("Secure storage failed"));
  render(<App />);
  await connect();
  credentials();
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Secure storage failed");
  expect(writeDevice).not.toHaveBeenCalled();
  expect(state.ledger).toEqual(ledger);
  alert.mockRestore();
});
test("cleanup failure revokes the saved credential and keeps local records", async () => {
  const alert = jest
    .spyOn(Alert, "alert")
    .mockImplementation((_title, _message, buttons) =>
      buttons?.find((x) => x.text === "Replace and sign in")?.onPress?.(),
    );
  jest
    .mocked(request)
    .mockResolvedValueOnce({ token: "new-session" })
    .mockResolvedValueOnce({
      email: "cloud@example.test",
      ledger,
      overview: overview(ledger, "2026-10"),
    })
    .mockResolvedValueOnce(null);
  jest
    .mocked(writeDevice)
    .mockRejectedValueOnce(new Error("Device write failed"));
  render(<App />);
  await connect();
  credentials();
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Device write failed");
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("spendwise-session");
  expect(state.ledger).toEqual(ledger);
  alert.mockRestore();
});
test("restart after interrupted cleanup preserves guest records and discards ambiguous session", async () => {
  jest
    .mocked(SecureStore.getItemAsync)
    .mockResolvedValueOnce("interrupted-session");
  render(<App />);
  await screen.findByText("RECORDED BALANCE");
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("spendwise-session");
  expect(request).not.toHaveBeenCalled();
  expect(writeDevice).not.toHaveBeenCalled();
});

test("an incomplete import acknowledgement cannot clear local records", async () => {
  state.signup = {
    email: "new@example.test",
    key: "a".repeat(64),
    upload: null,
  };
  jest
    .mocked(request)
    .mockResolvedValueOnce({ token: "new-session" })
    .mockResolvedValueOnce({ imported: false })
    .mockResolvedValueOnce(null);
  render(<App />);
  await connect();
  credentials();
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText(
    "Transfer confirmation was incomplete. Device records have been kept.",
  );
  expect(state.ledger).toEqual(ledger);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});
