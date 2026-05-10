import { Modal, Pressable, Text, TextInput, View, FlatList } from "react-native";
import { useState } from "react";
import { ChevronDown, X } from "lucide-react-native";
import { getAddressFormat, AddressFieldKey } from "@/lib/country-formats";
import { colors, radius, space } from "@/lib/theme";

export interface AddressValue {
  address:  string;
  city:     string;
  state:    string;
  postcode: string;
  country:  string;
}

const COMMON_COUNTRIES = ["Australia", "United States", "United Kingdom", "New Zealand", "Canada", "Ireland"];

/** Per-country address form. Uses the same FORMATS table as the web so
 *  field labels (Suburb vs City) and state pickers stay in sync. */
export function AddressFields({
  value, onChange, businessCountry,
}: {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  /** Initial country if value.country is empty — falls back to the business default. */
  businessCountry?: string | null;
}) {
  const country = value.country || businessCountry || "Australia";
  const fmt = getAddressFormat(country);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);

  const update = (k: AddressFieldKey, v: string) => onChange({ ...value, [k]: v });

  const renderField = (key: AddressFieldKey) => {
    const label = fmt.labels[key] ?? key;
    const placeholder = fmt.placeholders[key] ?? "";
    if (key === "state" && fmt.states && fmt.states.length > 0) {
      const selectedLabel = fmt.states.find((s) => s.value === value.state)?.label ?? value.state;
      return (
        <View key={key} style={{ gap: 6, flex: 1 }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>{label}</Text>
          <Pressable onPress={() => setStatePickerOpen(true)}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", gap: 6,
              padding: space.sm + 2, borderRadius: radius.md,
              backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
              opacity: pressed ? 0.85 : 1,
            })}>
            <Text style={{ flex: 1, fontSize: 14, color: value.state ? colors.text : colors.muted }}>
              {selectedLabel || placeholder || "Pick state"}
            </Text>
            <ChevronDown size={14} color={colors.muted} />
          </Pressable>
        </View>
      );
    }
    if (key === "country") {
      return (
        <View key={key} style={{ gap: 6 }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>{label}</Text>
          <Pressable onPress={() => setCountryPickerOpen(true)}
            style={({ pressed }) => ({
              flexDirection: "row", alignItems: "center", gap: 6,
              padding: space.sm + 2, borderRadius: radius.md,
              backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
              opacity: pressed ? 0.85 : 1,
            })}>
            <Text style={{ flex: 1, fontSize: 14, color: value.country ? colors.text : colors.muted }}>
              {value.country || placeholder || "Pick country"}
            </Text>
            <ChevronDown size={14} color={colors.muted} />
          </Pressable>
        </View>
      );
    }
    return (
      <View key={key} style={{ gap: 6, flex: 1 }}>
        <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700" }}>{label}</Text>
        <TextInput
          value={value[key]}
          onChangeText={(v) => update(key, v)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType={key === "postcode" ? "numbers-and-punctuation" : "default"}
          style={{
            padding: space.sm + 2, borderRadius: radius.md,
            backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
            color: colors.text, fontSize: 14,
          }}
        />
      </View>
    );
  };

  // Pair city+state on one row when both exist; postcode+country on another
  const ordered = fmt.fields;
  const rows: Array<AddressFieldKey[]> = [];
  let buffer: AddressFieldKey[] = [];
  for (const k of ordered) {
    if (k === "address") rows.push([k]);
    else if (k === "country") {
      if (buffer.length > 0) rows.push(buffer);
      buffer = [];
      rows.push([k]);
    } else {
      buffer.push(k);
      if (buffer.length === 2) { rows.push(buffer); buffer = []; }
    }
  }
  if (buffer.length > 0) rows.push(buffer);

  return (
    <>
      {rows.map((row, i) =>
        row.length === 1
          ? renderField(row[0])
          : (
            <View key={i} style={{ flexDirection: "row", gap: space.sm }}>
              {row.map((k) => renderField(k))}
            </View>
          )
      )}

      {fmt.states && (
        <Modal visible={statePickerOpen} animationType="slide" onRequestClose={() => setStatePickerOpen(false)}>
          <View style={{ flex: 1, backgroundColor: colors.canvas, padding: space.lg, paddingTop: space.xl }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: space.md }}>
              <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: colors.text }}>Pick a state</Text>
              <Pressable onPress={() => setStatePickerOpen(false)} hitSlop={8}><X size={22} color={colors.text} /></Pressable>
            </View>
            <FlatList
              data={fmt.states}
              keyExtractor={(s) => s.value}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.hairline }} />}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { update("state", item.value); setStatePickerOpen(false); }}
                  style={({ pressed }) => ({ paddingVertical: space.md, opacity: pressed ? 0.6 : 1 })}>
                  <Text style={{ fontSize: 16, color: colors.text }}>{item.label}</Text>
                </Pressable>
              )}
            />
          </View>
        </Modal>
      )}

      <Modal visible={countryPickerOpen} animationType="slide" onRequestClose={() => setCountryPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.canvas, padding: space.lg, paddingTop: space.xl }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: space.md }}>
            <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: colors.text }}>Pick a country</Text>
            <Pressable onPress={() => setCountryPickerOpen(false)} hitSlop={8}><X size={22} color={colors.text} /></Pressable>
          </View>
          <FlatList
            data={COMMON_COUNTRIES}
            keyExtractor={(c) => c}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.hairline }} />}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  const next: AddressValue = { ...value, country: item };
                  // Reset state when switching to a country with a different state preset
                  const oldFmt = getAddressFormat(value.country);
                  const newFmt = getAddressFormat(item);
                  if (oldFmt !== newFmt) next.state = "";
                  onChange(next);
                  setCountryPickerOpen(false);
                }}
                style={({ pressed }) => ({ paddingVertical: space.md, opacity: pressed ? 0.6 : 1 })}>
                <Text style={{ fontSize: 16, color: colors.text }}>{item}</Text>
              </Pressable>
            )}
            ListFooterComponent={
              <View style={{ paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.hairline, marginTop: space.md }}>
                <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: "700", marginBottom: 6 }}>
                  Other
                </Text>
                <TextInput
                  value={value.country}
                  onChangeText={(v) => update("country", v)}
                  placeholder="Type a country"
                  placeholderTextColor={colors.muted}
                  onSubmitEditing={() => setCountryPickerOpen(false)}
                  style={{
                    padding: space.sm + 2, borderRadius: radius.md,
                    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline,
                    color: colors.text, fontSize: 14,
                  }}
                />
              </View>
            }
          />
        </View>
      </Modal>
    </>
  );
}
