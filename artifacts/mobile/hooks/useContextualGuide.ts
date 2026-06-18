import { useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Shows a contextual guide overlay the first time the user interacts
 * with a key action. State is persisted in AsyncStorage so the guide
 * appears only once per device.
 *
 * Usage:
 *   const guide = useContextualGuide("chronopedia");
 *   // On button press:
 *   guide.trigger(() => doTheActualAction());
 *   // In JSX:
 *   <ContextualGuideModal visible={guide.visible} onConfirm={guide.confirm} onClose={guide.close} ... />
 */
export function useContextualGuide(key: string) {
  const [visible, setVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const trigger = useCallback(
    async (action: () => void) => {
      try {
        const seen = await AsyncStorage.getItem(`guide_seen_${key}`);
        if (seen) {
          action();
        } else {
          setPendingAction(() => action);
          setVisible(true);
        }
      } catch {
        action();
      }
    },
    [key],
  );

  const confirm = useCallback(async () => {
    try {
      await AsyncStorage.setItem(`guide_seen_${key}`, "1");
    } catch {
      /* ignore storage errors */
    }
    setVisible(false);
    setPendingAction((prev) => {
      if (prev) setTimeout(prev, 50);
      return null;
    });
  }, [key]);

  const close = useCallback(() => {
    setVisible(false);
    setPendingAction(null);
  }, []);

  return { visible, trigger, confirm, close };
}
