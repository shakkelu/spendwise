import { createContext, useContext, useEffect, useState } from "react";
import { Appearance as NativeAppearance, useColorScheme } from "react-native";
import { readAppearance, writeAppearance, type Appearance } from "./storage";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
const light = {
  bg: "#F4F5F0",
  card: "#FFFFFF",
  ink: "#142D27",
  muted: "#52665F",
  accent: "#155F47",
  line: "#D9E1DA",
  danger: "#A02D2D",
  secondary: "#E5ECE5",
};
export function Button({
  title,
  onPress,
  disabled,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const { s, colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, secondary && s.secondary, disabled && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, secondary && { color: colors.ink }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { s, colors } = useTheme();
  return (
    <View style={{ gap: 6, marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={s.input}
        {...props}
      />
    </View>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  const { s } = useTheme();
  return <View style={s.card}>{children}</View>;
}
const styles = (colors: typeof light) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: {
      padding: 20,
      paddingBottom: 50,
      gap: 16,
      width: "100%",
      maxWidth: 640,
      alignSelf: "center",
    },
    brand: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: "800",
      letterSpacing: 2,
    },
    title: {
      color: colors.ink,
      fontSize: 30,
      fontWeight: "700",
      marginBottom: 6,
    },
    subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 18,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.line,
    },
    label: { color: colors.ink, fontWeight: "600", fontSize: 14 },
    input: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.ink,
      minHeight: 48,
    },
    button: {
      backgroundColor: colors.accent,
      padding: 14,
      borderRadius: 10,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    secondary: { backgroundColor: colors.secondary },
    buttonText: { color: "white", fontWeight: "700", fontSize: 15 },
    row: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
      alignItems: "center",
    },
    big: { fontSize: 32, fontWeight: "700", color: colors.ink },
    error: { color: colors.danger, fontSize: 15, lineHeight: 22 },
    divider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      paddingVertical: 12,
      gap: 8,
    },
  });

const darkColors = {
  ...light,
  bg: "#0C1518",
  card: "#152226",
  ink: "#F1F7F4",
  muted: "#A9BDB5",
  accent: "#267D61",
  line: "#30433E",
  danger: "#FFAAAA",
  secondary: "#263B34",
};
const Theme = createContext({
  s: styles(light),
  colors: light,
  dark: false,
  preference: "system" as Appearance,
  changeAppearance: async (_value: Appearance) => {},
});
export const useTheme = () => useContext(Theme);
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<Appearance>("system");
  const [error, setError] = useState("");
  useEffect(() => {
    void readAppearance()
      .then(setPreference)
      .catch(() => setError("Appearance preference could not be loaded."));
  }, []);
  useEffect(() => {
    NativeAppearance.setColorScheme(
      preference === "system" ? "unspecified" : preference,
    );
  }, [preference]);
  const dark =
    preference === "dark" || (preference === "system" && system === "dark");
  const colors = dark ? darkColors : light;
  const s = styles(colors);
  async function changeAppearance(value: Appearance) {
    try {
      await writeAppearance(value);
      setPreference(value);
      setError("");
    } catch {
      setError("Appearance preference could not be saved. Please try again.");
    }
  }
  return (
    <Theme.Provider value={{ s, colors, dark, preference, changeAppearance }}>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[s.error, { backgroundColor: colors.bg, padding: 12 }]}
        >
          {error}
        </Text>
      ) : null}
      {children}
    </Theme.Provider>
  );
}
