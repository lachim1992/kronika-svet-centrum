export interface MapCamera {
  zoom: number;
  pan: { x: number; y: number };
}

/** SVG screen = zoom * (world + pan), translated by one shared parent group. */
export function mapCameraTransform(camera: MapCamera) {
  return `translate(${camera.pan.x * camera.zoom} ${camera.pan.y * camera.zoom}) scale(${camera.zoom})`;
}

/** Keep the world point under the anchor stationary while zoom changes. */
export function zoomMapCameraAt(camera: MapCamera, nextZoom: number, anchor: { x: number; y: number }): MapCamera {
  const shift = 1 / nextZoom - 1 / camera.zoom;
  return {
    zoom: nextZoom,
    pan: { x: camera.pan.x + anchor.x * shift, y: camera.pan.y + anchor.y * shift },
  };
}

/** Pinch zoom keeps its original world anchor and also follows the moving finger midpoint. */
export function pinchMapCameraAt(
  start: MapCamera,
  startCenter: { x: number; y: number },
  nextZoom: number,
  currentCenter: { x: number; y: number },
): MapCamera {
  const zoomed = zoomMapCameraAt(start, nextZoom, startCenter);
  return {
    zoom: nextZoom,
    pan: {
      x: zoomed.pan.x + (currentCenter.x - startCenter.x) / nextZoom,
      y: zoomed.pan.y + (currentCenter.y - startCenter.y) / nextZoom,
    },
  };
}
