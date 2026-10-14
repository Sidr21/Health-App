/** Picking a lab report or doctor's document and sending it to the backend to be read. */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";

import { api, errorText, type UploadFile } from "@/lib/api";

export type PickSource = "file" | "library" | "camera";

const IMAGE_OPTS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  quality: 0.7, // re-encodes as JPEG and keeps each page well under the 5 MB limit
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

async function pick(source: PickSource): Promise<UploadFile[] | null> {
  if (source === "file") {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (res.canceled) return null;
    const a = res.assets[0];
    return [{ uri: a.uri, name: a.name, type: a.mimeType ?? (a.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"), file: a.file }];
  }
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Camera access is off for Health (Settings › Health › Camera).");
  }
  const res =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(IMAGE_OPTS)
      : await ImagePicker.launchImageLibraryAsync({ ...IMAGE_OPTS, allowsMultipleSelection: true, selectionLimit: 20, orderedSelection: true });
  if (res.canceled) return null;
  return res.assets.map((a, i) => ({
    uri: a.uri,
    name: a.fileName ?? `page-${i + 1}.jpg`,
    type: a.mimeType ?? "image/jpeg",
    file: a.file,
  }));
}

/** Pick, upload and open the document's review screen. */
export function useDocumentUpload() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (source: PickSource) => {
      const files = await pick(source);
      return files ? api.uploadDocument(files) : null;
    },
    onSuccess: (doc) => {
      if (!doc) return;
      qc.invalidateQueries({ queryKey: ["documents"] });
      router.push(`/labs/doc/${doc.id}`);
    },
  });
  return { upload: m.mutate, pending: m.isPending, error: m.isError ? errorText(m.error) : null };
}
