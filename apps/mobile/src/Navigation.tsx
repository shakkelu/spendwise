import { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, useTheme } from "./ui";
export type Tab =
  "Overview" | "Transactions" | "Upcoming" | "Monitor" | "Forecast" | "Account";
export function BottomTabs({
  tab,
  select,
  disabled,
}: {
  tab: Tab;
  select: (tab: Tab) => void;
  disabled: boolean;
}) {
  const { s, colors } = useTheme();
  const tabs = [
    { name: "Overview", glyph: "◈" },
    { name: "Transactions", glyph: "↔" },
    { name: "Upcoming", glyph: "◷" },
    { name: "Monitor", glyph: "▥" },
  ] as const;
  return (
    <View
      style={{
        flexDirection: "row",
        borderTopWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.card,
      }}
    >
      {tabs.map((item) => (
        <Pressable
          key={item.name}
          accessibilityRole="tab"
          accessibilityLabel={item.name}
          accessibilityState={{ selected: tab === item.name, disabled }}
          disabled={disabled}
          onPress={() => select(item.name)}
          style={{
            flex: 1,
            paddingVertical: 12,
            minHeight: 64,
            alignItems: "center",
            gap: 4,
            backgroundColor: tab === item.name ? colors.secondary : colors.card,
          }}
        >
          <Text style={[s.label, { fontSize: 22 }]}>{item.glyph}</Text>
          <Text style={[s.label, { fontSize: 11, textAlign: "center" }]}>
            {item.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Drawer({
  open,
  close,
  select,
  guest,
  email,
  busy,
  logout,
  connect,
}: {
  open: boolean;
  close: () => void;
  select: (tab: Tab) => void;
  guest: boolean;
  email?: string;
  busy: boolean;
  logout: () => void;
  connect: () => void;
}) {
  const { s, colors, preference, changeAppearance } = useTheme();
  const slide = useRef(new Animated.Value(-360)).current;
  useEffect(() => {
    if (open) {
      slide.setValue(-360);
      Animated.timing(slide, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [open, slide]);
  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={close}
    >
      <View
        style={{ flex: 1, flexDirection: "row", backgroundColor: "#00000088" }}
      >
        <Animated.View
          style={{
            width: "85%",
            maxWidth: 360,
            transform: [{ translateX: slide }],
          }}
          accessibilityViewIsModal
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
            <ScrollView contentContainerStyle={{ padding: 22, gap: 18 }}>
              <Text style={s.brand}>SPENDWISE</Text>
              <Button secondary title="Close menu" onPress={close} />
              <Text style={s.label}>
                {guest ? "Device-only mode" : (email ?? "Cloud account")}
              </Text>
              {(
                [
                  "Overview",
                  "Transactions",
                  "Upcoming",
                  "Monitor",
                  "Forecast",
                  "Account",
                ] as Tab[]
              ).map((item) => (
                <Button
                  key={item}
                  secondary
                  disabled={busy}
                  title={item}
                  onPress={() => {
                    select(item);
                    close();
                  }}
                />
              ))}
              <Text style={s.label}>APPEARANCE</Text>
              {(["system", "light", "dark"] as const).map((value) => (
                <Button
                  key={value}
                  title={`${value === preference ? "✓ " : ""}${value === "system" ? "Follow device" : value === "light" ? "Light mode" : "Dark mode"}`}
                  secondary={value !== preference}
                  onPress={() => void changeAppearance(value)}
                />
              ))}
              {guest ? (
                <>
                  <Text style={s.subtitle}>
                    Only on this device. Removing the app or clearing its data
                    can erase your records.
                  </Text>
                  <Button
                    title="Create account or sign in"
                    disabled={busy}
                    onPress={() => {
                      close();
                      connect();
                    }}
                  />
                </>
              ) : (
                <Button
                  secondary
                  title="Sign out"
                  disabled={busy}
                  onPress={() => {
                    close();
                    logout();
                  }}
                />
              )}
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
        <Pressable
          style={{ flex: 1 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss menu"
          onPress={close}
        />
      </View>
    </Modal>
  );
}
