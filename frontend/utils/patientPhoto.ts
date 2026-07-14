import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Lado del cuadrado final; el avatar se muestra a 120px como máximo.
const PHOTO_SIZE = 512;

// Selección de la foto de un paciente desde la galería. Devuelve un data URI
// JPEG cuadrado de PHOTO_SIZE px listo para enviar al backend, o null si el
// usuario canceló.
//
// No usamos allowsEditing: en Android el recorte lo hace una actividad externa
// que falla silenciosamente con ciertos archivos (p. ej. capturas PNG) y
// devuelve la imagen original sin recortar. En su lugar recortamos nosotros:
// crop cuadrado centrado + resize + compresión JPEG, idéntico para cualquier
// formato u origen.
export async function pickPatientPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
  });

  if (result.canceled) return null;
  const asset = result.assets[0];

  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > 0 && asset.height > 0) {
    const side = Math.min(asset.width, asset.height);
    context.crop({
      originX: Math.floor((asset.width - side) / 2),
      originY: Math.floor((asset.height - side) / 2),
      width: side,
      height: side,
    });
    // No agrandar imágenes que ya son más pequeñas que el objetivo.
    const target = Math.min(side, PHOTO_SIZE);
    context.resize({ width: target, height: target });
  } else {
    // Sin dimensiones conocidas no se puede centrar el crop; al menos limitar
    // el ancho conservando la proporción.
    context.resize({ width: PHOTO_SIZE });
  }

  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.7,
    base64: true,
  });
  return `data:image/jpeg;base64,${saved.base64}`;
}
