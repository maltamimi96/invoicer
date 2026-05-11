import { useEffect, useState, useMemo } from "react";
import { FlatList, Pressable, Text, TextInput, View, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Search, Phone, Mail, Plus, Users } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useActiveBusiness } from "@/lib/active-business";
import { colors, radius, space } from "@/lib/theme";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRow } from "@/components/Skeleton";
import { BrandedRefresh } from "@/components/BrandedRefresh";
import { FadeIn } from "@/components/FadeIn";

interface CustomerRow {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
}

export default function CustomersList() {
  const router = useRouter();
  const { active } = useActiveBusiness();
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const load = async () => {
    if (!active) return;
    const { data } = await supabase
      .from("customers")
      .select("id, name, company, email, phone")
      .eq("business_id", active.id)
      .eq("archived", false)
      .order("name", { ascending: true }).limit(100);
    setCustomers((data ?? []) as CustomerRow[]);
  };

  useEffect(() => { load(); }, [active?.id]);

  const filtered = useMemo(() => {
    if (!customers) return null;
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q));
  }, [customers, query]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.sm }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Customers</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 12, color: colors.muted }}>{customers?.length ?? 0}</Text>
        <Pressable
          onPress={() => router.push("/customers/new" as never)}
          hitSlop={8}
          style={({ pressed }) => ({
            marginLeft: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
            backgroundColor: pressed ? "#0d6e6a" : colors.primary,
            flexDirection: "row", alignItems: "center", gap: 4,
          })}
        >
          <Plus size={14} color="#fff" />
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>Add</Text>
        </Pressable>
      </View>

      {/* Search bar */}
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <View style={{
          flexDirection: "row", alignItems: "center", gap: space.sm,
          paddingHorizontal: space.md, paddingVertical: 8,
          borderRadius: radius.lg, backgroundColor: colors.card,
          borderWidth: 1, borderColor: colors.hairline,
        }}>
          <Search size={16} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, email, phone…"
            placeholderTextColor={colors.muted}
            style={{ flex: 1, fontSize: 14, color: colors.text }}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      </View>

      {customers === null ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: 4 }}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} avatar />)}
        </View>
      ) : filtered!.length === 0 ? (
        <EmptyState
          icon={<Users size={32} color="#fff" />}
          title={query ? "No matches" : "No customers yet"}
          subtitle={query ? "Try a different search." : "Add your first customer to start sending quotes and invoices."}
          ctaLabel={query ? undefined : "Add customer"}
          onPressCta={query ? undefined : () => router.push("/customers/new" as never)}
          gradient="primary"
        />
      ) : (
        <FlatList
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          data={filtered!}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<BrandedRefresh refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          renderItem={({ item, index }) => (
            <FadeIn delay={Math.min(index * 30, 240)}>
              <CustomerCard customer={item} onPress={() => router.push(`/customers/${item.id}` as never)} />
            </FadeIn>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function CustomerCard({ customer, onPress }: { customer: CustomerRow; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: space.md,
        padding: space.md, borderRadius: radius.lg,
        backgroundColor: pressed ? colors.muted : colors.card,
        borderWidth: 1, borderColor: colors.hairline,
      })}
    >
      <Avatar name={customer.name} size={42} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>{customer.name}</Text>
        {customer.company && <Text numberOfLines={1} style={{ fontSize: 12, color: colors.muted }}>{customer.company}</Text>}
      </View>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {customer.phone && (
          <Pressable onPress={(e) => { e.stopPropagation(); Linking.openURL(`tel:${customer.phone!.replace(/\s/g, "")}`); }} hitSlop={8} style={{ padding: 6 }}>
            <Phone size={16} color={colors.muted} />
          </Pressable>
        )}
        {customer.email && (
          <Pressable onPress={(e) => { e.stopPropagation(); Linking.openURL(`mailto:${customer.email}`); }} hitSlop={8} style={{ padding: 6 }}>
            <Mail size={16} color={colors.muted} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}
