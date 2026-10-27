import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
export const colors = {
  bg: "#F4F5F0",
  card: "#FFFFFF",
  ink: "#142D27",
  muted: "#52665F",
  accent: "#155F47",
  line: "#D9E1DA",
  danger: "#A02D2D",
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
  return <View style={s.card}>{children}</View>;
}
export const s = StyleSheet.create({
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
    color: colors.accent,
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
  secondary: { backgroundColor: "#E5ECE5" },
  buttonText: { color: "white", fontWeight: "700", fontSize: 15 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" },
  big: { fontSize: 32, fontWeight: "700", color: colors.ink },
  error: { color: colors.danger, fontSize: 15, lineHeight: 22 },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 12,
    gap: 8,
  },
});
