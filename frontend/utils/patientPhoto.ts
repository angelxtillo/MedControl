import * as ImagePicker from 'expo-image-picker';

// Selección de la foto de un paciente desde la galería. Devuelve un data URI
// listo para enviar al backend, o null si el usuario canceló.
export async function pickPatientPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.5,
    base64: true,
  });

  if (!result.canceled && result.assets[0].base64) {
    return `data:image/jpeg;base64,${result.assets[0].base64}`;
  }
  return null;
}
