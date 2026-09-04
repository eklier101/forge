import { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { colors, spacing } from "../theme/colors";

export type CameraCaptureMode = "food" | "label" | "barcode";

type Props = {
  visible: boolean;
  /** Initial mode when opened */
  initialMode?: CameraCaptureMode;
  /** Restrict which modes the user can switch between */
  modes?: CameraCaptureMode[];
  title?: string;
  onClose: () => void;
  /** Photo capture (food / label). Base64 without data: prefix. */
  onCapture?: (payload: { base64: string; mode: CameraCaptureMode; barcode?: string }) => void;
  /** Barcode-only scan */
  onBarcode?: (barcode: string) => void;
};

const MODE_LABELS: Record<CameraCaptureMode, string> = {
  food: "Food",
  label: "Label",
  barcode: "Barcode",
};

/**
 * In-app camera — never opens the system camera app / gallery.
 * Food & Label take a still; Barcode uses live scanning. Label also listens for barcodes.
 */
export function InAppCameraModal({
  visible,
  initialMode = "food",
  modes = ["food", "label", "barcode"],
  title,
  onClose,
  onCapture,
  onBarcode,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<CameraCaptureMode>(initialMode);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (visible) {
      setMode(initialMode);
      setLocked(false);
      setBusy(false);
    }
  }, [visible, initialMode]);

  useEffect(() => {
    if (visible && permission && !permission.granted) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  function handleBarcode(result: BarcodeScanningResult) {
    if (locked) return;
    const raw = result.data?.trim();
    if (!raw || raw.length < 8) return;
    setLocked(true);
    if (mode === "barcode") {
      onBarcode?.(raw);
      onClose();
      return;
    }
    // Label mode: barcode found while framing — treat as OFF lookup hint after capture,
    // or immediately if user is in barcode mode. For label, pass through onBarcode then close.
    if (mode === "label") {
      onBarcode?.(raw);
      onClose();
    }
  }

  async function takePhoto() {
    if (!cameraRef.current || busy || mode === "barcode") return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.55,
        base64: true,
        shutterSound: false,
        // Keep out of the system gallery / media store
        exif: false,
      });
      const b64 = photo?.base64;
      if (!b64) {
        setBusy(false);
        return;
      }
      onCapture?.({ base64: b64, mode });
      onClose();
    } catch {
      setBusy(false);
    }
  }

  if (Platform.OS === "web") {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.wrap}>
          <View style={styles.card}>
            <Text style={styles.title}>Camera</Text>
            <Text style={styles.body}>In-app camera is Android/iOS only.</Text>
            <Pressable style={styles.btn} onPress={onClose}>
              <Text style={styles.btnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.cameraRoot}>
        {!permission?.granted ? (
          <View style={styles.card}>
            <Text style={styles.title}>Camera permission</Text>
            <Text style={styles.body}>Forge needs the camera for meals and progress photos.</Text>
            <Pressable style={styles.btn} onPress={() => void requestPermission()}>
              <Text style={styles.btnText}>Allow camera</Text>
            </Pressable>
            <Pressable style={styles.ghost} onPress={onClose}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={
                mode === "barcode" || mode === "label"
                  ? { barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "qr"] }
                  : undefined
              }
              onBarcodeScanned={
                mode === "barcode" || mode === "label" ? (locked ? undefined : handleBarcode) : undefined
              }
            />
            <View style={styles.overlay}>
              <Text style={styles.overlayTitle}>
                {title ??
                  (mode === "barcode"
                    ? "Scan barcode"
                    : mode === "label"
                      ? "Point at label or barcode"
                      : "Photograph your meal")}
              </Text>

              {modes.length > 1 ? (
                <View style={styles.modeRow}>
                  {modes.map((m) => (
                    <Pressable
                      key={m}
                      style={[styles.modeChip, mode === m && styles.modeChipOn]}
                      onPress={() => {
                        setMode(m);
                        setLocked(false);
                      }}
                    >
                      <Text style={[styles.modeChipText, mode === m && styles.modeChipTextOn]}>
                        {MODE_LABELS[m]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {mode === "barcode" || mode === "label" ? <View style={styles.frame} /> : <View style={styles.frameTall} />}

              <View style={styles.bottom}>
                {mode !== "barcode" ? (
                  <Pressable
                    style={[styles.shutter, busy && { opacity: 0.5 }]}
                    onPress={() => void takePhoto()}
                    disabled={busy}
                  >
                    <View style={styles.shutterInner} />
                  </Pressable>
                ) : (
                  <Text style={styles.hint}>Align barcode in the frame</Text>
                )}
                <Pressable style={styles.cancelBtn} onPress={onClose}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  cameraRoot: { flex: 1, backgroundColor: "#000", justifyContent: "center" },
  card: {
    margin: spacing.lg,
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 18 },
  body: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: { color: colors.bg, fontFamily: "Outfit_700Bold" },
  ghost: { paddingVertical: 10, alignItems: "center" },
  ghostText: { color: colors.textMuted, fontFamily: "Outfit_700Bold" },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
    padding: spacing.lg,
    paddingTop: 52,
    paddingBottom: 36,
  },
  overlayTitle: {
    color: "#fff",
    fontFamily: "Outfit_700Bold",
    fontSize: 17,
    textAlign: "center",
  },
  modeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  modeChipOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  modeChipText: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 13 },
  modeChipTextOn: { color: colors.bg },
  frame: {
    alignSelf: "center",
    width: "80%",
    height: 140,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 12,
  },
  frameTall: {
    alignSelf: "center",
    width: "78%",
    height: 220,
    borderWidth: 2,
    borderColor: "rgba(196,245,66,0.55)",
    borderRadius: 16,
  },
  bottom: { alignItems: "center", gap: 14 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
  },
  hint: { color: "#fff", fontFamily: "Outfit_500Medium", fontSize: 14 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  cancelText: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 15 },
});
