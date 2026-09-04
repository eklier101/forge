import { useCallback, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { ActionButton } from "../src/components/ActionButton";
import { InAppCameraModal } from "../src/components/InAppCameraModal";
import { ScreenHeader, FlashBanner } from "../src/components/ScreenChrome";
import { getPreferences } from "../src/db/local";
import { apiFetch } from "../src/lib/api";
import { localToday } from "../src/lib/dates";
import { cancelPostWorkoutPhotoReminder } from "../src/lib/notifications";
import { colors, spacing } from "../src/theme/colors";

type PhotoMeta = {
  id: string;
  createdAt: string;
  note?: string;
  hasImage?: boolean;
};

/** Progress photo vault — in-app camera only; never writes to the system gallery unless you export. */
export default function ProgressPhotosScreen() {
  const router = useRouter();
  const [weightLb, setWeightLb] = useState<number | null>(null);
  const [units, setUnits] = useState<"lb" | "kg">("lb");
  const [photos, setPhotos] = useState<PhotoMeta[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [preview, setPreview] = useState<{ id: string; uri: string; createdAt: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"ok" | "warn">("ok");

  function flash(message: string, tone: "ok" | "warn" = "ok") {
    setMsgTone(tone);
    setMsg(message);
  }

  const load = useCallback(async () => {
    const prefs = await getPreferences();
    setUnits(prefs.units === "kg" ? "kg" : "lb");
    void apiFetch<{ latestWeight: { weight?: number; units?: string } | null }>(
      `/metrics/today?date=${localToday()}`,
    )
      .then((m) => {
        if (m.latestWeight?.weight != null) {
          const w = m.latestWeight.weight;
          const u = m.latestWeight.units ?? "lb";
          setWeightLb(u === "kg" ? w * 2.20462 : w);
        }
      })
      .catch(() => undefined);
    void apiFetch<{ photos: PhotoMeta[] }>("/media/progress-photos")
      .then((ph) => setPhotos(ph.photos ?? []))
      .catch(() => setPhotos([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function uploadBase64(base64: string) {
    setPhotoBusy(true);
    try {
      const weight =
        weightLb == null ? undefined : units === "kg" ? weightLb / 2.20462 : weightLb;
      await apiFetch("/media/progress-photos", {
        method: "POST",
        body: JSON.stringify({
          imageBase64: base64,
          note: "Progress",
          weight,
          units,
          weighedAt: new Date().toISOString(),
        }),
      });
      void cancelPostWorkoutPhotoReminder();
      flash("Saved in Forge (not your gallery)");
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Upload failed", "warn");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function openPreview(id: string, createdAt: string) {
    try {
      const res = await apiFetch<{ photo: { imageBase64: string; createdAt: string } }>(
        `/media/progress-photos/${id}`,
      );
      let uri = res.photo.imageBase64;
      if (!uri.startsWith("data:")) uri = `data:image/jpeg;base64,${uri}`;
      setPreview({ id, uri, createdAt: res.photo.createdAt ?? createdAt });
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not load photo", "warn");
    }
  }

  async function exportPhoto() {
    if (!preview) return;
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        flash("Sharing isn’t available on this device", "warn");
        return;
      }
      const raw = preview.uri.includes(",") ? preview.uri.split(",")[1]! : preview.uri;
      const path = `${FileSystem.cacheDirectory}forge-progress-${preview.id}.jpg`;
      await FileSystem.writeAsStringAsync(path, raw, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(path, {
        mimeType: "image/jpeg",
        dialogTitle: "Save or share progress photo",
        UTI: "public.jpeg",
      });
    } catch (e) {
      flash(e instanceof Error ? e.message : "Export failed", "warn");
    }
  }

  async function deletePhoto(id: string) {
    try {
      await apiFetch(`/media/progress-photos/${id}`, { method: "DELETE" });
      setPreview(null);
      flash("Deleted");
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Delete failed", "warn");
    }
  }

  return (
    <>
      <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader
          title="Progress photos"
          subtitle="In-app camera only. Stored in Forge — export when you want a copy on your phone."
          backLabel="Home"
          onBack={() => router.back()}
        />

        {msg ? <FlashBanner message={msg} tone={msgTone} /> : null}

        <View style={styles.card}>
          <Text style={styles.cardKicker}>PHOTO VAULT</Text>
          <Text style={styles.cardTitle}>Take a shot</Text>
          <ActionButton label="Open camera" loading={photoBusy} onPress={() => setCamOpen(true)} />
          {photos.length === 0 ? (
            <Text style={styles.hint}>No progress photos yet.</Text>
          ) : (
            photos.slice(0, 40).map((p) => (
              <Pressable key={p.id} style={styles.photoRow} onPress={() => void openPreview(p.id, p.createdAt)}>
                <Text style={styles.photoRowText}>
                  {p.createdAt.slice(0, 16).replace("T", " ")}
                  {p.note ? ` · ${p.note}` : ""}
                </Text>
                <Text style={styles.photoLink}>View</Text>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      <InAppCameraModal
        visible={camOpen}
        initialMode="food"
        modes={["food"]}
        title="Progress photo"
        onClose={() => setCamOpen(false)}
        onCapture={({ base64 }) => void uploadBase64(base64)}
      />

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={styles.previewWrap}>
          <View style={styles.previewCard}>
            {preview ? (
              <Image source={{ uri: preview.uri }} style={styles.previewImg} resizeMode="contain" />
            ) : null}
            <Text style={styles.hint}>{preview?.createdAt.slice(0, 19).replace("T", " ")}</Text>
            <ActionButton label="Save / share to phone" onPress={() => void exportPhoto()} />
            <ActionButton
              label="Delete"
              variant="ghost"
              onPress={() => preview && void deletePhoto(preview.id)}
            />
            <Pressable onPress={() => setPreview(null)} style={{ paddingVertical: 8 }}>
              <Text style={styles.photoLink}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 64 },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardKicker: {
    color: colors.accent,
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    letterSpacing: 1,
  },
  cardTitle: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 17 },
  hint: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
  photoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  photoRowText: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 13, flex: 1 },
  photoLink: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 13 },
  previewWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  previewCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.sm,
    maxHeight: "90%",
  },
  previewImg: { width: "100%", height: 360, borderRadius: 12, backgroundColor: "#000" },
});
