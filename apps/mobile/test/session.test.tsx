import { test, expect, jest, beforeEach } from "@jest/globals";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react-native";
import App from "../App";
import * as SecureStore from "expo-secure-store";
import { request, RequestError } from "../src/api";
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
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue("stored-session");
  jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue();
});
test("expired stored session is removed and private state is not rendered", async () => {
  jest.mocked(request).mockRejectedValueOnce(new RequestError(401, "Expired"));
  render(<App />);
  await screen.findByText("Welcome back");
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("spendwise-session");
  expect(screen.queryByText("RECORDED BALANCE")).toBeNull();
});
test("offline logout clears the device credential and reports unconfirmed revocation", async () => {
  jest.mocked(request).mockResolvedValueOnce({
    email: "synthetic@example.test",
    ledger: null,
    overview: null,
  });
  render(<App />);
  await screen.findByText("Opening balance & account");
  jest.mocked(request).mockRejectedValueOnce(new Error("Offline"));
  fireEvent.press(screen.getByRole("button", { name: "☰ Menu" }));
  fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByText(/Server revocation could not be confirmed/);
  await waitFor(() => expect(SecureStore.deleteItemAsync).toHaveBeenCalled());
  expect(screen.queryByText("Opening balance & account")).toBeNull();
});

test("credential-removal failure remains visible and can be retried", async () => {
  jest.mocked(request).mockResolvedValueOnce({
    email: "synthetic@example.test",
    ledger: null,
    overview: null,
  });
  jest
    .mocked(SecureStore.deleteItemAsync)
    .mockRejectedValueOnce(new Error("storage unavailable"));
  render(<App />);
  await screen.findByText("Opening balance & account");
  jest.mocked(request).mockResolvedValueOnce(null);
  fireEvent.press(screen.getByRole("button", { name: "☰ Menu" }));
  fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByText(/Local credential removal failed/);
  expect(screen.queryByText("Opening balance & account")).toBeNull();
  fireEvent.press(
    screen.getByRole("button", { name: "Retry removing saved credential" }),
  );
  await screen.findByText("Local credential removed.");
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Retry removing saved credential" }),
    ).toBeNull(),
  );
});
