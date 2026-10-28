import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

type PaymentMethod = "darmin" | "crypto" | "fiat";

const UNIT_PRICE_DARMINS = 5;
const TAX_RATE = 0.02;
const formatDarmins = (amount: number) => `${amount.toFixed(2).replace(".", ",")} Д`;

const products = [
  { id: "30s-black", nameRu: "30 секунд · чёрная", nameEn: "30 seconds · black", durationRu: "30 секунд", durationEn: "30 seconds", descriptionRu: "Чёрная рамка и белый песок.", descriptionEn: "Black frame with white sand.", image: require("../assets/images/hourglasses/30s-black.jpg") },
  { id: "1m-blue", nameRu: "1 минута · синяя", nameEn: "1 minute · blue", durationRu: "1 минута", durationEn: "1 minute", descriptionRu: "Синяя рамка и голубой песок.", descriptionEn: "Blue frame with blue sand.", image: require("../assets/images/hourglasses/1m-blue.jpg") },
  { id: "2m-pink", nameRu: "2 минуты · розовая", nameEn: "2 minutes · pink", durationRu: "2 минуты", durationEn: "2 minutes", descriptionRu: "Розовая рамка и розовый песок.", descriptionEn: "Pink frame with pink sand.", image: require("../assets/images/hourglasses/2m-pink.jpg") },
  { id: "3m-yellow", nameRu: "3 минуты · жёлтая", nameEn: "3 minutes · yellow", durationRu: "3 минуты", durationEn: "3 minutes", descriptionRu: "Жёлтая рамка и золотистый песок.", descriptionEn: "Yellow frame with golden sand.", image: require("../assets/images/hourglasses/3m-yellow.jpg") },
  { id: "3m-green", nameRu: "3 минуты · зелёная", nameEn: "3 minutes · green", durationRu: "3 минуты", durationEn: "3 minutes", descriptionRu: "Зелёная рамка и жёлтый песок.", descriptionEn: "Green frame with yellow sand.", image: require("../assets/images/hourglasses/3m-green.jpg") },
  { id: "5m-green-light", nameRu: "5 минут · зелёная 1", nameEn: "5 minutes · green 1", durationRu: "5 минут", durationEn: "5 minutes", descriptionRu: "Зелёная рамка и светло-зелёный песок.", descriptionEn: "Green frame with light green sand.", image: require("../assets/images/hourglasses/5m-green-light.jpg") },
  { id: "5m-green-dark", nameRu: "5 минут · зелёная 2", nameEn: "5 minutes · green 2", durationRu: "5 минут", durationEn: "5 minutes", descriptionRu: "Зелёная рамка и насыщенно-зелёный песок.", descriptionEn: "Green frame with deep green sand.", image: require("../assets/images/hourglasses/5m-green-dark.jpg") },
  { id: "10m-red", nameRu: "10 минут · красная", nameEn: "10 minutes · red", durationRu: "10 минут", durationEn: "10 minutes", descriptionRu: "Красная рамка и красный песок.", descriptionEn: "Red frame with red sand.", image: require("../assets/images/hourglasses/10m-red.jpg") },
];

const paymentMethods: { id: PaymentMethod; nameRu: string; nameEn: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
  { id: "darmin", nameRu: "Дармины", nameEn: "Darmins", icon: "clock" },
  { id: "crypto", nameRu: "Крипто", nameEn: "Crypto", icon: "box" },
  { id: "fiat", nameRu: "Фиат", nameEn: "Fiat", icon: "credit-card" },
];

export function SandTimerCatalog({ visible }: { visible: boolean }) {
  const colors = useColors();
  const { lang } = useLanguage();
  const isRu = lang === "ru";
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("darmin");
  const [showPreview, setShowPreview] = useState(false);
  const itemCount = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const subtotal = itemCount * UNIT_PRICE_DARMINS;
  const tax = Number((subtotal * TAX_RATE).toFixed(2));
  const total = subtotal + tax;
  const styles = makeStyles(colors);

  const setQuantity = (id: string, delta: number) => {
    setShowPreview(false);
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, (current[id] ?? 0) + delta),
    }));
  };

  return (
    <View style={[styles.root, !visible && styles.hidden]} testID="sand-timer-catalog">
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <Feather name="shopping-bag" size={18} color={colors.primary} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>{isRu ? "Каталог песочных часов" : "Hourglass catalog"}</Text>
          <Text style={styles.subtitle}>{isRu ? "8 моделей · каждая по 5 Д + налог 2%" : "8 models · 5 Д each + 2% tax"}</Text>
        </View>
        <View style={styles.cartCount} testID="sand-cart-count">
          <Feather name="shopping-bag" size={14} color={colors.primary} />
          <Text style={styles.cartCountText}>{itemCount}</Text>
        </View>
      </View>

      <View style={styles.demoNote}>
        <Feather name="info" size={15} color={colors.primary} />
        <Text style={styles.demoText}>
          {isRu
            ? "Демонстрационный магазин: заказ не создаётся, оплата и списание не выполняются."
            : "Demo shop: no order is created and no payment or charge is made."}
        </Text>
      </View>

      <View style={styles.products}>
        {products.map((product) => {
          const quantity = quantities[product.id] ?? 0;
          return (
            <View key={product.id} style={styles.productCard} testID={`sand-product-${product.id}`}>
              <Image
                source={product.image}
                style={styles.productImage}
                resizeMode="contain"
                accessibilityLabel={isRu ? product.nameRu : product.nameEn}
              />
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{isRu ? product.nameRu : product.nameEn}</Text>
                <Text style={styles.duration}>{isRu ? product.durationRu : product.durationEn}</Text>
                <Text style={styles.description}>{isRu ? product.descriptionRu : product.descriptionEn}</Text>
                <Text style={styles.price}>{isRu ? "5 Д + 2% налог" : "5 Д + 2% tax"}</Text>
                <Text style={styles.priceAfterTax}>
                  {isRu ? "Итого" : "Total"}: {formatDarmins(UNIT_PRICE_DARMINS * (1 + TAX_RATE))}
                </Text>
                {quantity === 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setQuantity(product.id, 1)}
                    style={styles.addButton}
                    testID={`sand-add-${product.id}`}
                  >
                    <Feather name="plus" size={15} color={colors.primaryForeground} />
                    <Text style={styles.addButtonText}>{isRu ? "В корзину" : "Add to cart"}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.quantityControl} testID={`sand-quantity-${product.id}`}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isRu ? "Уменьшить количество" : "Decrease quantity"}
                      onPress={() => setQuantity(product.id, -1)}
                      style={styles.quantityButton}
                    >
                      <Feather name="minus" size={15} color={colors.foreground} />
                    </Pressable>
                    <Text style={styles.quantityText}>{quantity}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isRu ? "Увеличить количество" : "Increase quantity"}
                      onPress={() => setQuantity(product.id, 1)}
                      style={styles.quantityButton}
                    >
                      <Feather name="plus" size={15} color={colors.foreground} />
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.checkout} testID="sand-cart">
        <Text style={styles.checkoutTitle}>{isRu ? "Корзина" : "Cart"}</Text>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{isRu ? "Товары" : "Items"}</Text>
          <Text style={styles.totalValue} testID="sand-subtotal">{formatDarmins(subtotal)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{isRu ? "Налог · 2%" : "Tax · 2%"}</Text>
          <Text style={styles.totalValue} testID="sand-tax">{formatDarmins(tax)}</Text>
        </View>
        <View style={[styles.totalRow, styles.grandTotal]}>
          <Text style={styles.grandTotalLabel}>{isRu ? "Итого" : "Total"}</Text>
          <Text style={styles.grandTotalValue} testID="sand-total">{formatDarmins(total)}</Text>
        </View>

        <Text style={styles.paymentTitle}>{isRu ? "Способ оплаты · демо" : "Payment method · demo"}</Text>
        <View style={styles.paymentRow}>
          {paymentMethods.map((method) => {
            const selected = paymentMethod === method.id;
            return (
              <Pressable
                key={method.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => { setPaymentMethod(method.id); setShowPreview(false); }}
                style={[styles.paymentButton, selected && styles.paymentButtonSelected]}
                testID={`sand-payment-${method.id}`}
              >
                <Feather name={method.icon} size={15} color={selected ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.paymentText, selected && styles.paymentTextSelected]}>
                  {isRu ? method.nameRu : method.nameEn}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {showPreview && (
          <View style={styles.previewStatus} accessibilityRole="summary" testID="sand-preview-status">
            <Feather name="check-circle" size={16} color={colors.success} />
            <Text style={styles.previewText}>
              {isRu
                ? `Предпросмотр: ${itemCount} шт. на ${formatDarmins(total)}. Заказ не создан.`
                : `Preview: ${itemCount} item(s), ${formatDarmins(total)} total. No order was created.`}
            </Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          disabled={itemCount === 0}
          onPress={() => setShowPreview(true)}
          style={[styles.checkoutButton, itemCount === 0 && styles.checkoutButtonDisabled]}
          testID="sand-preview-checkout"
        >
          <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
          <Text style={styles.checkoutButtonText}>{isRu ? "Посмотреть заказ" : "Preview order"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { gap: 14 },
    hidden: { display: "none" },
    heading: { flexDirection: "row", alignItems: "center", gap: 10 },
    headingIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.goldGlow },
    headingCopy: { flex: 1, gap: 3 },
    title: { color: colors.foreground, fontSize: 17, fontWeight: "700" },
    subtitle: { color: colors.mutedForeground, fontSize: 11 },
    cartCount: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.card },
    cartCountText: { color: colors.foreground, fontSize: 12, fontWeight: "700" },
    demoNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 11, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.primary + "55", backgroundColor: colors.goldGlow },
    demoText: { flex: 1, color: colors.mutedForeground, fontSize: 11, lineHeight: 16 },
    products: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
    productCard: { width: "48%", overflow: "hidden", borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    productImage: { width: "100%", aspectRatio: 1, backgroundColor: "#FFFFFF" },
    productInfo: { padding: 10, gap: 5 },
    productName: { minHeight: 34, color: colors.foreground, fontSize: 13, fontWeight: "700" },
    duration: { color: colors.primary, fontSize: 11, fontWeight: "600" },
    description: { minHeight: 30, color: colors.mutedForeground, fontSize: 10, lineHeight: 14 },
    price: { color: colors.foreground, fontSize: 11, fontWeight: "600" },
    priceAfterTax: { color: colors.primary, fontSize: 11, fontWeight: "700" },
    addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 34, marginTop: 3, borderRadius: 9, backgroundColor: colors.primary },
    addButtonText: { color: colors.primaryForeground, fontSize: 11, fontWeight: "700" },
    quantityControl: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 34, marginTop: 3, borderRadius: 9, borderWidth: 1, borderColor: colors.border },
    quantityButton: { width: 38, height: 34, alignItems: "center", justifyContent: "center" },
    quantityText: { color: colors.foreground, fontSize: 13, fontWeight: "700" },
    checkout: { gap: 11, padding: 14, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    checkoutTitle: { marginBottom: 1, color: colors.foreground, fontSize: 16, fontWeight: "700" },
    totalRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
    totalLabel: { color: colors.mutedForeground, fontSize: 12 },
    totalValue: { color: colors.foreground, fontSize: 12, fontVariant: ["tabular-nums"] },
    grandTotal: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    grandTotalLabel: { color: colors.foreground, fontSize: 14, fontWeight: "700" },
    grandTotalValue: { color: colors.primary, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
    paymentTitle: { marginTop: 3, color: colors.foreground, fontSize: 12, fontWeight: "600" },
    paymentRow: { flexDirection: "row", gap: 8 },
    paymentButton: { flex: 1, minHeight: 54, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 4, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
    paymentButtonSelected: { borderColor: colors.primary, backgroundColor: colors.goldGlow },
    paymentText: { color: colors.mutedForeground, fontSize: 10, fontWeight: "600" },
    paymentTextSelected: { color: colors.primary },
    previewStatus: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 10, backgroundColor: colors.success + "18" },
    previewText: { flex: 1, color: colors.foreground, fontSize: 11, lineHeight: 16 },
    checkoutButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44, borderRadius: 11, backgroundColor: colors.primary },
    checkoutButtonDisabled: { opacity: 0.45 },
    checkoutButtonText: { color: colors.primaryForeground, fontSize: 13, fontWeight: "700" },
  });
}
