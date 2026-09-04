import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { colors, spacing } from "../theme/colors";

type Props = {
  visible: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
};

export function BarcodeScannerModal({ visible, onClose, onScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (visible) setLocked(false);
  }, [visible]);

  useEffect(() => {
    if (visible && permission && !permission.granted) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  function onBarcode(result: BarcodeScanningResult) {
    if (locked) return;
    const raw = result.data?.trim();
    if (!raw || raw.length < 8) return;
    setLocked(true);
    onScan(raw);
    onClose();
  }

  if (Platform.OS === "web") {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.wrap}>
          <View style={styles.card}>
            <Text style={styles.title}>Barcode scan</Text>
            <Text style={styles.body}>Camera scan is Android/iOS only — type the barcode instead.</Text>
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
            <Text style={styles.body}>Forge needs the camera to scan product barcodes.</Text>
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
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "qr"],
              }}
              onBarcodeScanned={locked ? undefined : onBarcode}
            />
            <View style={styles.overlay}>
              <Text style={styles.overlayTitle}>Scan barcode</Text>
              <View style={styles.frame} />
              <Pressable style={styles.btn} onPress={onClose}>
                <Text style={styles.btnText}>Cancel</Text>
              </Pressable>
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
    paddingTop: 56,
    paddingBottom: 48,
  },
  overlayTitle: {
    color: "#fff",
    fontFamily: "Outfit_700Bold",
    fontSize: 18,
    textAlign: "center",
  },
  frame: {
    alignSelf: "center",
    width: "80%",
    height: 160,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 12,
  },
});
